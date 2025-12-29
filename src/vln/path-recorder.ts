/**
 * VLN 路径记录器
 * 
 * 负责按指定帧率捕获相机位姿，管理录制状态
 */

import { Quat } from 'playcanvas';

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
        // 监听录制开始事件
        this.events.on(VLNEventNames.RECORDING_STARTED, () => {
            this.start();
        });

        // 监听录制暂停事件
        this.events.on(VLNEventNames.RECORDING_PAUSED, () => {
            this.pause();
        });

        // 监听录制恢复事件
        this.events.on(VLNEventNames.RECORDING_RESUMED, () => {
            this.resume();
        });

        // 监听录制停止事件
        this.events.on(VLNEventNames.RECORDING_STOPPED, () => {
            this.stop();
        });

        // 监听指令索引变化
        this.events.on('vln.instruction.indexChanged', (index: number) => {
            this.setCurrentInstructionIndex(index);
        });

        // 监听帧率变更（来自 UI）
        this.events.on('vln.recorder.setFrameRate', (frameRate: number) => {
            this.setFrameRate(frameRate);
        });

        // 注册函数接口
        this.events.function('vln.recorder.status', () => this.status);
        this.events.function('vln.recorder.frames', () => this.frames);
        this.events.function('vln.recorder.frameCount', () => this.frames.length);
        this.events.function('vln.recorder.duration', () => this.getDuration());
    }

    private sanitizeFrameRate(frameRate: number): number | null {
        if (!Number.isFinite(frameRate)) {
            return null;
        }

        const next = Math.round(frameRate);
        if (next < 1) {
            return null;
        }

        // 简单上限保护，避免误输入导致 interval 过小
        return Math.min(next, 240);
    }

    setFrameRate(frameRate: number): void {
        const next = this.sanitizeFrameRate(frameRate);
        if (next === null) {
            console.warn('VLN: PathRecorder.setFrameRate - invalid value', frameRate);
            return;
        }

        if (this.config.frameRate === next) {
            return;
        }

        this.config.frameRate = next;

        // 如果正在录制，则立刻按新帧率重启定时器
        if (this.status === 'recording') {
            if (this.recordingTimer !== null) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }

            const interval = 1000 / this.config.frameRate;
            this.recordingTimer = window.setInterval(() => {
                this.captureFrame();
            }, interval);
        }
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

        console.log('VLN: PathRecorder.start - recording started');

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

        console.log('VLN: PathRecorder.pause - recording paused');

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

        console.log('VLN: PathRecorder.resume - recording resumed');

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
        console.log('VLN: PathRecorder.stop - recording stopped, frames:', this.frames.length);

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
     * 从 scene.camera 读取真实的相机位置、旋转和 FOV
     */
    private getCurrentCameraPose(): CameraPose {
        const camera = this.scene.camera;
        if (!camera || !camera.entity) {
            console.warn('VLN: PathRecorder - camera not available');
            return {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                fov: 60,
                timestamp: Date.now()
            };
        }

        // 获取相机世界位置
        const pos = camera.entity.getPosition();

        // 获取相机世界旋转（四元数）
        const rot = camera.entity.getRotation();

        // 获取 FOV
        const fov = camera.fov || 60;

        return {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
            fov: fov,
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
