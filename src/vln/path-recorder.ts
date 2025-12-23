/**
 * VLN 路径记录器
 * 
 * 负责按指定帧率捕获相机位姿，管理录制状态
 */

import { Events } from '../events';
import { Scene } from '../scene';
import {
    CameraPose,
    RecordedFrame,
    RecordingConfig,
    RecordingStatus,
    VLNEventNames,
    createDefaultRecordingConfig
} from './types';

/**
 * 路径记录器类
 */
class PathRecorder {
    private events: Events;
    private scene: Scene;
    
    // 录制配置
    private config: RecordingConfig;
    
    // 录制状态
    private status: RecordingStatus = 'idle';
    
    // 录制的帧
    private frames: RecordedFrame[] = [];
    
    // 录制开始时间
    private startTime: number = 0;
    
    // 录制定时器
    private recordingTimer: number | null = null;
    
    // 帧计数
    private frameIndex: number = 0;
    
    // 当前指令索引
    private currentInstructionIndex: number = 0;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.config = createDefaultRecordingConfig();
    }

    /**
     * 初始化路径记录器
     */
    initialize(): void {
        this.registerEvents();
        console.log('VLN: PathRecorder initialized');
    }

    /**
     * 销毁路径记录器
     */
    destroy(): void {
        this.stop();
        console.log('VLN: PathRecorder destroyed');
    }

    /**
     * 注册事件处理器
     */
    private registerEvents(): void {
        // 注册函数接口
        this.events.function('vln.recorder.status', () => this.status);
        this.events.function('vln.recorder.frames', () => this.frames);
        this.events.function('vln.recorder.frameCount', () => this.frames.length);
        this.events.function('vln.recorder.duration', () => this.getDuration());
    }

    // ========================================================================
    // 录制控制
    // ========================================================================

    /**
     * 开始录制
     */
    start(): void {
        if (this.status === 'recording') {
            console.warn('VLN: PathRecorder already recording');
            return;
        }

        // TODO: 实现录制开始逻辑
        console.log('VLN: PathRecorder.start - not fully implemented');

        this.status = 'recording';
        this.frames = [];
        this.frameIndex = 0;
        this.startTime = Date.now();

        // 开始录制定时器
        const interval = 1000 / this.config.frameRate;
        this.recordingTimer = window.setInterval(() => {
            this.captureFrame();
        }, interval);

        // 立即捕获第一帧
        this.captureFrame();
    }

    /**
     * 暂停录制
     */
    pause(): void {
        if (this.status !== 'recording') {
            return;
        }

        // TODO: 实现录制暂停逻辑
        console.log('VLN: PathRecorder.pause - not fully implemented');

        this.status = 'paused';
        
        if (this.recordingTimer !== null) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    /**
     * 恢复录制
     */
    resume(): void {
        if (this.status !== 'paused') {
            return;
        }

        // TODO: 实现录制恢复逻辑
        console.log('VLN: PathRecorder.resume - not fully implemented');

        this.status = 'recording';
        
        const interval = 1000 / this.config.frameRate;
        this.recordingTimer = window.setInterval(() => {
            this.captureFrame();
        }, interval);
    }

    /**
     * 停止录制
     */
    stop(): RecordedFrame[] {
        // TODO: 实现录制停止逻辑
        console.log('VLN: PathRecorder.stop - not fully implemented');

        this.status = 'stopped';
        
        if (this.recordingTimer !== null) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }

        return this.frames;
    }

    /**
     * 清空录制数据
     */
    clear(): void {
        this.stop();
        this.frames = [];
        this.frameIndex = 0;
        this.status = 'idle';
    }

    // ========================================================================
    // 帧捕获
    // ========================================================================

    /**
     * 捕获当前帧
     */
    private captureFrame(): void {
        // TODO: 实现帧捕获逻辑
        // 这里需要从 scene.camera 获取当前相机位姿
        
        const pose = this.getCurrentCameraPose();
        const timestamp = Date.now() - this.startTime;

        const frame: RecordedFrame = {
            index: this.frameIndex++,
            timestamp,
            pose,
            instructionIndex: this.config.autoTrackInstruction ? this.currentInstructionIndex : undefined
        };

        this.frames.push(frame);

        // 触发帧录制事件
        this.events.fire(VLNEventNames.RECORDING_FRAME, frame);

        // 检查最大录制时长
        if (this.config.maxDuration > 0 && this.getDuration() >= this.config.maxDuration) {
            this.stop();
            this.events.fire(VLNEventNames.RECORDING_STOPPED, { reason: 'max_duration' });
        }
    }

    /**
     * 获取当前相机位姿
     */
    private getCurrentCameraPose(): CameraPose {
        // TODO: 实现从场景相机获取位姿
        console.log('VLN: getCurrentCameraPose - not fully implemented');

        // 占位实现，返回默认值
        // 实际应该从 this.scene.camera 获取
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            fov: 60,
            timestamp: Date.now()
        };
    }

    // ========================================================================
    // 配置和状态
    // ========================================================================

    /**
     * 设置录制配置
     */
    setConfig(config: Partial<RecordingConfig>): void {
        this.config = {
            ...this.config,
            ...config
        };
    }

    /**
     * 获取录制配置
     */
    getConfig(): RecordingConfig {
        return { ...this.config };
    }

    /**
     * 获取录制状态
     */
    getStatus(): RecordingStatus {
        return this.status;
    }

    /**
     * 获取录制的帧
     */
    getFrames(): RecordedFrame[] {
        return [...this.frames];
    }

    /**
     * 获取录制时长（秒）
     */
    getDuration(): number {
        if (this.frames.length === 0) {
            return 0;
        }
        return (this.frames[this.frames.length - 1].timestamp) / 1000;
    }

    /**
     * 设置当前指令索引
     */
    setCurrentInstructionIndex(index: number): void {
        this.currentInstructionIndex = index;
    }
}

export { PathRecorder };
