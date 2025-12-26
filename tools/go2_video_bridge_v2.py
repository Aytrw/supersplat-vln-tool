#!/usr/bin/env python3
"""
GO2 视频桥接服务 v2

使用原生 GStreamer Python 绑定，不依赖 OpenCV 的 GStreamer 支持。

用法:
    python3 go2_video_bridge_v2.py --interface enp6s0 --port 9000

依赖:
    sudo apt install python3-gi gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
                     gstreamer1.0-plugins-bad gstreamer1.0-libav python3-gst-1.0
    pip install websockets Pillow
"""

import argparse
import asyncio
import base64
import io
import json
import signal
import sys
import threading
import time
from collections import deque
from typing import Optional, Set

import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstApp', '1.0')
from gi.repository import Gst, GstApp, GLib

from PIL import Image
import websockets
from websockets.server import serve

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

video_state = VideoState()
connected_clients: Set[websockets.WebSocketServerProtocol] = set()

# ============================================================================
# GStreamer Pipeline
# ============================================================================

class GO2VideoReceiver:
    def __init__(self, interface: str, jpeg_quality: int = 80):
        self.interface = interface
        self.jpeg_quality = jpeg_quality
        self.pipeline = None
        self.appsink = None
        self.running = False
        
    def build_pipeline(self) -> str:
        """构建 GStreamer pipeline"""
        # GO2 官方 H264 多播接收
        pipeline_str = (
            f"udpsrc address=230.1.1.1 port=1720 multicast-iface={self.interface} "
            f"! application/x-rtp,media=video,encoding-name=H264 "
            f"! rtph264depay ! h264parse ! avdec_h264 ! videoconvert "
            f"! video/x-raw,format=RGB "
            f"! appsink name=sink emit-signals=true sync=false max-buffers=2 drop=true"
        )
        return pipeline_str
    
    def on_new_sample(self, sink) -> Gst.FlowReturn:
        """处理新帧"""
        global video_state
        
        sample = sink.emit("pull-sample")
        if sample is None:
            return Gst.FlowReturn.ERROR
        
        buffer = sample.get_buffer()
        caps = sample.get_caps()
        
        # 获取视频尺寸
        struct = caps.get_structure(0)
        width = struct.get_int("width")[1]
        height = struct.get_int("height")[1]
        
        # 提取帧数据
        success, map_info = buffer.map(Gst.MapFlags.READ)
        if not success:
            return Gst.FlowReturn.ERROR
        
        try:
            # 转换为 PIL Image
            frame_data = bytes(map_info.data)
            image = Image.frombytes("RGB", (width, height), frame_data)
            
            # 编码为 JPEG
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
                
                # 计算 FPS
                video_state.frame_times.append(time.time())
                if len(video_state.frame_times) >= 2:
                    time_span = video_state.frame_times[-1] - video_state.frame_times[0]
                    if time_span > 0:
                        video_state.fps = (len(video_state.frame_times) - 1) / time_span
                
                # 每 30 帧打印一次状态
                if video_state.frame_id % 30 == 0:
                    print(f"[VideoCapture] Frame {video_state.frame_id}, {width}x{height}, FPS: {video_state.fps:.1f}")
                        
        finally:
            buffer.unmap(map_info)
        
        return Gst.FlowReturn.OK
    
    def on_bus_message(self, bus, message):
        """处理 GStreamer 总线消息"""
        t = message.type
        if t == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            print(f"[GStreamer] ERROR: {err.message}")
            print(f"[GStreamer] Debug: {debug}")
            video_state.connected = False
        elif t == Gst.MessageType.WARNING:
            err, debug = message.parse_warning()
            print(f"[GStreamer] WARNING: {err.message}")
        elif t == Gst.MessageType.EOS:
            print("[GStreamer] End of stream")
            video_state.connected = False
        elif t == Gst.MessageType.STATE_CHANGED:
            if message.src == self.pipeline:
                old, new, pending = message.parse_state_changed()
                print(f"[GStreamer] State: {old.value_nick} -> {new.value_nick}")
    
    def start(self) -> bool:
        """启动 pipeline"""
        pipeline_str = self.build_pipeline()
        print(f"[GStreamer] Pipeline:\n{pipeline_str}\n")
        
        try:
            self.pipeline = Gst.parse_launch(pipeline_str)
        except GLib.Error as e:
            print(f"[GStreamer] Failed to create pipeline: {e}")
            return False
        
        # 获取 appsink 并连接信号
        self.appsink = self.pipeline.get_by_name("sink")
        self.appsink.connect("new-sample", self.on_new_sample)
        
        # 监听总线消息
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self.on_bus_message)
        
        # 启动
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        if ret == Gst.StateChangeReturn.FAILURE:
            print("[GStreamer] Failed to start pipeline")
            return False
        
        self.running = True
        print("[GStreamer] Pipeline started, waiting for frames...")
        return True
    
    def stop(self):
        """停止 pipeline"""
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
            self.running = False
            print("[GStreamer] Pipeline stopped")

# ============================================================================
# GLib 主循环线程
# ============================================================================

glib_loop = None

def glib_thread_func():
    """运行 GLib 主循环"""
    global glib_loop
    glib_loop = GLib.MainLoop()
    print("[GLib] Main loop started")
    glib_loop.run()
    print("[GLib] Main loop exited")

# ============================================================================
# WebSocket 服务器
# ============================================================================

async def handle_client(websocket, path=None):
    """处理 WebSocket 客户端连接"""
    global connected_clients
    
    client_addr = websocket.remote_address
    print(f"[WebSocket] Client connected: {client_addr}")
    connected_clients.add(websocket)
    
    try:
        last_frame_id = -1
        
        while True:
            # 获取最新帧
            with video_state.lock:
                if video_state.latest_frame is None or video_state.frame_id == last_frame_id:
                    await asyncio.sleep(0.01)
                    continue
                
                frame_data = video_state.latest_frame
                frame_id = video_state.frame_id
                timestamp = video_state.timestamp
                fps = video_state.fps
            
            last_frame_id = frame_id
            
            # 发送帧
            message = {
                "type": "frame",
                "frameId": frame_id,
                "timestamp": timestamp,
                "fps": round(fps, 1),
                "size": len(frame_data),
                "data": base64.b64encode(frame_data).decode('utf-8')
            }
            
            await websocket.send(json.dumps(message))
            
            # 控制帧率，避免过载
            await asyncio.sleep(0.016)  # ~60fps max
            
    except websockets.exceptions.ConnectionClosed:
        print(f"[WebSocket] Client disconnected: {client_addr}")
    except Exception as e:
        print(f"[WebSocket] Error with client {client_addr}: {e}")
    finally:
        connected_clients.discard(websocket)

async def broadcast_status():
    """定期广播状态给所有客户端"""
    while True:
        await asyncio.sleep(1.0)
        
        if not connected_clients:
            continue
        
        status = {
            "type": "status",
            "connected": video_state.connected,
            "fps": round(video_state.fps, 1),
            "width": video_state.width,
            "height": video_state.height,
            "clients": len(connected_clients)
        }
        
        message = json.dumps(status)
        
        for client in list(connected_clients):
            try:
                await client.send(message)
            except:
                pass

async def main_async(port: int):
    """异步主函数"""
    print(f"[WebSocket] Starting server on ws://0.0.0.0:{port}")
    
    async with serve(handle_client, "0.0.0.0", port):
        # 启动状态广播任务
        asyncio.create_task(broadcast_status())
        
        # 永久运行
        await asyncio.Future()

# ============================================================================
# 主程序
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="GO2 Video Bridge v2")
    parser.add_argument("--interface", "-i", required=True, help="Network interface (e.g., enp6s0)")
    parser.add_argument("--port", "-p", type=int, default=9000, help="WebSocket server port")
    parser.add_argument("--quality", "-q", type=int, default=80, help="JPEG quality (1-100)")
    args = parser.parse_args()
    
    print("=" * 60)
    print("GO2 Video Bridge v2 (Native GStreamer)")
    print("=" * 60)
    print(f"Network interface: {args.interface}")
    print(f"WebSocket server:  ws://0.0.0.0:{args.port}")
    print(f"JPEG quality:      {args.quality}")
    print("=" * 60)
    
    # 启动 GLib 主循环线程
    glib_thread = threading.Thread(target=glib_thread_func, daemon=True)
    glib_thread.start()
    time.sleep(0.5)  # 等待主循环启动
    
    # 创建并启动视频接收器
    receiver = GO2VideoReceiver(args.interface, args.quality)
    if not receiver.start():
        print("[Main] Failed to start video receiver")
        sys.exit(1)
    
    # 设置信号处理
    def signal_handler(sig, frame):
        print("\n[Main] Shutting down...")
        receiver.stop()
        if glib_loop:
            glib_loop.quit()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 运行 WebSocket 服务器
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
