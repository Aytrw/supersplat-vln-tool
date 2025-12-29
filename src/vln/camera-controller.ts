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

    // GO2 auto-calibration (horizontal FOV)
    private readonly go2HorizontalFovDeg: number = 120;
    private go2AutoCalibrated: boolean = false;
    private userAdjustedFov: boolean = false;

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
        this.autoCalibrateGo2FovOnce();
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

        // 监听 FOV 设置事件（来自其他模块的指令）
        this.events.on(VLNEventNames.CAMERA_SET_FOV, (fov: number) => {
            this.userAdjustedFov = true;
            this.setFov(fov);
        });

        // 监听 FOV 变化事件（来自 UI 滑块拖动）
        this.events.on(VLNEventNames.FOV_CHANGE, (fov: number) => {
            this.userAdjustedFov = true;
            this.setFov(fov);
        });

        // 监听场景相机 FOV 变化（保持同步）
        this.events.on('camera.fov', (fov: number) => {
            // `camera.fov` 在 SuperSplat 内部是“长边FOV”（横屏时等价于水平FOV）
            // VLN 侧我们用“真实相机 FOV”（默认按垂直FOV理解）
            this.settings.fov = this.sceneFovToRealFov(fov);
            this.events.fire(VLNEventNames.FOV_CHANGED, this.settings.fov);
        });

        // 注册函数接口
        this.events.function('vln.camera.pose', () => this.getPose());
        this.events.function('vln.camera.settings', () => this.settings);
        this.events.function('vln.camera.motionMode', () => this.motionMode);
        this.events.function('vln.camera.fov', () => this.getFov());
    }

    // ========================================================================
    // GO2 HFOV Auto Calibration
    // ========================================================================

    private horizontalToVerticalFovDeg(horizontalFovDeg: number, aspect: number): number {
        const h = horizontalFovDeg * math.DEG_TO_RAD;
        const v = 2 * Math.atan(Math.tan(h * 0.5) / Math.max(1e-6, aspect));
        return v * math.RAD_TO_DEG;
    }

    private autoCalibrateGo2FovOnce(): void {
        // Apply only once on page entry, and never override user adjustments.
        if (this.go2AutoCalibrated) return;

        let attempts = 0;
        const maxAttempts = 120; // ~2s @ 60fps

        const tick = () => {
            if (this.go2AutoCalibrated) return;
            if (this.userAdjustedFov) return;

            // Wait until render target size is known (aspect stable)
            const aspectReady = this.events.invoke('camera.aspectReady');
            if (typeof aspectReady === 'boolean' && !aspectReady) {
                attempts++;
                if (attempts < maxAttempts) requestAnimationFrame(tick);
                return;
            }

            const aspect = this.getViewportAspect();
            // GO2 spec: 120° is horizontal FOV. Our setFov expects vertical FOV.
            const vertical = this.horizontalToVerticalFovDeg(this.go2HorizontalFovDeg, aspect);
            this.setFov(vertical);
            this.go2AutoCalibrated = true;

            // Notify user (non-blocking)
            this.events.fire('vln.camera.go2FovCalibrated', {
                horizontalFov: this.go2HorizontalFovDeg,
                verticalFov: vertical,
                aspect
            });
            try {
                this.events.invoke('showPopup', {
                    type: 'info',
                    header: 'FOV 已校准',
                    message: '已自动校准为宇树 GO2：水平FOV=120°（可手动调整，必要时可一键恢复）'
                });
            } catch {
                // ignore
            }
        };

        requestAnimationFrame(tick);
    }

    // ========================================================================
    // FOV Conversion (Real vertical FOV <-> Scene long-axis FOV)
    // ========================================================================

    private getViewportAspect(): number {
        const width = this.scene.targetSize?.width ?? 0;
        const height = this.scene.targetSize?.height ?? 0;
        return (width > 0 && height > 0) ? (width / height) : 1;
    }

    /**
     * 将“真实相机FOV（默认垂直FOV）”转换为 SuperSplat 场景相机使用的 FOV。
     * SuperSplat 在横屏时设置 `camera.horizontalFov = true`，此时 `camera.fov` 表示水平FOV。
     */
    private realFovToSceneFov(realVerticalFovDeg: number): number {
        const cameraComponent = this.scene.camera?.entity?.camera;
        if (!cameraComponent) {
            return realVerticalFovDeg;
        }

        const aspect = this.getViewportAspect();

        // 横屏：scene.fov 表示水平FOV，需要把垂直FOV换算成水平FOV
        if (cameraComponent.horizontalFov) {
            const vfov = realVerticalFovDeg * math.DEG_TO_RAD;
            const hfov = 2 * Math.atan(Math.tan(vfov * 0.5) * aspect);
            return hfov * math.RAD_TO_DEG;
        }

        // 竖屏：scene.fov 表示垂直FOV，直接使用
        return realVerticalFovDeg;
    }

    /**
     * 将 SuperSplat 场景相机 FOV（长边FOV）转换回“真实相机FOV（默认垂直FOV）”。
     */
    private sceneFovToRealFov(sceneFovDeg: number): number {
        const cameraComponent = this.scene.camera?.entity?.camera;
        if (!cameraComponent) {
            return sceneFovDeg;
        }

        const aspect = this.getViewportAspect();

        // 横屏：scene.fov 是水平FOV，要换算成垂直FOV
        if (cameraComponent.horizontalFov) {
            const hfov = sceneFovDeg * math.DEG_TO_RAD;
            const vfov = 2 * Math.atan(Math.tan(hfov * 0.5) / aspect);
            return vfov * math.RAD_TO_DEG;
        }

        // 竖屏：scene.fov 就是垂直FOV
        return sceneFovDeg;
    }

    // ========================================================================
    // 位姿控制
    // ========================================================================

    private getCurrentCameraDistanceFallback(): number {
        const current = this.events.invoke('camera.getPose') as any;
        if (current?.position && current?.target) {
            const p = current.position;
            const t = current.target;
            const dx = (t.x ?? 0) - (p.x ?? 0);
            const dy = (t.y ?? 0) - (p.y ?? 0);
            const dz = (t.z ?? 0) - (p.z ?? 0);
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (isFinite(d) && d > 1e-4) return d;
        }
        return 1;
    }

    private poseToScenePose(pose: CameraPose): { position: Vec3; target: Vec3 } {
        const position = new Vec3(pose.position.x, pose.position.y, pose.position.z);

        // 将 quaternion 解释为相机的世界旋转，并用它把“相机前方方向”转换到世界空间。
        const q = new Quat(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
        q.normalize();

        const forward = new Vec3(0, 0, -1);
        q.transformVector(forward, forward);

        // 目标点距离：沿用当前相机 distance，避免跳到极近/极远导致观感不一致。
        const distance = this.getCurrentCameraDistanceFallback();
        const target = position.clone().add(forward.mulScalar(distance));

        return { position, target };
    }

    private poseToSceneRollDeg(pose: CameraPose): number {
        // Derive roll (degrees) from quaternion by comparing its up vector against a no-roll reference.
        const q = new Quat(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
        q.normalize();

        const forward = new Vec3(0, 0, -1);
        const up = new Vec3(0, 1, 0);
        q.transformVector(forward, forward).normalize();
        q.transformVector(up, up).normalize();

        // Build reference basis with zero roll using WORLD_UP.
        const worldUp = new Vec3(0, 1, 0);
        const refRight = new Vec3().cross(forward, worldUp);
        if (refRight.length() < 1e-6) {
            // forward nearly parallel to worldUp, choose fallback
            refRight.cross(forward, new Vec3(1, 0, 0));
        }
        refRight.normalize();
        const refUp = new Vec3().cross(refRight, forward).normalize();

        // Signed angle around forward from refUp -> up
        const cross = new Vec3().cross(refUp, up);
        const sin = forward.dot(cross);
        const cos = math.clamp(refUp.dot(up), -1, 1);
        const rollRad = Math.atan2(sin, cos);
        return rollRad * math.RAD_TO_DEG;
    }

    /**
     * 设置相机位姿
     */
    setPose(pose: CameraPose, animate: boolean = true): void {
        if (animate && this.animationDuration > 0) {
            // 当前先复用 SuperSplat 的阻尼过渡（speed=1），避免自写插值引入旋转不一致。
            this.setImmediatePose(pose, 1);
            return;
        }

        this.setImmediatePose(pose, 0);
    }

    /**
     * 立即设置相机位姿（无动画）
     */
    private setImmediatePose(pose: CameraPose, speed: number): void {
        // FOV：VLN pose.fov 作为“真实相机FOV（默认垂直FOV）”处理
        if (pose.fov !== undefined) {
            this.setFov(pose.fov);
        }

        const scenePose = this.poseToScenePose(pose);
        const roll = this.poseToSceneRollDeg(pose);
        this.events.fire('camera.setPose', { ...scenePose, roll }, speed);

        // 广播给 VLN UI/其他模块
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
                this.setImmediatePose(targetPose, 0);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * 获取当前相机位姿
     */
    getPose(): CameraPose {
        const current6 = this.events.invoke('camera.getPose6dof') as any;
        if (current6?.position && current6?.rotation) {
            return {
                position: { x: current6.position.x, y: current6.position.y, z: current6.position.z },
                rotation: { x: current6.rotation.x, y: current6.rotation.y, z: current6.rotation.z, w: current6.rotation.w },
                fov: this.getFov()
            };
        }

        // Fallback to legacy pose (no reliable rotation)
        const current = this.events.invoke('camera.getPose') as any;
        if (current?.position) {
            return {
                position: { x: current.position.x, y: current.position.y, z: current.position.z },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                fov: this.getFov()
            };
        }

        return {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            fov: this.getFov()
        };
    }

    // ========================================================================
    // FOV 控制
    // ========================================================================

    /**
     * 设置相机 FOV
     * @param fov 视场角（度），范围 10-120
     */
    setFov(fov: number): void {
        // 这里的 fov 视为“真实相机FOV”（默认按垂直FOV理解）
        const realFov = math.clamp(fov, 10, 120);

        // 避免重复设置（按 realFov 比较）
        if (realFov === this.settings.fov) {
            return;
        }

        this.settings.fov = realFov;

        // 转换为场景相机实际使用的 FOV（横屏时为水平FOV）
        const sceneFov = this.realFovToSceneFov(realFov);

        // 调用 SuperSplat 原生的 FOV 设置事件
        this.events.fire('camera.setFov', sceneFov);

        // 通知其他 VLN 组件 FOV 已变化（广播 realFov，供 UI 显示）
        this.events.fire(VLNEventNames.FOV_CHANGED, realFov);
    }

    /**
     * 获取当前 FOV
     */
    getFov(): number {
        // VLN 侧对外暴露“真实相机FOV”（默认按垂直FOV理解）。
        // SuperSplat 场景相机的 `camera.fov` 在横屏时是水平FOV，需要换算回垂直FOV。
        const sceneFov = this.events.invoke('camera.fov');
        if (typeof sceneFov === 'number' && sceneFov > 0) {
            const real = this.sceneFovToRealFov(sceneFov);
            this.settings.fov = real;
            return real;
        }

        return this.settings.fov;
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
