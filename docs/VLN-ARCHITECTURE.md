# VLN 标注工具架构设计文档

## 1. 项目概述

基于 SuperSplat 构建的 VLN (Vision-and-Language Navigation) 数据集标注与评测工具，支持：
- 加载路径指示和初始位姿
- 设置初始视角为初始位姿
- 路径指示显示到文本框
- 相机运动控制
- 路径录制与存储
- 相机 FOV 设置

## 2. 目录结构

```
src/
├── vln/                          # VLN 核心模块 (新增)
│   ├── types.ts                  # VLN 相关类型定义
│   ├── vln-manager.ts            # VLN 功能核心管理器
│   ├── vln-events.ts             # VLN 事件注册
│   ├── path-recorder.ts          # 相机路径录制器
│   ├── path-visualizer.ts        # 路径3D可视化
│   ├── camera-controller.ts      # 相机运动控制器
│   └── data-loader.ts            # VLN 数据加载器
│
├── ui/
│   ├── vln/                      # VLN UI 组件 (新增)
│   │   ├── vln-panel.ts          # VLN 主面板
│   │   ├── vln-toolbar.ts        # VLN 工具栏
│   │   ├── path-info-box.ts      # 路径指示信息框
│   │   ├── recorder-controls.ts  # 录制控制组件
│   │   └── camera-settings.ts    # 相机设置组件
│   │
│   └── scss/
│       └── vln-panel.scss        # VLN 样式 (新增)
│
└── main.ts                       # 主入口 (修改，集成VLN)
```

## 3. 核心模块设计

### 3.1 类型定义 (`src/vln/types.ts`)

```typescript
// 相机位姿
interface CameraPose {
    position: Vec3;      // 位置
    rotation: Quat;      // 旋转四元数
    fov?: number;        // 可选的视角
    timestamp?: number;  // 时间戳
}

// 路径点
interface PathPoint extends CameraPose {
    id: number;          // 点ID
    instruction?: string; // 该点的导航指令
}

// VLN 任务数据
interface VLNTask {
    id: string;
    scene_id: string;
    start_pose: CameraPose;
    end_pose?: CameraPose;
    instructions: string[];
    path_points?: PathPoint[];
}

// 录制会话
interface RecordingSession {
    id: string;
    task_id?: string;
    start_time: number;
    frames: RecordedFrame[];
    status: 'recording' | 'paused' | 'stopped';
}

// 录制帧
interface RecordedFrame {
    timestamp: number;
    pose: CameraPose;
    instruction_index?: number;
}
```

### 3.2 VLN 管理器 (`src/vln/vln-manager.ts`)

核心职责：
- 管理 VLN 任务的加载和存储
- 协调各子模块的工作
- 维护当前任务状态

关键接口：
```typescript
class VLNManager {
    loadTask(taskData: VLNTask): void;
    getCurrentTask(): VLNTask | null;
    startRecording(): void;
    stopRecording(): RecordingSession;
    exportPath(format: 'json' | 'csv'): void;
    setCameraPose(pose: CameraPose): void;
}
```

### 3.3 路径记录器 (`src/vln/path-recorder.ts`)

核心职责：
- 按指定帧率捕获相机位姿
- 管理录制状态（开始/暂停/停止）
- 生成可导出的路径数据

### 3.4 相机控制器 (`src/vln/camera-controller.ts`)

核心职责：
- 设置相机到指定位姿
- 控制相机 FOV
- 相机动画过渡
- 相机运动模式切换

### 3.5 路径可视化器 (`src/vln/path-visualizer.ts`)

核心职责：
- 在3D场景中渲染路径线
- 显示路径点标记
- 高亮当前位置

## 4. UI 组件设计

### 4.1 VLN 主面板 (`src/ui/vln/vln-panel.ts`)

布局结构：
```
┌──────────────────────────────────┐
│ [VLN 导航标注]              [×] │  <- 面板头部
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ 任务信息                     │ │  <- 任务信息区
│ │ ID: task_001                 │ │
│ │ 场景: scene_abc              │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ 导航指令                     │ │  <- 指令显示区
│ │ ┌──────────────────────────┐ │ │
│ │ │ 1. 向前走到门口           │ │ │
│ │ │ 2. 左转进入客厅           │ │ │
│ │ │ 3. 走到沙发旁边           │ │ │
│ │ └──────────────────────────┘ │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ 相机设置                         │  <- 相机设置区
│ FOV: [====|====] 60°             │
│ [重置位姿] [跳转起点] [跳转终点] │
├──────────────────────────────────┤
│ 录制控制                         │  <- 录制控制区
│ [● 录制] [⏸ 暂停] [■ 停止]       │
│ 帧率: [30fps ▼]                  │
│ 已录制: 0 帧 | 0.0 秒             │
├──────────────────────────────────┤
│ [导入任务] [导出路径] [清空]     │  <- 操作按钮区
└──────────────────────────────────┘
```

### 4.2 VLN 工具栏 (`src/ui/vln/vln-toolbar.ts`)

放置在右侧工具栏，包含：
- VLN 面板开关按钮
- 快速录制按钮
- 路径可视化开关

## 5. 事件系统设计

### 5.1 VLN 事件列表

```typescript
// 任务相关
'vln.task.load'           // 加载任务
'vln.task.clear'          // 清空任务
'vln.task.loaded'         // 任务已加载

// 录制相关  
'vln.recording.start'     // 开始录制
'vln.recording.pause'     // 暂停录制
'vln.recording.resume'    // 恢复录制
'vln.recording.stop'      // 停止录制
'vln.recording.frame'     // 录制一帧

// 相机相关
'vln.camera.setPose'      // 设置相机位姿
'vln.camera.setFov'       // 设置相机FOV
'vln.camera.gotoStart'    // 跳转到起点
'vln.camera.gotoEnd'      // 跳转到终点

// 路径相关
'vln.path.show'           // 显示路径
'vln.path.hide'           // 隐藏路径
'vln.path.export'         // 导出路径

// UI 相关
'vlnPanel.visible'        // 面板可见性
'vlnPanel.toggleVisible'  // 切换面板可见性
```

## 6. 数据格式

### 6.1 VLN 任务输入格式 (JSON)

```json
{
    "id": "task_001",
    "scene_id": "scene_abc",
    "start_pose": {
        "position": [1.0, 1.5, 2.0],
        "rotation": [0, 0, 0, 1],
        "fov": 60
    },
    "end_pose": {
        "position": [5.0, 1.5, 8.0],
        "rotation": [0, 0.707, 0, 0.707]
    },
    "instructions": [
        "Walk forward to the door",
        "Turn left and enter the living room",
        "Walk to the sofa"
    ]
}
```

### 6.2 路径录制输出格式 (JSON)

```json
{
    "task_id": "task_001",
    "recording_id": "rec_20241223_001",
    "duration": 15.5,
    "frame_rate": 30,
    "frames": [
        {
            "timestamp": 0,
            "position": [1.0, 1.5, 2.0],
            "rotation": [0, 0, 0, 1],
            "fov": 60
        },
        // ... more frames
    ]
}
```

## 7. 集成方式

### 7.1 在 main.ts 中注册

```typescript
import { registerVLNEvents } from './vln/vln-events';

// 在初始化时调用
registerVLNEvents(events, scene);
```

### 7.2 在 EditorUI 中添加面板

```typescript
import { VLNPanel } from './vln/vln-panel';

// 在 EditorUI 构造函数中
const vlnPanel = new VLNPanel(events, tooltips);
canvasContainer.append(vlnPanel);
```

## 8. 快捷键设计

| 快捷键 | 功能 |
|--------|------|
| V | 切换 VLN 面板可见性 |
| Ctrl+R | 开始/停止录制 |
| Ctrl+Shift+R | 暂停/恢复录制 |
| Home | 跳转到起始位姿 |
| End | 跳转到结束位姿 |

## 9. 开发步骤

1. **Phase 1 - 框架搭建**
   - 创建类型定义
   - 创建空的模块文件和类
   - 创建 UI 组件框架
   - 集成到主应用

2. **Phase 2 - 核心功能**
   - 实现相机位姿设置
   - 实现 FOV 控制
   - 实现任务数据加载

3. **Phase 3 - 录制功能**
   - 实现路径录制
   - 实现录制控制
   - 实现数据导出

4. **Phase 4 - 可视化**
   - 实现路径渲染
   - 实现路径点标记
   - 实现动画播放

## 10. 接口预留

所有功能模块都预留以下接口模式：

```typescript
class SomeVLNModule {
    // 初始化接口
    initialize(): void { /* TODO */ }
    
    // 销毁接口  
    destroy(): void { /* TODO */ }
    
    // 主要功能接口（空实现，预留给后续填充）
    doSomething(): void {
        console.log('VLN: doSomething - not implemented');
    }
}
```

这样可以确保 UI 和框架先就绪，功能可以逐步接入。
