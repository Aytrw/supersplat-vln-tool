/**
 * VLN 相机控制器
 * 
 * 负责相机位姿设置、FOV控制、相机动画过渡等
 */

import { Vec3, Quat, math } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import {
    CameraPose,
    CameraSettings,
    CameraMotionMode,
    VLNEventNames
} from './types';

/**
 * 默认相机设置
 */
const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
    fov: 60,
    near: 0.1,
    far: 1000,
    moveSpeed: 5,
    rotationSensitivity: 0.3
};

/**
 * 相机控制器类
 */
class CameraController {
    private events: Events;
    private scene: Scene;
    
    // 相机设置
    private settings: CameraSettings;
    
    // 当前运动模式
    private motionMode: CameraMotionMode = 'free';
    
    // 动画相关
    private isAnimating: boolean = false;
    private animationDuration: number = 500; // 毫秒

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.settings = { ...DEFAULT_CAMERA_SETTINGS };
    }

    /**
     * 初始化相机控制器
     */
    initialize(): void {
        this.registerEvents();
        console.log('VLN: CameraController initialized');
    }

    /**
     * 销毁相机控制器
     */
    destroy(): void {
        console.log('VLN: CameraController destroyed');
    }

    /**
     * 注册事件处理器
     */
    private registerEvents(): void {
        // 监听相机位姿设置事件
        this.events.on(VLNEventNames.CAMERA_SET_POSE, (pose: CameraPose) => {
            this.setPose(pose);
        });

        // 监听 FOV 设置事件
        this.events.on(VLNEventNames.CAMERA_SET_FOV, (fov: number) => {
            this.setFov(fov);
        });

        // 注册函数接口
        this.events.function('vln.camera.pose', () => this.getPose());
        this.events.function('vln.camera.settings', () => this.settings);
        this.events.function('vln.camera.motionMode', () => this.motionMode);
    }

    // ========================================================================
    // 位姿控制
    // ========================================================================

    /**
     * 设置相机位姿
     */
    setPose(pose: CameraPose, animate: boolean = true): void {
        // TODO: 实现相机位姿设置逻辑
        console.log('VLN: CameraController.setPose - not fully implemented', pose);

        if (animate && this.animationDuration > 0) {
            this.animateToPose(pose);
        } else {
            this.setImmediatePose(pose);
        }
    }

    /**
     * 立即设置相机位姿（无动画）
     */
    private setImmediatePose(pose: CameraPose): void {
        // TODO: 实现立即设置位姿
        console.log('VLN: setImmediatePose - not fully implemented');

        // 设置 FOV
        if (pose.fov !== undefined) {
            this.setFov(pose.fov);
        }

        // 这里需要调用 scene.camera 的相关方法
        // 例如:
        // const camera = this.scene.camera;
        // camera.entity.setPosition(pose.position.x, pose.position.y, pose.position.z);
        // camera.entity.setRotation(new Quat(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w));

        this.events.fire(VLNEventNames.CAMERA_POSE_SET, pose);
    }

    /**
     * 动画过渡到目标位姿
     */
    private animateToPose(targetPose: CameraPose): void {
        // TODO: 实现动画过渡
        console.log('VLN: animateToPose - not fully implemented');

        if (this.isAnimating) {
            // 取消当前动画
        }

        this.isAnimating = true;

        // 获取当前位姿
        const startPose = this.getPose();
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / this.animationDuration);
            
            // 使用缓动函数
            const easeT = this.easeInOutCubic(t);

            // 插值位置和旋转
            // TODO: 实现位置和旋转的插值

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
                this.setImmediatePose(targetPose);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * 获取当前相机位姿
     */
    getPose(): CameraPose {
        // TODO: 实现从场景相机获取位姿
        console.log('VLN: CameraController.getPose - not fully implemented');

        // 占位实现
        // 实际应该从 this.scene.camera 获取
        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            fov: this.settings.fov
        };
    }

    // ========================================================================
    // FOV 控制
    // ========================================================================

    /**
     * 设置相机 FOV
     */
    setFov(fov: number): void {
        // TODO: 实现 FOV 设置
        console.log('VLN: CameraController.setFov - not fully implemented', fov);

        // 限制 FOV 范围
        fov = math.clamp(fov, 10, 120);
        this.settings.fov = fov;

        // 调用现有的 FOV 设置事件
        this.events.fire('camera.setFov', fov);
    }

    /**
     * 获取当前 FOV
     */
    getFov(): number {
        // 从场景相机获取
        const sceneFov = this.events.invoke('camera.fov');
        return sceneFov ?? this.settings.fov;
    }

    // ========================================================================
    // 运动模式
    // ========================================================================

    /**
     * 设置运动模式
     */
    setMotionMode(mode: CameraMotionMode): void {
        // TODO: 实现运动模式切换
        console.log('VLN: setMotionMode - not fully implemented', mode);

        this.motionMode = mode;
        this.events.fire('vln.camera.motionModeChanged', mode);
    }

    /**
     * 获取运动模式
     */
    getMotionMode(): CameraMotionMode {
        return this.motionMode;
    }

    // ========================================================================
    // 设置管理
    // ========================================================================

    /**
     * 更新相机设置
     */
    updateSettings(settings: Partial<CameraSettings>): void {
        this.settings = {
            ...this.settings,
            ...settings
        };

        // 应用设置
        if (settings.fov !== undefined) {
            this.setFov(settings.fov);
        }

        // TODO: 应用其他设置
    }

    /**
     * 获取相机设置
     */
    getSettings(): CameraSettings {
        return { ...this.settings };
    }

    /**
     * 设置动画时长
     */
    setAnimationDuration(duration: number): void {
        this.animationDuration = duration;
    }

    // ========================================================================
    // 辅助函数
    // ========================================================================

    /**
     * 缓动函数 - easeInOutCubic
     */
    private easeInOutCubic(t: number): number {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * 线性插值
     */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /**
     * 向量插值
     */
    private lerpVec3(a: Vec3, b: Vec3, t: number, result: Vec3): Vec3 {
        result.x = this.lerp(a.x, b.x, t);
        result.y = this.lerp(a.y, b.y, t);
        result.z = this.lerp(a.z, b.z, t);
        return result;
    }
}

export { CameraController };
