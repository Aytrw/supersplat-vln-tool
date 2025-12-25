import { Vec3, Quat, math } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { VLNEventNames } from './types';

type ScenePose = { position: Vec3; target: Vec3 };

type SimplePose = {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
};

const WORLD_UP = new Vec3(0, 1, 0);

class FlyControls {
    private events: Events;
    private scene: Scene;

    private enabled = false;

    private keyDown = new Set<string>();

    private canvasTarget: HTMLElement | null = null;

    private looking = false;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private lookDx = 0;
    private lookDy = 0;

    private position = new Vec3(0, 0, 0);
    private target = new Vec3(0, 0, -1);

    private readonly baseLookSensitivityDegPerPx = 0.12;
    private readonly keyboardLookDegPerSec = 120;

    // Bound handlers (for remove)
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

        // 默认：任务加载后开启飞行，任务清空后关闭
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

    private isEditableTarget(target: EventTarget | null): boolean {
        const el = target as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if ((el as any).isContentEditable) return true;
        return false;
    }

    private getCurrentScenePose(): ScenePose {
        const pose = this.events.invoke('camera.getPose') as SimplePose | undefined;
        if (pose?.position && pose?.target) {
            return {
                position: new Vec3(pose.position.x, pose.position.y, pose.position.z),
                target: new Vec3(pose.target.x, pose.target.y, pose.target.z)
            };
        }

        // fallback
        return {
            position: this.position.clone(),
            target: this.target.clone()
        };
    }

    private setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled;

        this.keyDown.clear();
        this.looking = false;
        this.lookDx = 0;
        this.lookDy = 0;

        if (this.enabled) {
            const pose = this.getCurrentScenePose();
            this.position.copy(pose.position);
            this.target.copy(pose.target);
        }

        this.events.fire('vln.camera.flyMode', this.enabled);
    }

    private toggleEnabled(): void {
        this.setEnabled(!this.enabled);
    }

    private shouldHandleKey(key: string): boolean {
        // movement
        if (key === 'w' || key === 'a' || key === 's' || key === 'd') return true;
        if (key === 'q' || key === 'e') return true;
        if (key === ' ') return true;
        if (key === 'c') return true;

        // look (keyboard-only support)
        if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') return true;
        if (key === 'i' || key === 'j' || key === 'k' || key === 'l') return true;

        // speed modifiers
        if (key === 'shift' || key === 'control' || key === 'alt') return true;

        return false;
    }

    private handleKey(e: KeyboardEvent, down: boolean): void {
        // Toggle fly mode: V
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 避免在输入框里误触；但允许在空白区域随时切换
            if (down && !e.repeat && !this.isEditableTarget(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                this.toggleEnabled();
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

        // 右键拖拽：看向（避免触发原生 pan/orbit）
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();

            this.looking = true;
            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;

            // 同步一次 pose（避免从旧状态开始）
            const pose = this.getCurrentScenePose();
            this.position.copy(pose.position);
            this.target.copy(pose.target);
        }
    }

    private handlePointerMove(e: PointerEvent): void {
        if (!this.enabled) return;
        if (!this.looking) return;

        e.preventDefault();
        e.stopPropagation();

        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
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

    private getMoveSpeed(): number {
        const base = (this.events.invoke('camera.flySpeed') as number) || 5;

        let multiplier = 1;
        // 更“明显”的加速/减速（用户反馈 shift 不够快）
        if (this.keyDown.has('shift')) multiplier *= 10;
        // Ctrl 已被用作“下降”，减速改为 Alt
        if (this.keyDown.has('alt')) multiplier *= 0.2;

        return base * multiplier;
    }


    private update(dt: number): void {
        if (!this.enabled) return;

        // 若外部通过 camera.setPose 改了相机（例如 gotoStartPose），我们尽量跟随
        // 只有在“未按键 & 未 look”时才同步，避免抢控制。
        if (this.keyDown.size === 0 && Math.abs(this.lookDx) < 1e-6 && Math.abs(this.lookDy) < 1e-6) {
            const pose = this.getCurrentScenePose();
            this.position.copy(pose.position);
            this.target.copy(pose.target);
            return;
        }

        let changed = false;

        // compute basis
        const forward = this.target.clone().sub(this.position);
        let distance = forward.length();
        if (!isFinite(distance) || distance < 1e-4) {
            distance = 1;
            forward.set(0, 0, -1);
        } else {
            forward.mulScalar(1 / distance);
        }

        const right = new Vec3();
        right.cross(forward, WORLD_UP).normalize();
        if (!isFinite(right.x + right.y + right.z) || right.length() < 1e-4) {
            right.set(1, 0, 0);
        }

        const up = WORLD_UP.clone();

        // look (yaw/pitch)
        // 1) mouse (optional)
        let yaw = 0;
        let pitch = 0;

        if (this.lookDx !== 0 || this.lookDy !== 0) {
            yaw += -this.lookDx * this.baseLookSensitivityDegPerPx;
            pitch += -this.lookDy * this.baseLookSensitivityDegPerPx;

            this.lookDx = 0;
            this.lookDy = 0;
        }

        // 2) keyboard-only look (arrows / IJKL)
        const left = this.keyDown.has('arrowleft') || this.keyDown.has('j');
        const rightKey = this.keyDown.has('arrowright') || this.keyDown.has('l');
        const upKey = this.keyDown.has('arrowup') || this.keyDown.has('i');
        const downKey = this.keyDown.has('arrowdown') || this.keyDown.has('k');

        if (left || rightKey || upKey || downKey) {
            const yawAxis = (rightKey ? 1 : 0) - (left ? 1 : 0);
            const pitchAxis = (downKey ? 1 : 0) - (upKey ? 1 : 0);

            // 直觉方向：左=向左看，上=抬头
            yaw += -yawAxis * this.keyboardLookDegPerSec * dt;
            pitch += -pitchAxis * this.keyboardLookDegPerSec * dt;
        }

        if (yaw !== 0 || pitch !== 0) {
            const yawQ = new Quat().setFromAxisAngle(up, yaw);
            const pitchQ = new Quat().setFromAxisAngle(right, pitch);

            const q = new Quat();
            q.mul2(yawQ, pitchQ);

            q.transformVector(forward, forward);
            forward.normalize();

            // 避免接近竖直导致 right 不稳定
            const dotUp = math.clamp(forward.dot(up), -0.999, 0.999);
            if (Math.abs(dotUp) > 0.995) {
                forward.y = Math.sign(forward.y) * 0.995;
                forward.normalize();
            }

            this.target.copy(this.position).add(forward.mulScalar(distance));
            changed = true;
        }

        // movement
        const move = new Vec3(0, 0, 0);
        const w = this.keyDown.has('w') ? 1 : 0;
        const s = this.keyDown.has('s') ? 1 : 0;
        const a = this.keyDown.has('a') ? 1 : 0;
        const d = this.keyDown.has('d') ? 1 : 0;
        const qKey = this.keyDown.has('q') ? 1 : 0;
        const eKey = this.keyDown.has('e') ? 1 : 0;
        const spaceKey = this.keyDown.has(' ') ? 1 : 0;
        const cKey = this.keyDown.has('c') ? 1 : 0;
        const ctrlDownKey = this.keyDown.has('control') ? 1 : 0;

        const speed = this.getMoveSpeed();

        const kbUp = (eKey || spaceKey) ? 1 : 0;
        const kbDown = (qKey || cKey || ctrlDownKey) ? 1 : 0;

        const moveForward = (w - s);
        const moveRight = (d - a);
        const moveUpAxis = (kbUp - kbDown);

        if (moveForward || moveRight || moveUpAxis) {
            move.add(forward.clone().mulScalar(moveForward * speed * dt));
            move.add(right.clone().mulScalar(moveRight * speed * dt));
            move.add(up.clone().mulScalar(moveUpAxis * speed * dt));

            this.position.add(move);
            this.target.add(move);
            changed = true;
        }

        if (changed) {
            this.events.fire('camera.setPose', { position: this.position.clone(), target: this.target.clone() }, 0);
        }
    }
}

export { FlyControls };
