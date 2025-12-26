#!/usr/bin/env python3
"""
GO2 视频桥接服务

将 GO2 的 H264 UDP 多播视频流转换为 WebSocket JPEG 流，供浏览器使用。

用法:
    python go2_video_bridge.py --interface enp6s0 --port 9000

依赖:
    pip install opencv-python websockets asyncio
    
    OpenCV 需要 GStreamer 支持，推荐源码编译或使用：
    pip install opencv-python-headless  # 可能不含 GStreamer
    
    如果 OpenCV 没有 GStreamer 支持，需要源码编译 OpenCV
"""

import argparse
import asyncio
import base64
import json
import signal
import sys
import threading
import time
from collections import deque
from typing import Optional, Set

import cv2
import websockets
from websockets.server import serve

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
        
        # 帧率统计
        self.frame_times: deque = deque(maxlen=30)

video_state = VideoState()

# 已连接的 WebSocket 客户端
connected_clients: Set[websockets.WebSocketServerProtocol] = set()

# ============================================================================
# GStreamer 视频捕获线程
# ============================================================================

def build_gstreamer_pipeline(interface: str, width: int = 1280, height: int = 720) -> str:
    """构建 GStreamer pipeline 字符串"""
    # GO2 官方 H264 多播接收 pipeline
    pipeline = (
        f"udpsrc address=230.1.1.1 port=1720 multicast-iface={interface} "
        f"! application/x-rtp, media=video, encoding-name=H264 "
        f"! rtph264depay ! h264parse ! avdec_h264 ! videoconvert "
        f"! video/x-raw,width={width},height={height},format=BGR ! appsink drop=1"
    )
    return pipeline


def video_capture_thread(interface: str, jpeg_quality: int = 80):
    """视频捕获线程：从 GStreamer 读取帧，转换为 JPEG"""
    global video_state
    
    pipeline = build_gstreamer_pipeline(interface)
    print(f"[VideoCapture] Starting with pipeline:\n{pipeline}")
    
    cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
    
    if not cap.isOpened():
        print("[VideoCapture] ERROR: Failed to open VideoCapture")
        print("请确保：")
        print("  1. OpenCV 编译时启用了 WITH_GSTREAMER")
        print("  2. 已安装 gstreamer1.0-plugins-bad")
        print("  3. 网络接口名称正确")
        video_state.connected = False
        return
    
    video_state.connected = True
    print("[VideoCapture] Connected to GO2 video stream")
    
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
    
    while True:
        ret, frame = cap.read()
        
        if not ret or frame is None:
            time.sleep(0.01)
            continue
        
        # 编码为 JPEG
        success, jpeg_buffer = cv2.imencode('.jpg', frame, encode_params)
        if not success:
            continue
        
        jpeg_bytes = jpeg_buffer.tobytes()
        current_time = time.time()
        
        with video_state.lock:
            video_state.latest_frame = jpeg_bytes
            video_state.frame_id += 1
            video_state.timestamp = current_time
            
            # 计算 FPS
            video_state.frame_times.append(current_time)
            if len(video_state.frame_times) >= 2:
                duration = video_state.frame_times[-1] - video_state.frame_times[0]
                if duration > 0:
                    video_state.fps = (len(video_state.frame_times) - 1) / duration
    
    cap.release()
    video_state.connected = False


# ============================================================================
# WebSocket 服务器
# ============================================================================

async def handle_client(websocket: websockets.WebSocketServerProtocol):
    """处理单个 WebSocket 客户端连接"""
    global connected_clients
    
    client_addr = websocket.remote_address
    print(f"[WebSocket] Client connected: {client_addr}")
    connected_clients.add(websocket)
    
    try:
        # 发送初始状态
        await websocket.send(json.dumps({
            "type": "status",
            "connected": video_state.connected,
            "message": "Connected to GO2 video bridge"
        }))
        
        # 持续推送帧
        last_frame_id = -1
        
        while True:
            with video_state.lock:
                current_frame_id = video_state.frame_id
                frame_data = video_state.latest_frame
                timestamp = video_state.timestamp
                fps = video_state.fps
                connected = video_state.connected
            
            # 只在有新帧时发送
            if current_frame_id > last_frame_id and frame_data is not None:
                last_frame_id = current_frame_id
                
                # 发送帧数据（base64 编码）
                message = json.dumps({
                    "type": "frame",
                    "frameId": current_frame_id,
                    "timestamp": timestamp,
                    "fps": round(fps, 1),
                    "size": len(frame_data),
                    "data": base64.b64encode(frame_data).decode('ascii')
                })
                
                await websocket.send(message)
            
            # 控制推送频率（约 30fps）
            await asyncio.sleep(0.033)
            
    except websockets.exceptions.ConnectionClosed:
        print(f"[WebSocket] Client disconnected: {client_addr}")
    finally:
        connected_clients.discard(websocket)


async def broadcast_status():
    """定期广播状态给所有客户端"""
    while True:
        if connected_clients:
            status_msg = json.dumps({
                "type": "status",
                "connected": video_state.connected,
                "fps": round(video_state.fps, 1),
                "clients": len(connected_clients)
            })
            
            # 广播给所有客户端
            websockets.broadcast(connected_clients, status_msg)
        
        await asyncio.sleep(1.0)


async def start_server(host: str, port: int):
    """启动 WebSocket 服务器"""
    print(f"[WebSocket] Starting server on ws://{host}:{port}")
    
    async with serve(handle_client, host, port):
        # 同时运行状态广播任务
        broadcast_task = asyncio.create_task(broadcast_status())
        
        # 保持服务器运行
        await asyncio.Future()  # run forever


# ============================================================================
# 主函数
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="GO2 Video Bridge - WebSocket server for browser")
    parser.add_argument("--interface", "-i", type=str, required=True,
                        help="Network interface name (e.g., enp6s0, eth0)")
    parser.add_argument("--port", "-p", type=int, default=9000,
                        help="WebSocket server port (default: 9000)")
    parser.add_argument("--host", type=str, default="0.0.0.0",
                        help="WebSocket server host (default: 0.0.0.0)")
    parser.add_argument("--quality", "-q", type=int, default=80,
                        help="JPEG quality 1-100 (default: 80)")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("GO2 Video Bridge")
    print("=" * 60)
    print(f"Network interface: {args.interface}")
    print(f"WebSocket server:  ws://{args.host}:{args.port}")
    print(f"JPEG quality:      {args.quality}")
    print("=" * 60)
    
    # 启动视频捕获线程
    capture_thread = threading.Thread(
        target=video_capture_thread,
        args=(args.interface, args.quality),
        daemon=True
    )
    capture_thread.start()
    
    # 等待视频连接
    print("[Main] Waiting for video stream...")
    for _ in range(50):  # 最多等待 5 秒
        if video_state.connected:
            break
        time.sleep(0.1)
    
    if not video_state.connected:
        print("[Main] WARNING: Video not connected yet, but starting WebSocket server anyway")
    
    # 启动 WebSocket 服务器
    try:
        asyncio.run(start_server(args.host, args.port))
    except KeyboardInterrupt:
        print("\n[Main] Shutting down...")


if __name__ == "__main__":
    main()
