# GO2 机器人视角启动

## 1) 安装依赖（一次性）

```bash
sudo apt update
sudo apt install -y python3-gi python3-gst-1.0 gstreamer1.0-tools \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
  gstreamer1.0-libav

pip3 install --user websockets
```

## 2) 启动 GO2 视频桥接服务（v4，推荐）

```bash
cd /home/roxy/Projects/supersplat
python3 tools/go2_video_bridge.py --interface enp6s0 --port 9000 --quality 40 --scale 0.75
```

- `--interface` 替换为你的网卡名（例如 `enp6s0`）

## 3) 启动 SuperSplat 前端

```bash
cd /home/roxy/Projects/supersplat
npm run develop
```

## 4) 浏览器里连接

- 打开页面后，在右上角“机器人视角”面板点击“连接机器人”
