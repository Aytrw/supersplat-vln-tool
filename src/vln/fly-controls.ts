/**
 * VLN 飞行控制器
 * 
 * 基于 SuperSplat 的 azim/elev/roll 相机模型实现，确保与原生相机系统兼容。
 * 采用角度制避免累积误差，避免跳轴问题。
 */

import { Vec3, math } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { VLNEventNames } from './types';

// 从 azim/elev 计算 forward 向量（与 camera.ts 中的 calcForwardVec 完全一致）
const calcForwardVec = (azim: number, elev: number): Vec3 => {
    const ex = elev * math.DEG_TO_RAD;
    const ey = azim * math.DEG_TO_RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    return new Vec3(-c1 * s2, s1, c1 * c2);
};

// modulo 处理负数
const mod = (n: number, m: number) => ((n % m) + m) % m;

const WORLD_UP = new Vec3(0, 1, 0);
const EPS = 1e-6;

/**
 * 从相机位姿(position/target)计算 azim/elev（与 camera.ts 的 setPose 公式一致）。
 * 注意：这里的 forward = target - position（相机“朝向”方向）。
 */
const poseToAzimElev = (position: Vec3, target: Vec3): { azim: number; elev: number; distance: number } => {
    const forward = new Vec3().sub2(target, position);
    const l = forward.length();
    if (!isFinite(l) || l < EPS) {
        return { azim: 0, elev: 0, distance: 1 };
    }

    forward.mulScalar(1 / l);
    const azim = Math.atan2(-forward.x, -forward.z) * math.RAD_TO_DEG;
    const elev = Math.asin(math.clamp(forward.y, -1, 1)) * math.RAD_TO_DEG;

    return {
        azim: mod(azim, 360),
        elev: math.clamp(elev, -89.9, 89.9),
        distance: l
    };
};

class FlyControls {
    private events: Events;
    private scene: Scene;

    private enabled = false;
    private keyDown = new Set<string>();
    private canvasTarget: HTMLElement | null = null;

    // 鼠标 look 状态
    private looking = false;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private lookDx = 0;
    private lookDy = 0;

    // 内部状态：position/target/roll（与 camera.setPose 对齐），以及由其推导的 azim/elev
    private position = new Vec3(0, 0, 0);
    private target = new Vec3(0, 0, -1);
    private targetDistance = 1;

    // 由 position/target 推导出的角度（用于键盘/鼠标 look 增量）
    private azim = 0;      // 水平旋转角度
    private elev = 0;      // 仰角
    private rollDeg = 0;   // 翻滚角

    // 灵敏度设置
    private readonly mouseLookSensitivity = 0.3;  // 与 orbitSensitivity 一致
    private readonly keyboardLookDegPerSec = 90;
    private readonly rollDegPerSec = 90;

    // Bound handlers
    private onKeyDownCapture = (e: KeyboardEvent) => this.handleKey(e, true);
    private onKeyUpCapture = (e: KeyboardEvent) => this.handleKey(e, false);
    private onPointerDownCapture = (e: PointerEvent) => this.handlePointerDown(e);
    private onPointerMoveCapture = (e: PointerEvent) => this.handlePointerMove(e);
    private onPointerUpCapture = (e: PointerEvent) => this.handlePointerUp(e);
    private onWheelCapture = (e: WheelEvent) => this.handleWheel(e);
    private onContextMenuCapture = (e: Event) => this.handleContextMenu(e);

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
    }

    initialize(): void {
        this.canvasTarget = document.getElementById('canvas-container');

        document.addEventListener('keydown', this.onKeyDownCapture, true);
        document.addEventListener('keyup', this.onKeyUpCapture, true);

        if (this.canvasTarget) {
            this.canvasTarget.addEventListener('pointerdown', this.onPointerDownCapture, true);
            this.canvasTarget.addEventListener('pointermove', this.onPointerMoveCapture, true);
            this.canvasTarget.addEventListener('pointerup', this.onPointerUpCapture, true);
            this.canvasTarget.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false } as any);
            this.canvasTarget.addEventListener('contextmenu', this.onContextMenuCapture, true);
        }

        // 任务加载后开启飞行，任务清空后关闭
        this.events.on(VLNEventNames.TASK_LOADED, () => this.setEnabled(true));
        this.events.on(VLNEventNames.TASK_CLEARED, () => this.setEnabled(false));

        // 每帧更新
        this.scene.app.on('update', (dt: number) => this.update(dt));

        // 初始广播
        this.events.fire('vln.camera.flyMode', this.enabled);
    }

    destroy(): void {
        document.removeEventListener('keydown', this.onKeyDownCapture, true);
        document.removeEventListener('keyup', this.onKeyUpCapture, true);

        if (this.canvasTarget) {
            this.canvasTarget.removeEventListener('pointerdown', this.onPointerDownCapture, true);
            this.canvasTarget.removeEventListener('pointermove', this.onPointerMoveCapture, true);
            this.canvasTarget.removeEventListener('pointerup', this.onPointerUpCapture, true);
            this.canvasTarget.removeEventListener('wheel', this.onWheelCapture as any, true);
            this.canvasTarget.removeEventListener('contextmenu', this.onContextMenuCapture, true);
        }

        this.setEnabled(false);
    }

    // ========================================================================
    // 状态同步
    // ========================================================================

    /**
     * 从场景相机同步状态到内部变量
     */
    private syncFromCamera(): void {
        const camera = this.scene.camera;
        if (!camera) return;

        // 关键：使用 tween 的“当前值”，而不是 target（target 可能在阻尼过渡中尚未达到）
        const position = camera.entity.getPosition().clone();
        const fpv = camera.focalPointTween.value;
        const target = new Vec3(fpv.x, fpv.y, fpv.z);
        const roll = camera.rollTween.value.roll;

        this.position.copy(position);
        this.target.copy(target);
        this.rollDeg = isFinite(roll) ? roll : 0;

        const ae = poseToAzimElev(position, target);
        this.azim = ae.azim;
        this.elev = ae.elev;
        this.targetDistance = ae.distance;
    }

    /**
     * 将内部状态应用到场景相机
     */
    private applyToCamera(): void {
        // 使用 camera.setPose 设置位姿，dampingFactor = 0 立即生效
        this.events.fire('camera.setPose', {
            position: this.position.clone(),
            target: this.target.clone(),
            roll: this.rollDeg
        }, 0);
    }

    // ========================================================================
    // 启用/禁用
    // ========================================================================

    private setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled;

        this.keyDown.clear();
        this.looking = false;
        this.lookDx = 0;
        this.lookDy = 0;

        if (this.enabled) {
            this.syncFromCamera();
        }

        this.events.fire('vln.camera.flyMode', this.enabled);
    }

    private toggleEnabled(): void {
        this.setEnabled(!this.enabled);
    }

    // ========================================================================
    // 事件处理
    // ========================================================================

    private isEditableTarget(target: EventTarget | null): boolean {
        const el = target as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if ((el as any).isContentEditable) return true;
        return false;
    }

    private shouldHandleKey(key: string): boolean {
        // 移动
        if (key === 'w' || key === 'a' || key === 's' || key === 'd') return true;
        if (key === ' ') return true;  // 上升
        if (key === 'c') return true;  // 下降
        if (key === 'control') return true;  // 下降

        // 视角（键盘）
        if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') return true;
        if (key === 'i' || key === 'j' || key === 'k' || key === 'l') return true;

        // 翻滚
        if (key === 'q' || key === 'e' || key === 'z' || key === 'x') return true;

        // 速度修饰
        if (key === 'shift' || key === 'alt') return true;

        return false;
    }

    private handleKey(e: KeyboardEvent, down: boolean): void {
        const keyLower = e.key.toLowerCase();

        // V: 切换飞行模式
        if (keyLower === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (down && !e.repeat && !this.isEditableTarget(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleEnabled();
            }
            return;
        }

        // H: 切换提示（仅在飞行模式下）
        if (keyLower === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (this.enabled && down && !e.repeat && !this.isEditableTarget(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                this.events.fire('vln.flyHint.toggle');
            }
            return;
        }

        if (!this.enabled) return;
        if (this.isEditableTarget(e.target)) return;

        if (!this.shouldHandleKey(keyLower)) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // IJKL / 方向键 / QE 等“纯视角键”在首次按下时先同步一次，避免从旧状态累积导致跳轴
        if (down && !e.repeat) {
            const isLookKey = keyLower === 'arrowup' || keyLower === 'arrowdown' || keyLower === 'arrowleft' || keyLower === 'arrowright' ||
                keyLower === 'i' || keyLower === 'j' || keyLower === 'k' || keyLower === 'l';
            const isRollKey = keyLower === 'q' || keyLower === 'e' || keyLower === 'z' || keyLower === 'x';
            if (isLookKey || isRollKey) {
                this.syncFromCamera();
            }
        }

        if (down && !e.repeat) {
            this.events.fire('vln.camera.flyInput', { key: keyLower });
        }

        if (down) {
            this.keyDown.add(keyLower);
        } else {
            this.keyDown.delete(keyLower);
        }
    }

    private handlePointerDown(e: PointerEvent): void {
        if (!this.enabled) return;

        // 飞行模式下屏蔽原生 orbit/pan 的左/中键拖拽
        if (e.button === 0 || e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 右键拖拽：视角旋转
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();

            // 捕获指针，避免移出元素后 dx/dy 丢失或突变
            try {
                this.canvasTarget?.setPointerCapture?.(e.pointerId);
            } catch {
                // ignore
            }

            this.looking = true;
            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;

            // 同步一次状态
            this.syncFromCamera();
        }
    }

    private handlePointerMove(e: PointerEvent): void {
        if (!this.enabled) return;
        if (!this.looking) return;

        e.preventDefault();
        e.stopPropagation();

        // movementX/Y 在 pointer capture 时更稳定
        const dx = (typeof e.movementX === 'number' && isFinite(e.movementX)) ? e.movementX : (e.clientX - this.lastPointerX);
        const dy = (typeof e.movementY === 'number' && isFinite(e.movementY)) ? e.movementY : (e.clientY - this.lastPointerY);
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        this.lookDx += dx;
        this.lookDy += dy;
    }

    private handlePointerUp(e: PointerEvent): void {
        if (!this.enabled) return;
        if (e.button !== 2) return;

        e.preventDefault();
        e.stopPropagation();

        try {
            this.canvasTarget?.releasePointerCapture?.(e.pointerId);
        } catch {
            // ignore
        }

        this.looking = false;
    }

    private handleWheel(e: WheelEvent): void {
        if (!this.enabled) return;
        // 飞行模式下屏蔽原生缩放/旋转
        e.preventDefault();
        e.stopPropagation();
    }

    private handleContextMenu(e: Event): void {
        if (!this.enabled) return;
        // 右键用于 look，禁止弹出浏览器菜单
        e.preventDefault();
        e.stopPropagation();
    }

    // ========================================================================
    // 速度计算
    // ========================================================================

    private getMoveSpeed(): number {
        const base = (this.events.invoke('camera.flySpeed') as number) || 5;

        let multiplier = 1;
        if (this.keyDown.has('shift')) multiplier *= 5;
        if (this.keyDown.has('alt')) multiplier *= 0.2;

        return base * multiplier;
    }

    // ========================================================================
    // 主更新循环
    // ========================================================================

    private update(dt: number): void {
        if (!this.enabled) return;

        // 如果没有任何输入，持续从相机同步（允许外部控制）
        const hasInput = this.keyDown.size > 0 || this.looking || Math.abs(this.lookDx) > 0.1 || Math.abs(this.lookDy) > 0.1;
        if (!hasInput) {
            this.syncFromCamera();
            return;
        }

        let changed = false;
        let lookChanged = false;

        // ====== 视角旋转（azim/elev）======

        // 1) 鼠标输入
        if (this.lookDx !== 0 || this.lookDy !== 0) {
            // 与原生 orbit 一致的灵敏度
            this.azim -= this.lookDx * this.mouseLookSensitivity;
            this.elev -= this.lookDy * this.mouseLookSensitivity;

            this.lookDx = 0;
            this.lookDy = 0;
            changed = true;
            lookChanged = true;
        }

        // 2) 键盘输入 (方向键 / IJKL)
        const lookLeft = this.keyDown.has('arrowleft') || this.keyDown.has('j');
        const lookRight = this.keyDown.has('arrowright') || this.keyDown.has('l');
        const lookUp = this.keyDown.has('arrowup') || this.keyDown.has('i');
        const lookDown = this.keyDown.has('arrowdown') || this.keyDown.has('k');

        if (lookLeft || lookRight || lookUp || lookDown) {
            const yawAxis = (lookRight ? 1 : 0) - (lookLeft ? 1 : 0);
            const pitchAxis = (lookDown ? 1 : 0) - (lookUp ? 1 : 0);

            this.azim -= yawAxis * this.keyboardLookDegPerSec * dt;
            this.elev -= pitchAxis * this.keyboardLookDegPerSec * dt;
            changed = true;
            lookChanged = true;
        }

        // 规范化 azim 到 [0, 360)，限制 elev 到 [-90, 90]
        this.azim = mod(this.azim, 360);
        this.elev = math.clamp(this.elev, -89.9, 89.9);

        // ====== 翻滚（roll）======

        const rollLeft = this.keyDown.has('q') || this.keyDown.has('z');
        const rollRight = this.keyDown.has('e') || this.keyDown.has('x');
        const rollAxis = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);

        if (rollAxis !== 0) {
            this.rollDeg += rollAxis * this.rollDegPerSec * dt;
            // 规范化到 [-180, 180)
            this.rollDeg = mod(this.rollDeg + 180, 360) - 180;
            changed = true;
        }

        // 如果 look 发生变化：保持 position 不动，重建 target（roll 不影响 target）
        if (lookChanged) {
            const cameraToTarget = calcForwardVec(this.azim, this.elev).mulScalar(-1);
            if (cameraToTarget.length() < EPS) {
                cameraToTarget.set(0, 0, -1);
            } else {
                cameraToTarget.normalize();
            }
            const distance = isFinite(this.targetDistance) && this.targetDistance > EPS ? this.targetDistance : 1;
            this.target.copy(this.position).add(cameraToTarget.mulScalar(distance));
        }

        // ====== 移动 ======

        const w = this.keyDown.has('w') ? 1 : 0;
        const s = this.keyDown.has('s') ? 1 : 0;
        const a = this.keyDown.has('a') ? 1 : 0;
        const d = this.keyDown.has('d') ? 1 : 0;
        const spaceKey = this.keyDown.has(' ') ? 1 : 0;
        const cKey = this.keyDown.has('c') ? 1 : 0;
        const ctrlKey = this.keyDown.has('control') ? 1 : 0;

        const moveForwardAxis = w - s;
        const moveRightAxis = d - a;
        const moveUpAxis = spaceKey - (cKey || ctrlKey ? 1 : 0);

        if (moveForwardAxis || moveRightAxis || moveUpAxis) {
            const speed = this.getMoveSpeed();

            // WASD 移动基向量只依赖 yaw(azim)：避免 pitch 接近竖直导致 right 退化/翻转
            const forward = calcForwardVec(this.azim, 0).mulScalar(-1);
            forward.y = 0;
            if (forward.length() < EPS) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }

            // right = forward × up （右手系）
            const right = new Vec3().cross(forward, WORLD_UP);
            if (right.length() < EPS) {
                right.set(1, 0, 0);
            } else {
                right.normalize();
            }

            // up：世界坐标系 Y 轴（移动不受 roll 影响，避免“翻滚后上升变侧移”）
            const up = WORLD_UP;

            // 计算移动向量
            const move = new Vec3(0, 0, 0);
            move.add(forward.clone().mulScalar(moveForwardAxis * speed * dt));
            move.add(right.clone().mulScalar(moveRightAxis * speed * dt));
            move.add(up.clone().mulScalar(moveUpAxis * speed * dt));

            this.position.add(move);
            this.target.add(move);
            changed = true;
        }

        // ====== 应用到相机 ======

        if (changed) {
            this.applyToCamera();
        }
    }
}

export { FlyControls };
