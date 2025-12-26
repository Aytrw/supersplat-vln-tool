#!/usr/bin/env python3
"""
GO2 视频桥接服务 v4 - 超低延迟版本

使用 GStreamer 内置的 jpegenc 进行硬件加速编码，
完全避免 Python 端的图像处理开销。

用法:
    python3 go2_video_bridge_v4.py --interface enp6s0 --port 9000
"""

import argparse
import asyncio
import signal
import sys
import threading
import time
from collections import deque
from typing import Optional, Set

import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstApp', '1.0')
from gi.repository import Gst, GLib

import websockets
from websockets.server import serve

Gst.init(None)

# ============================================================================
# 全局状态 - 使用简单的共享变量
# ============================================================================

class VideoState:
    def __init__(self):
        self.latest_frame: Optional[bytes] = None
        self.frame_id: int = 0
        self.timestamp: float = 0
        self.lock = threading.Lock()
        self.frame_times: deque = deque(maxlen=30)

video_state = VideoState()
connected_clients: Set = set()

# ============================================================================
# GStreamer Pipeline - 使用内置 jpegenc
# ============================================================================

class GO2VideoReceiver:
    def __init__(self, interface: str, quality: int = 50, scale: float = 1.0):
        self.interface = interface
        self.quality = quality
        self.scale = scale
        self.pipeline = None
        self.running = False
        
    def build_pipeline(self) -> str:
        """使用 GStreamer 内置的 jpegenc"""
        width = int(1280 * self.scale)
        height = int(720 * self.scale)
        
        pipeline_str = (
            f"udpsrc address=230.1.1.1 port=1720 multicast-iface={self.interface} "
            f"! application/x-rtp,media=video,encoding-name=H264 "
            f"! rtph264depay ! h264parse ! avdec_h264 "
        )
        
        # 如果需要缩放
        if self.scale != 1.0:
            pipeline_str += f"! videoscale ! video/x-raw,width={width},height={height} "
        
        pipeline_str += (
            f"! videoconvert ! video/x-raw,format=I420 "
            f"! jpegenc quality={self.quality} "
            f"! appsink name=sink emit-signals=true sync=false max-buffers=1 drop=true"
        )
        return pipeline_str
    
    def on_new_sample(self, sink) -> Gst.FlowReturn:
        """处理新帧 - JPEG 已由 GStreamer 编码"""
        sample = sink.emit("pull-sample")
        if sample is None:
            return Gst.FlowReturn.ERROR
        
        buffer = sample.get_buffer()
        success, map_info = buffer.map(Gst.MapFlags.READ)
        if not success:
            return Gst.FlowReturn.ERROR
        
        try:
            jpeg_bytes = bytes(map_info.data)
            
            with video_state.lock:
                video_state.latest_frame = jpeg_bytes
                video_state.frame_id += 1
                video_state.timestamp = time.time()
                
                video_state.frame_times.append(time.time())
                
                if video_state.frame_id % 60 == 0:
                    if len(video_state.frame_times) >= 2:
                        fps = (len(video_state.frame_times) - 1) / (video_state.frame_times[-1] - video_state.frame_times[0])
                    else:
                        fps = 0
                    print(f"[Video] Frame {video_state.frame_id}, JPEG: {len(jpeg_bytes)//1024}KB, FPS: {fps:.1f}")
                        
        finally:
            buffer.unmap(map_info)
        
        return Gst.FlowReturn.OK
    
    def on_bus_message(self, bus, message):
        t = message.type
        if t == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            print(f"[GStreamer] ERROR: {err.message}")
        elif t == Gst.MessageType.STATE_CHANGED:
            if message.src == self.pipeline:
                old, new, _ = message.parse_state_changed()
                print(f"[GStreamer] State: {old.value_nick} -> {new.value_nick}")
    
    def start(self) -> bool:
        pipeline_str = self.build_pipeline()
        print(f"[GStreamer] Pipeline:\n{pipeline_str}\n")
        
        try:
            self.pipeline = Gst.parse_launch(pipeline_str)
        except GLib.Error as e:
            print(f"[GStreamer] Failed: {e}")
            return False
        
        self.pipeline.get_by_name("sink").connect("new-sample", self.on_new_sample)
        
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self.on_bus_message)
        
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        if ret == Gst.StateChangeReturn.FAILURE:
            return False
        
        self.running = True
        return True
    
    def stop(self):
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)

# ============================================================================
# WebSocket 服务器 - 异步非阻塞
# ============================================================================

async def handle_client(websocket):
    """处理客户端连接"""
    addr = websocket.remote_address
    print(f"[WS] Client connected: {addr}")
    connected_clients.add(websocket)
    
    last_frame_id = -1
    
    try:
        while True:
            # 非阻塞检查新帧
            frame_data = None
            frame_id = 0
            timestamp = 0.0
            
            with video_state.lock:
                if video_state.latest_frame and video_state.frame_id != last_frame_id:
                    frame_data = video_state.latest_frame
                    frame_id = video_state.frame_id
                    timestamp = video_state.timestamp
            
            if frame_data is None:
                await asyncio.sleep(0.005)  # 5ms 轮询
                continue
            
            last_frame_id = frame_id
            
            # 构建二进制消息
            import struct
            header = struct.pack('<I d f', frame_id, timestamp, 0.0)
            message = header + frame_data
            
            try:
                await websocket.send(message)
            except Exception:
                break
            
            # 短暂让出控制权
            await asyncio.sleep(0.001)
            
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[WS] Client disconnected: {addr}")

async def websocket_server(port: int):
    """WebSocket 服务器"""
    print(f"[WS] Starting server on ws://0.0.0.0:{port}")
    
    async with serve(handle_client, "0.0.0.0", port, 
                     max_size=5*1024*1024,
                     ping_interval=None,
                     ping_timeout=None):
        # 永久运行
        await asyncio.get_event_loop().create_future()

# ============================================================================
# GLib 主循环
# ============================================================================

glib_loop = None

def glib_main():
    global glib_loop
    glib_loop = GLib.MainLoop()
    glib_loop.run()

# ============================================================================
# 主程序
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="GO2 Video Bridge v4")
    parser.add_argument("--interface", "-i", required=True)
    parser.add_argument("--port", "-p", type=int, default=9000)
    parser.add_argument("--quality", "-q", type=int, default=50)
    parser.add_argument("--scale", "-s", type=float, default=1.0, help="Scale factor (0.5 = half resolution)")
    args = parser.parse_args()
    
    print("=" * 60)
    print("GO2 Video Bridge v4 - GStreamer JPEG Encoding")
    print("=" * 60)
    print(f"Interface: {args.interface}")
    print(f"Port:      {args.port}")
    print(f"Quality:   {args.quality}")
    print(f"Scale:     {args.scale}")
    print("=" * 60)
    
    # 启动 GLib 主循环
    glib_thread = threading.Thread(target=glib_main, daemon=True)
    glib_thread.start()
    time.sleep(0.3)
    
    # 启动视频接收器
    receiver = GO2VideoReceiver(args.interface, args.quality, args.scale)
    if not receiver.start():
        print("[Main] Failed to start video receiver")
        sys.exit(1)
    
    def signal_handler(sig, frame):
        print("\n[Main] Shutting down...")
        shutdown_event.set()
        receiver.stop()
        if glib_loop:
            glib_loop.quit()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 运行 WebSocket 服务器
    try:
        asyncio.run(websocket_server(args.port))
    except KeyboardInterrupt:
        pass
    finally:
        receiver.stop()
        if glib_loop:
            glib_loop.quit()

if __name__ == "__main__":
    main()
