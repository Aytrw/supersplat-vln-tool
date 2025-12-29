/**
 * FOV Indicator - HUD Element
 * 
 * Position: Bottom-Right
 * Content: Camera FOV display and quick adjustment
 */

import { Button, Container, Label, SelectInput } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { VLNEventNames } from '../../../vln/types';

type FovMasterMode = 'vertical' | 'horizontal';

type CameraIntrinsics = {
    fx: number;
    fy: number;
    width: number;
    height: number;
};

/**
 * FOV Indicator component
 */
class FOVIndicator extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private fovValue: Label;
    private sliderContainer: Container;
    private sliderThumb: Container;
    private modeSelect: SelectInput;
    private readout: Label;
    private go2CalibrateBtn: Button;
    
    // State
    // We treat `verticalFov` as the "real" camera FOV (vertical FOV in degrees)
    private verticalFov: number = 60;
    private readonly minVerticalFov: number = 10;
    private readonly maxVerticalFov: number = 120;

    // Master mode determines what the slider controls
    // Default to horizontal to match SuperSplat's native FOV in landscape.
    private masterMode: FovMasterMode = 'horizontal';

    private updatingModeSelect: boolean = false;

    // Current slider range (depends on masterMode + viewport aspect)
    private sliderMin: number = 10;
    private sliderMax: number = 120;

    // Optional intrinsics kept for potential future use (button removed per product spec)
    private intrinsics: CameraIntrinsics | null = null;
    private isDragging: boolean = false;
    private pendingResync: number | null = null;
    private resyncAttempts: number = 0;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            id: 'vln-fov-indicator',
            class: 'vln-hud-panel',
            ...args
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // Block pointer events
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.buildUI();
        this.registerEvents();
        this.setupSliderInteraction();
        
        // 初始化时同步当前场景 FOV
        this.syncInitialFov();
    }
    
    /**
     * 同步初始 FOV 值
     */
    private syncInitialFov(): void {
        // 延迟一帧确保场景已初始化
        requestAnimationFrame(() => {
            // Initialize from native SuperSplat camera state first so the initial numbers
            // match the built-in "视野角" control.
            const sceneFov = this.events.invoke('camera.fov');

            const aspect = this.getViewportAspect();
            const assumeHorizontal = aspect >= 1;
            // IMPORTANT: during initial load, PlayCanvas' camera.horizontalFov may still be at its default
            // (false) until render targets are rebuilt. SuperSplat's *intended* meaning for scene camera.fov
            // is "long-axis FOV", which corresponds to horizontal in landscape.
            // Therefore infer from aspect here to avoid the common startup mismatch (e.g. showing 126°).
            const sceneFovIsHorizontal = assumeHorizontal;

            // Always default to horizontal master mode (user request).
            this.setMasterMode('horizontal');

            if (typeof sceneFov === 'number' && sceneFov > 0) {
                // If sceneFov is horizontal, convert to vertical for internal storage.
                // This guarantees that when masterMode is horizontal, the displayed value matches sceneFov exactly.
                const vertical = sceneFovIsHorizontal
                    ? this.horizontalToVertical(sceneFov, aspect)
                    : sceneFov;
                this.setVerticalFov(vertical, false);

                // The viewport aspect may not be ready on first frame; resync after camera.resize or next tick.
                this.scheduleResyncFromSceneCamera();
                return;
            }

            // Fallback: VLN controller real (vertical) FOV
            const vlnFov = this.events.invoke('vln.camera.fov');
            if (typeof vlnFov === 'number' && vlnFov > 0) {
                this.setVerticalFov(vlnFov, false);
                this.scheduleResyncFromSceneCamera();
            }
        });
    }

    private scheduleResyncFromSceneCamera(): void {
        if (this.pendingResync !== null) return;
        if (this.resyncAttempts >= 20) return;
        this.resyncAttempts++;

        this.pendingResync = window.setTimeout(() => {
            this.pendingResync = null;
            this.resyncFromSceneCamera();
        }, 50);
    }

    private resyncFromSceneCamera(): void {
        if (this.isDragging) return;

        const sceneFov = this.events.invoke('camera.fov');
        if (!(typeof sceneFov === 'number' && sceneFov > 0)) return;

        const aspectReady = this.events.invoke('camera.aspectReady');
        if (typeof aspectReady === 'boolean' && !aspectReady) {
            // Try again once the engine reports a real target size.
            this.scheduleResyncFromSceneCamera();
            return;
        }

        // Once ready, stop retry limiting from blocking later updates.
        this.resyncAttempts = 0;

        const aspect = this.getViewportAspect();
        const sceneFovIsHorizontal = aspect >= 1;
        const vertical = sceneFovIsHorizontal ? this.horizontalToVertical(sceneFov, aspect) : sceneFov;
        this.setVerticalFov(vertical, false);
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // Mode row
        const modeRow = new Container({
            class: 'vln-fov-mode-row'
        });

        const modeLabel = new Label({
            text: '主控',
            class: 'vln-fov-mode-label'
        });

        this.modeSelect = new SelectInput({
            class: 'vln-fov-mode-select',
            prefix: '',
            options: [
                { v: 'vertical', t: '垂直FOV' },
                { v: 'horizontal', t: '水平FOV' }
            ],
            value: this.masterMode,
            onSelect: (value: string) => {
                if (this.updatingModeSelect) return;
                this.setMasterMode(value === 'horizontal' ? 'horizontal' : 'vertical');
            }
        });

        modeRow.append(modeLabel);
        modeRow.append(this.modeSelect);
        this.append(modeRow);

        // FOV controls row
        const fovRow = new Container({
            class: 'vln-fov-controls-row'
        });

        const fovLabel = new Label({
            text: 'FOV',
            class: 'vln-fov-label'
        });

        // Custom slider (for better styling control)
        this.sliderContainer = new Container({
            class: 'vln-fov-slider'
        });

        this.sliderThumb = new Container({
            class: 'vln-fov-slider-thumb'
        });
        this.sliderContainer.append(this.sliderThumb);

        // FOV value display
        this.fovValue = new Label({
            text: '60°',
            class: 'vln-fov-value'
        });

        fovRow.append(fovLabel);
        fovRow.append(this.sliderContainer);
        fovRow.append(this.fovValue);
        this.append(fovRow);

        // Readout (shows both v/h based on current viewport aspect)
        this.readout = new Label({
            text: '',
            class: 'vln-fov-readout'
        });
        this.append(this.readout);

        // GO2 calibration button (HFOV=120°)
        this.go2CalibrateBtn = new Button({
            text: '校准为GO2(120°水平)',
            class: 'vln-fov-calibrate-btn'
        });
        this.go2CalibrateBtn.on('click', () => this.calibrateToGo2());
        this.append(this.go2CalibrateBtn);

        // Update visual state
        this.updateSliderRange();
        this.updateUI();

        // Register tooltip
        this.tooltips.register(this.sliderContainer, '调整相机视角 (FOV)', 'top');
        this.tooltips.register(this.modeSelect, '选择主控FOV维度（另一维自动换算）', 'top');
        this.tooltips.register(this.go2CalibrateBtn, '一键恢复为宇树GO2：水平FOV=120°', 'top');
    }

    /**
     * Setup slider drag interaction
     */
    private setupSliderInteraction(): void {
        const sliderDom = this.sliderContainer.dom;

        const onPointerDown = (e: PointerEvent) => {
            e.preventDefault();
            this.isDragging = true;
            sliderDom.setPointerCapture(e.pointerId);
            this.updateFovFromPointer(e);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (this.isDragging) {
                e.preventDefault();
                this.updateFovFromPointer(e);
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            if (this.isDragging) {
                e.preventDefault();
                this.isDragging = false;
                sliderDom.releasePointerCapture(e.pointerId);
            }
        };

        sliderDom.addEventListener('pointerdown', onPointerDown);
        sliderDom.addEventListener('pointermove', onPointerMove);
        sliderDom.addEventListener('pointerup', onPointerUp);
        sliderDom.addEventListener('pointercancel', onPointerUp);
    }

    /**
     * Update FOV from pointer position
     */
    private updateFovFromPointer(e: PointerEvent): void {
        const rect = this.sliderContainer.dom.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        
        const newMasterFov = Math.round(this.sliderMin + percent * (this.sliderMax - this.sliderMin));
        this.setMasterFov(newMasterFov, true);
    }

    /**
     * Register events
     */
    private registerEvents(): void {
        // Listen for external FOV setting (VLN real/vertical FOV)
        this.events.on(VLNEventNames.FOV_CHANGED, (fov: number) => {
            this.setVerticalFov(fov, false);
        });

        // Capture task metadata (kept for potential future usage)
        this.events.on(VLNEventNames.TASK_LOADED, (task: any) => {
            this.intrinsics = this.extractIntrinsics(task?.metadata);
        });

        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.intrinsics = null;
        });

        // When the camera / render target resizes, the aspect ratio changes and v/h conversion must refresh.
        this.events.on('camera.resize', () => {
            this.resyncFromSceneCamera();
        });
    }

    private async showInfo(message: string): Promise<void> {
        try {
            await this.events.invoke('showPopup', {
                type: 'info',
                header: 'FOV 校准',
                message
            });
        } catch {
            // ignore (host may not provide popup)
        }
    }

    private calibrateToGo2(): void {
        // GO2 spec: HFOV=120°. In our UI, master horizontal means slider value equals horizontal FOV.
        this.setMasterMode('horizontal');
        this.setMasterFov(120, true);
        void this.showInfo('已校准为宇树 GO2：水平FOV=120°');
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Set FOV value
     */
    setFov(fov: number, fireEvent: boolean = true): void {
        // Backward-compatible API: treat as vertical FOV
        this.setVerticalFov(fov, fireEvent);
    }

    /**
     * Get current FOV
     */
    getFov(): number {
        return this.verticalFov;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Update display
     */
    private updateUI(): void {
        const master = this.getMasterFov();
        this.fovValue.text = `${Math.round(master)}°`;
        this.updateReadout();
        this.updateSliderVisual();
    }

    private updateReadout(): void {
        const aspect = this.getViewportAspect();
        const v = this.verticalFov;
        const h = this.verticalToHorizontal(v, aspect);
        this.readout.text = `v: ${Math.round(v)}°  h: ${Math.round(h)}°`;
    }

    /**
     * Update slider visual position
     */
    private updateSliderVisual(): void {
        const master = this.getMasterFov();
        const denom = (this.sliderMax - this.sliderMin) || 1;
        const percent = ((master - this.sliderMin) / denom) * 100;
        this.sliderContainer.dom.style.setProperty('--fov-percent', `${percent}%`);
    }

    private setMasterMode(mode: FovMasterMode): void {
        if (mode === this.masterMode) {
            return;
        }
        this.masterMode = mode;

        // Keep SelectInput UI in sync when mode changes programmatically.
        this.updatingModeSelect = true;
        try {
            (this.modeSelect as any).value = mode;
        } finally {
            this.updatingModeSelect = false;
        }

        this.updateSliderRange();
        this.updateUI();
    }

    private setVerticalFov(verticalFov: number, fireEvent: boolean = true): void {
        const clamped = Math.max(this.minVerticalFov, Math.min(this.maxVerticalFov, verticalFov));
        if (clamped === this.verticalFov) {
            return;
        }
        this.verticalFov = clamped;
        this.updateSliderRange();
        this.updateUI();

        if (fireEvent) {
            // Always emit vertical FOV; controller will convert to scene FOV
            this.events.fire(VLNEventNames.FOV_CHANGE, this.verticalFov);
        }
    }

    private setMasterFov(masterFov: number, fireEvent: boolean = true): void {
        const aspect = this.getViewportAspect();

        if (this.masterMode === 'vertical') {
            this.setVerticalFov(masterFov, fireEvent);
            return;
        }

        // master = horizontal -> convert to vertical then set
        const vertical = this.horizontalToVertical(masterFov, aspect);
        this.setVerticalFov(vertical, fireEvent);
    }

    private getMasterFov(): number {
        const aspect = this.getViewportAspect();
        return this.masterMode === 'vertical'
            ? this.verticalFov
            : this.verticalToHorizontal(this.verticalFov, aspect);
    }

    private updateSliderRange(): void {
        const aspect = this.getViewportAspect();

        if (this.masterMode === 'vertical') {
            this.sliderMin = this.minVerticalFov;
            this.sliderMax = this.maxVerticalFov;
            return;
        }

        // Horizontal slider range derived from vertical min/max
        this.sliderMin = this.verticalToHorizontal(this.minVerticalFov, aspect);
        this.sliderMax = this.verticalToHorizontal(this.maxVerticalFov, aspect);
    }

    private getViewportAspect(): number {
        // Prefer engine-known aspect (stable even before DOM settles)
        const aspectFromEngine = this.events.invoke('camera.aspect');
        if (typeof aspectFromEngine === 'number' && isFinite(aspectFromEngine) && aspectFromEngine > 0) {
            return aspectFromEngine;
        }

        // Fallback to DOM canvas
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (w > 0 && h > 0) {
            return w / h;
        }

        return 16 / 9;
    }

    private verticalToHorizontal(vDeg: number, aspect: number): number {
        const v = vDeg * Math.PI / 180;
        const h = 2 * Math.atan(Math.tan(v * 0.5) * aspect);
        return h * 180 / Math.PI;
    }

    private horizontalToVertical(hDeg: number, aspect: number): number {
        const h = hDeg * Math.PI / 180;
        const v = 2 * Math.atan(Math.tan(h * 0.5) / aspect);
        return v * 180 / Math.PI;
    }

    private extractIntrinsics(metadata: any): CameraIntrinsics | null {
        if (!metadata) return null;

        const direct = metadata.camera_intrinsics ?? metadata.intrinsics ?? metadata.cameraIntrinsics ?? metadata.camera;
        if (direct && typeof direct === 'object') {
            const fx = Number(direct.fx);
            const fy = Number(direct.fy);
            const width = Number(direct.width);
            const height = Number(direct.height);
            if (Number.isFinite(fx) && Number.isFinite(fy) && Number.isFinite(width) && Number.isFinite(height) && fx > 0 && fy > 0 && width > 0 && height > 0) {
                return { fx, fy, width, height };
            }
        }

        // K matrix variants: K can be 3x3 array or flat array length 9
        const K = metadata.K ?? metadata.k ?? metadata.intrinsic_matrix ?? metadata.intrinsics_matrix;
        const width = Number(metadata.width ?? metadata.image_width ?? metadata.w);
        const height = Number(metadata.height ?? metadata.image_height ?? metadata.h);
        if (K && width > 0 && height > 0) {
            let fx: number | null = null;
            let fy: number | null = null;
            if (Array.isArray(K) && K.length === 9) {
                fx = Number(K[0]);
                fy = Number(K[4]);
            } else if (Array.isArray(K) && Array.isArray(K[0]) && K[0].length >= 2) {
                fx = Number(K[0][0]);
                fy = Number(K[1][1]);
            }
            if (fx && fy && fx > 0 && fy > 0) {
                return { fx, fy, width, height };
            }
        }

        return null;
    }

}

export { FOVIndicator };
