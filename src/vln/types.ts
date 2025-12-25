/**
 * VLN (Vision-and-Language Navigation) 类型定义
 * 
 * 此文件定义了 VLN 标注工具所需的所有数据类型和接口
 */

import { Vec3, Quat } from 'playcanvas';

// ============================================================================
// 相机位姿相关类型
// ============================================================================

/**
 * 相机位姿数据
 */
export interface CameraPose {
    /** 相机位置 */
    position: { x: number; y: number; z: number };
    /** 相机旋转（四元数） */
    rotation: { x: number; y: number; z: number; w: number };
    /** 相机视角 FOV（可选） */
    fov?: number;
    /** 时间戳（可选） */
    timestamp?: number;
}

/**
 * 简化的相机位姿（用于导入导出）
 */
export interface CameraPoseSimple {
    /** 位置数组 [x, y, z] */
    position: [number, number, number];
    /** 旋转四元数数组 [x, y, z, w] */
    rotation: [number, number, number, number];
    /** 视角 FOV */
    fov?: number;
}

// ============================================================================
// 路径相关类型
// ============================================================================

/**
 * 路径点
 */
export interface PathPoint {
    /** 点 ID */
    id: number;
    /** 相机位姿 */
    pose: CameraPose;
    /** 该点对应的导航指令（可选） */
    instruction?: string;
    /** 指令索引（可选） */
    instructionIndex?: number;
}

/**
 * 路径数据
 */
export interface PathData {
    /** 路径 ID */
    id: string;
    /** 路径点列表 */
    points: PathPoint[];
    /** 总时长（秒） */
    duration?: number;
    /** 帧率 */
    frameRate?: number;
}

// ============================================================================
// VLN 任务相关类型
// ============================================================================

/**
 * VLN 任务数据
 */
export interface VLNTask {
    /** 任务 ID */
    id: string;
    /** 场景 ID */
    sceneId: string;
    /** 起始位姿 */
    startPose: CameraPose;
    /** 结束位姿（可选） */
    endPose?: CameraPose;
    /** 导航指令列表 */
    instructions: string[];
    /** 参考路径（可选） */
    referencePath?: PathData;
    /** 元数据 */
    metadata?: Record<string, unknown>;
}

/**
 * VLN 任务导入格式（JSON）
 */
export interface VLNTaskImport {
    id: string;
    scene_id: string;
    start_pose: CameraPoseSimple;
    end_pose?: CameraPoseSimple;
    instructions: string[];
    reference_path?: {
        points: Array<{
            position: [number, number, number];
            rotation: [number, number, number, number];
            instruction_index?: number;
        }>;
    };
    metadata?: Record<string, unknown>;
}

// ============================================================================
// 录制相关类型
// ============================================================================

/**
 * 录制状态
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

/**
 * 录制帧
 */
export interface RecordedFrame {
    /** 帧索引 */
    index: number;
    /** 时间戳（毫秒） */
    timestamp: number;
    /** 相机位姿 */
    pose: CameraPose;
    /** 当前指令索引（可选） */
    instructionIndex?: number;
}

/**
 * 录制会话
 */
export interface RecordingSession {
    /** 会话 ID */
    id: string;
    /** 关联的任务 ID（可选） */
    taskId?: string;
    /** 开始时间 */
    startTime: number;
    /** 结束时间（可选） */
    endTime?: number;
    /** 录制的帧 */
    frames: RecordedFrame[];
    /** 录制状态 */
    status: RecordingStatus;
    /** 帧率 */
    frameRate: number;
}

/**
 * 录制配置
 */
export interface RecordingConfig {
    /** 帧率（每秒帧数） */
    frameRate: number;
    /** 是否自动记录指令索引 */
    autoTrackInstruction: boolean;
    /** 最大录制时长（秒，0为无限制） */
    maxDuration: number;
}

// ============================================================================
// 导出相关类型
// ============================================================================

/**
 * 路径导出格式
 */
export type PathExportFormat = 'json' | 'csv' | 'txt';

/**
 * 路径导出数据（JSON格式）- 旧格式，保留兼容
 */
export interface PathExportJSON {
    /** 任务 ID */
    task_id?: string;
    /** 录制 ID */
    recording_id: string;
    /** 录制时间 */
    recorded_at: string;
    /** 总时长（秒） */
    duration: number;
    /** 帧率 */
    frame_rate: number;
    /** 总帧数 */
    total_frames: number;
    /** 帧数据 */
    frames: Array<{
        timestamp: number;
        position: [number, number, number];
        rotation: [number, number, number, number];
        fov?: number;
        instruction_index?: number;
    }>;
}

/**
 * VLN 路径录制导出格式（用户指定格式）
 * 
 * 包含完整的路径信息、轨迹矩阵、指令等
 */
export interface VLNPathExport {
    /** 标签：地图名/编号_日期_时间_标注者_id */
    label: string;
    /** 路径点坐标数组 [[x1,y1,z1], [x2,y2,z2], ...] */
    path_points: Array<[number, number, number]>;
    /** 轨迹变换矩阵数组（c2w格式，每个为 4x4 矩阵展平为 16 元素数组） */
    trajectory: Array<number[]>;
    /** 视频路径（预留，录制时为空） */
    videos: string[];
    /** 导航指令 */
    instructions: {
        /** 完整指令描述 */
        full_instruction: string;
        /** 分段指令 */
        splited_instruction: string[];
    };
    /** 人类轨迹（评测用，录制时为空） */
    human_trajectory: number[][];
    /** 轨迹评分（评测用，录制时为空对象） */
    trajectory_score: {
        success?: boolean;
        splited_success?: Record<string, boolean>;
        NE?: number;
        [key: string]: unknown;
    };
    /** 元数据 */
    metadata: {
        /** 录制时间 */
        recorded_at: string;
        /** 帧率 */
        frame_rate: number;
        /** 总帧数 */
        total_frames: number;
        /** 总时长（秒） */
        duration: number;
        /** 场景 ID */
        scene_id?: string;
        /** 任务 ID */
        task_id?: string;
        /** 标注者 */
        annotator?: string;
        /** 相机 FOV */
        fov?: number;
    };
}

// ============================================================================
// 相机控制相关类型
// ============================================================================

/**
 * 相机运动模式
 */
export type CameraMotionMode = 'free' | 'fly' | 'orbit' | 'path';

/**
 * 相机设置
 */
export interface CameraSettings {
    /** 视角 FOV */
    fov: number;
    /** 近裁剪面 */
    near: number;
    /** 远裁剪面 */
    far: number;
    /** 移动速度 */
    moveSpeed: number;
    /** 旋转灵敏度 */
    rotationSensitivity: number;
}

// ============================================================================
// 可视化相关类型
// ============================================================================

/**
 * 路径可视化配置
 */
export interface PathVisualizationConfig {
    /** 是否显示路径线 */
    showLine: boolean;
    /** 路径线颜色 */
    lineColor: { r: number; g: number; b: number; a: number };
    /** 路径线宽度 */
    lineWidth: number;
    /** 是否显示路径点 */
    showPoints: boolean;
    /** 路径点大小 */
    pointSize: number;
    /** 是否显示方向箭头 */
    showArrows: boolean;
    /** 是否显示起点标记 */
    showStartMarker: boolean;
    /** 是否显示终点标记 */
    showEndMarker: boolean;
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * VLN 事件名称
 */
export const VLNEventNames = {
    // 任务事件
    TASK_LOAD: 'vln.task.load',
    TASK_LOADED: 'vln.task.loaded',
    TASK_CLEAR: 'vln.task.clear',
    TASK_CLEARED: 'vln.task.cleared',
    
    // 录制事件
    RECORDING_START: 'vln.recording.start',
    RECORDING_STARTED: 'vln.recording.started',
    RECORDING_PAUSE: 'vln.recording.pause',
    RECORDING_PAUSED: 'vln.recording.paused',
    RECORDING_RESUME: 'vln.recording.resume',
    RECORDING_RESUMED: 'vln.recording.resumed',
    RECORDING_STOP: 'vln.recording.stop',
    RECORDING_STOPPED: 'vln.recording.stopped',
    RECORDING_FRAME: 'vln.recording.frame',
    
    // 相机事件
    CAMERA_SET_POSE: 'vln.camera.setPose',
    CAMERA_POSE_SET: 'vln.camera.poseSet',
    CAMERA_SET_FOV: 'vln.camera.setFov',
    CAMERA_GOTO_START: 'vln.camera.gotoStart',
    CAMERA_GOTO_END: 'vln.camera.gotoEnd',
    FOV_CHANGE: 'vln.camera.fovChange',
    FOV_CHANGED: 'vln.camera.fovChanged',
    
    // 路径事件
    PATH_SHOW: 'vln.path.show',
    PATH_HIDE: 'vln.path.hide',
    PATH_EXPORT: 'vln.path.export',
    PATH_CLEAR: 'vln.path.clear',
    
    // 指令事件
    INSTRUCTION_CHANGED: 'vln.instruction.changed',
    INSTRUCTION_SELECT: 'vln.instruction.select',
    
    // 面板事件
    PANEL_TOGGLE: 'vlnPanel.toggleVisible',
    PANEL_VISIBLE: 'vlnPanel.visible',
} as const;

// ============================================================================
// 工具函数类型
// ============================================================================

/**
 * 将简化的位姿转换为标准位姿
 */
export function poseFromSimple(simple: CameraPoseSimple): CameraPose {
    return {
        position: {
            x: simple.position[0],
            y: simple.position[1],
            z: simple.position[2]
        },
        rotation: {
            x: simple.rotation[0],
            y: simple.rotation[1],
            z: simple.rotation[2],
            w: simple.rotation[3]
        },
        fov: simple.fov
    };
}

/**
 * 将标准位姿转换为简化位姿
 */
export function poseToSimple(pose: CameraPose): CameraPoseSimple {
    return {
        position: [pose.position.x, pose.position.y, pose.position.z],
        rotation: [pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w],
        fov: pose.fov
    };
}

/**
 * 创建默认相机位姿
 */
export function createDefaultPose(): CameraPose {
    return {
        position: { x: 0, y: 1.6, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        fov: 60
    };
}

/**
 * 创建默认录制配置
 */
export function createDefaultRecordingConfig(): RecordingConfig {
    return {
        frameRate: 30,
        autoTrackInstruction: true,
        maxDuration: 0
    };
}

/**
 * 创建默认路径可视化配置
 */
export function createDefaultVisualizationConfig(): PathVisualizationConfig {
    return {
        showLine: true,
        lineColor: { r: 0.2, g: 0.6, b: 1.0, a: 1.0 },
        lineWidth: 2,
        showPoints: true,
        pointSize: 0.05,
        showArrows: true,
        showStartMarker: true,
        showEndMarker: true
    };
}

/**
 * 将四元数转换为 4x4 变换矩阵（c2w 格式）
 * 返回按行展平的 16 元素数组
 */
export function poseToTransformMatrix(pose: CameraPose): number[] {
    const { x: qx, y: qy, z: qz, w: qw } = pose.rotation;
    const { x: tx, y: ty, z: tz } = pose.position;

    // 四元数转旋转矩阵
    const xx = qx * qx;
    const yy = qy * qy;
    const zz = qz * qz;
    const xy = qx * qy;
    const xz = qx * qz;
    const yz = qy * qz;
    const wx = qw * qx;
    const wy = qw * qy;
    const wz = qw * qz;

    // 旋转矩阵元素
    const r00 = 1 - 2 * (yy + zz);
    const r01 = 2 * (xy - wz);
    const r02 = 2 * (xz + wy);
    const r10 = 2 * (xy + wz);
    const r11 = 1 - 2 * (xx + zz);
    const r12 = 2 * (yz - wx);
    const r20 = 2 * (xz - wy);
    const r21 = 2 * (yz + wx);
    const r22 = 1 - 2 * (xx + yy);

    // 4x4 变换矩阵（行优先）
    return [
        r00, r01, r02, tx,
        r10, r11, r12, ty,
        r20, r21, r22, tz,
        0,   0,   0,   1
    ];
}
