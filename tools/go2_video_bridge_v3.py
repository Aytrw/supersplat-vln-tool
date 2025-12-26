#!/usr/bin/env python3
"""
GO2 视频桥接服务 v3 - 低延迟版本

优化：
1. 使用 turbojpeg 加速 JPEG 编码
2. 使用二进制 WebSocket 传输（无 base64 开销）
3. 跳帧策略：只发送最新帧
4. 降低默认 JPEG 质量

用法:
    python3 go2_video_bridge_v3.py --interface enp6s0 --port 9000

依赖:
    sudo apt install python3-gi gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
                     gstreamer1.0-plugins-bad gstreamer1.0-libav python3-gst-1.0 \
                     libturbojpeg
    pip install websockets PyTurboJPEG numpy
"""

import argparse
import asyncio
import json
import signal
import sys
import threading
import time
from collections import deque
from typing import Optional, Set

import numpy as np
import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstApp', '1.0')
from gi.repository import Gst, GstApp, GLib

import websockets
from websockets.server import serve

# 尝试使用 TurboJPEG（更快），否则回退到 PIL
try:
    from turbojpeg import TurboJPEG, TJPF_RGB
    jpeg_encoder = TurboJPEG()
    USE_TURBOJPEG = True
    print("[Encoder] Using TurboJPEG (fast)")
except ImportError:
    from PIL import Image
    import io
    USE_TURBOJPEG = False
    print("[Encoder] TurboJPEG not available, using PIL (slower)")

# 初始化 GStreamer
Gst.init(None)

# ============================================================================
# 全局状态
# ============================================================================

class VideoState:
    def __init__(self):
        self.latest_frame: Optional[bytes] = None  # JPEG bytes
        self.frame_id: int = 0
        self.timestamp: float = 0
        self.fps: float = 0
        self.connected: bool = False
        self.lock = threading.Lock()
        self.frame_times: deque = deque(maxlen=30)
        self.width: int = 0
        self.height: int = 0
        self.new_frame_event = threading.Event()

video_state = VideoState()
connected_clients: Set[websockets.WebSocketServerProtocol] = set()

# ============================================================================
# GStreamer Pipeline
# ============================================================================

class GO2VideoReceiver:
    def __init__(self, interface: str, jpeg_quality: int = 60):
        self.interface = interface
        self.jpeg_quality = jpeg_quality
        self.pipeline = None
        self.appsink = None
        self.running = False
        
    def build_pipeline(self) -> str:
        """构建 GStreamer pipeline"""
        pipeline_str = (
            f"udpsrc address=230.1.1.1 port=1720 multicast-iface={self.interface} "
            f"! application/x-rtp,media=video,encoding-name=H264 "
            f"! rtph264depay ! h264parse ! avdec_h264 ! videoconvert "
            f"! video/x-raw,format=RGB "
            f"! appsink name=sink emit-signals=true sync=false max-buffers=1 drop=true"
        )
        return pipeline_str
    
    def on_new_sample(self, sink) -> Gst.FlowReturn:
        """处理新帧 - 优化版本"""
        global video_state
        
        sample = sink.emit("pull-sample")
        if sample is None:
            return Gst.FlowReturn.ERROR
        
        buffer = sample.get_buffer()
        caps = sample.get_caps()
        
        struct = caps.get_structure(0)
        width = struct.get_int("width")[1]
        height = struct.get_int("height")[1]
        
        success, map_info = buffer.map(Gst.MapFlags.READ)
        if not success:
            return Gst.FlowReturn.ERROR
        
        try:
            frame_data = bytes(map_info.data)
            
            # 使用 TurboJPEG 或 PIL 编码
            if USE_TURBOJPEG:
                # TurboJPEG - 更快
                img_array = np.frombuffer(frame_data, dtype=np.uint8).reshape((height, width, 3))
                jpeg_bytes = jpeg_encoder.encode(img_array, quality=self.jpeg_quality, pixel_format=TJPF_RGB)
            else:
                # PIL - 较慢但兼容
                image = Image.frombytes("RGB", (width, height), frame_data)
                jpeg_buffer = io.BytesIO()
                image.save(jpeg_buffer, format='JPEG', quality=self.jpeg_quality)
                jpeg_bytes = jpeg_buffer.getvalue()
            
            # 更新状态
            with video_state.lock:
                video_state.latest_frame = jpeg_bytes
                video_state.frame_id += 1
                video_state.timestamp = time.time()
                video_state.width = width
                video_state.height = height
                video_state.connected = True
                
                video_state.frame_times.append(time.time())
                if len(video_state.frame_times) >= 2:
                    time_span = video_state.frame_times[-1] - video_state.frame_times[0]
                    if time_span > 0:
                        video_state.fps = (len(video_state.frame_times) - 1) / time_span
                
                if video_state.frame_id % 60 == 0:
                    print(f"[Video] Frame {video_state.frame_id}, {width}x{height}, "
                          f"FPS: {video_state.fps:.1f}, JPEG: {len(jpeg_bytes)//1024}KB")
            
            # 通知等待的客户端
            video_state.new_frame_event.set()
                        
        finally:
            buffer.unmap(map_info)
        
        return Gst.FlowReturn.OK
    
    def on_bus_message(self, bus, message):
        t = message.type
        if t == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            print(f"[GStreamer] ERROR: {err.message}")
            video_state.connected = False
        elif t == Gst.MessageType.STATE_CHANGED:
            if message.src == self.pipeline:
                old, new, pending = message.parse_state_changed()
                print(f"[GStreamer] State: {old.value_nick} -> {new.value_nick}")
    
    def start(self) -> bool:
        pipeline_str = self.build_pipeline()
        print(f"[GStreamer] Pipeline:\n{pipeline_str}\n")
        
        try:
            self.pipeline = Gst.parse_launch(pipeline_str)
        except GLib.Error as e:
            print(f"[GStreamer] Failed to create pipeline: {e}")
            return False
        
        self.appsink = self.pipeline.get_by_name("sink")
        self.appsink.connect("new-sample", self.on_new_sample)
        
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self.on_bus_message)
        
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        if ret == Gst.StateChangeReturn.FAILURE:
            print("[GStreamer] Failed to start pipeline")
            return False
        
        self.running = True
        print("[GStreamer] Pipeline started")
        return True
    
    def stop(self):
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
            self.running = False

# ============================================================================
# GLib 主循环线程
# ============================================================================

glib_loop = None

def glib_thread_func():
    global glib_loop
    glib_loop = GLib.MainLoop()
    glib_loop.run()

# ============================================================================
# WebSocket 服务器 - 低延迟版本
# ============================================================================

async def handle_client(websocket, path=None):
    """处理 WebSocket 客户端 - 二进制传输"""
    global connected_clients
    
    client_addr = websocket.remote_address
    print(f"[WebSocket] Client connected: {client_addr}")
    connected_clients.add(websocket)
    
    try:
        last_frame_id = -1
        
        while True:
            # 快速轮询最新帧
            with video_state.lock:
                if video_state.latest_frame is None:
                    await asyncio.sleep(0.005)
                    continue
                
                # 跳过旧帧，只发送最新帧
                if video_state.frame_id == last_frame_id:
                    await asyncio.sleep(0.005)
                    continue
                
                frame_data = video_state.latest_frame
                frame_id = video_state.frame_id
                timestamp = video_state.timestamp
                fps = video_state.fps
            
            last_frame_id = frame_id
            
            # 发送二进制 JPEG 数据（前 16 字节是元数据头）
            # 格式: [frame_id: 4bytes][timestamp: 8bytes][fps: 4bytes][jpeg_data]
            import struct
            header = struct.pack('<I d f', frame_id, timestamp, fps)
            message = header + frame_data
            
            try:
                await websocket.send(message)
            except Exception as e:
                print(f"[WebSocket] Send error: {e}")
                break
            
            # 最小延迟等待
            await asyncio.sleep(0.001)
            
    except websockets.exceptions.ConnectionClosed:
        print(f"[WebSocket] Client disconnected: {client_addr}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
    finally:
        connected_clients.discard(websocket)

async def main_async(port: int):
    print(f"[WebSocket] Starting server on ws://0.0.0.0:{port}")
    
    async with serve(handle_client, "0.0.0.0", port, max_size=10*1024*1024):
        await asyncio.Future()

# ============================================================================
# 主程序
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="GO2 Video Bridge v3 - Low Latency")
    parser.add_argument("--interface", "-i", required=True, help="Network interface")
    parser.add_argument("--port", "-p", type=int, default=9000, help="WebSocket port")
    parser.add_argument("--quality", "-q", type=int, default=60, help="JPEG quality (1-100)")
    args = parser.parse_args()
    
    print("=" * 60)
    print("GO2 Video Bridge v3 - Low Latency")
    print("=" * 60)
    print(f"Network interface: {args.interface}")
    print(f"WebSocket server:  ws://0.0.0.0:{args.port}")
    print(f"JPEG quality:      {args.quality}")
    print(f"Encoder:           {'TurboJPEG' if USE_TURBOJPEG else 'PIL'}")
    print("=" * 60)
    
    # GLib 主循环
    glib_thread = threading.Thread(target=glib_thread_func, daemon=True)
    glib_thread.start()
    time.sleep(0.3)
    
    # 视频接收器
    receiver = GO2VideoReceiver(args.interface, args.quality)
    if not receiver.start():
        sys.exit(1)
    
    def signal_handler(sig, frame):
        print("\n[Main] Shutting down...")
        receiver.stop()
        if glib_loop:
            glib_loop.quit()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        asyncio.run(main_async(args.port))
    except KeyboardInterrupt:
        pass
    finally:
        receiver.stop()
        if glib_loop:
            glib_loop.quit()

if __name__ == "__main__":
    main()
