# SuperSplat VLN Tool 🧭

**A Vision-and-Language Navigation (VLN) Annotation & Evaluation Tool.**

This project is a secondary development based on the open-source [SuperSplat](https://github.com/playcanvas/supersplat) engine. It is designed to visualize 3D Gaussian Splatting scenes and record camera trajectories for VLN research.

## ✨ Key Features (核心功能)

* **Instruction Overlay:** Displays navigation instructions (e.g., "Walk past the red sofa...") directly on the HUD.
* **Trajectory Recorder:** Records camera pose (Position + Rotation) and FOV at 10Hz.
* **Format Export:** Automatically generates and downloads `.json` trajectory files upon stopping.
* **Custom UI:** Adds a recorder control bar and camera info panel.

## 🛠 Tech Stack (技术栈)

* **Core Engine:** PlayCanvas / SuperSplat
* **Rendering:** WebGL & 3D Gaussian Splatting
* **Language:** TypeScript / HTML / CSS

## 🚀 Getting Started (如何运行)

1. **Clone the repo**
   ```bash
   git clone [https://github.com/YOUR_USERNAME/supersplat-vln-tool.git](https://github.com/YOUR_USERNAME/supersplat-vln-tool.git)
   cd supersplat-vln-tool
