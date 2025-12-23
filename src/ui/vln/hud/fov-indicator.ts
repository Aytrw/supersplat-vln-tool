/**
 * FOV Indicator - HUD Element
 * 
 * Position: Bottom-Right
 * Content: Camera FOV display and quick adjustment
 */

import { Container, Label, SliderInput } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { VLNEventNames } from '../../../vln/types';

/**
 * FOV Indicator component
 */
class FOVIndicator extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private fovValue: Label;
    private sliderContainer: Container;
    private sliderTrack: Container;
    private sliderThumb: Container;
    
    // State
    private currentFov: number = 60;
    private minFov: number = 10;
    private maxFov: number = 120;
    private isDragging: boolean = false;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-fov-indicator',
            class: 'vln-hud-panel'
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
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // FOV label
        const fovLabel = new Label({
            text: 'FOV',
            class: 'vln-fov-label'
        });
        this.append(fovLabel);

        // Custom slider (for better styling control)
        this.sliderContainer = new Container({
            class: 'vln-fov-slider'
        });

        this.sliderThumb = new Container({
            class: 'vln-fov-slider-thumb'
        });
        this.sliderContainer.append(this.sliderThumb);

        this.append(this.sliderContainer);

        // FOV value display
        this.fovValue = new Label({
            text: '60°',
            class: 'vln-fov-value'
        });
        this.append(this.fovValue);

        // Update visual state
        this.updateSliderVisual();

        // Register tooltip
        this.tooltips.register(this.sliderContainer, '调整相机视角 (FOV)', 'top');
    }

    /**
     * Setup slider drag interaction
     */
    private setupSliderInteraction(): void {
        const sliderDom = this.sliderContainer.dom;

        const onPointerDown = (e: PointerEvent) => {
            this.isDragging = true;
            sliderDom.setPointerCapture(e.pointerId);
            this.updateFovFromPointer(e);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (this.isDragging) {
                this.updateFovFromPointer(e);
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            if (this.isDragging) {
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
        
        const newFov = Math.round(this.minFov + percent * (this.maxFov - this.minFov));
        this.setFov(newFov, true);
    }

    /**
     * Register events
     */
    private registerEvents(): void {
        // Listen for camera FOV changes
        this.events.on('camera.fov', (fov: number) => {
            this.setFov(fov, false);
        });

        // Listen for external FOV setting
        this.events.on(VLNEventNames.FOV_CHANGED, (fov: number) => {
            this.setFov(fov, false);
        });
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Set FOV value
     */
    setFov(fov: number, fireEvent: boolean = true): void {
        // Clamp value
        fov = Math.max(this.minFov, Math.min(this.maxFov, fov));
        
        if (fov === this.currentFov) {
            return;
        }

        this.currentFov = fov;
        this.updateDisplay();
        this.updateSliderVisual();

        // Fire event to notify other components
        if (fireEvent) {
            this.events.fire(VLNEventNames.FOV_CHANGE, fov);
        }
    }

    /**
     * Get current FOV
     */
    getFov(): number {
        return this.currentFov;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Update display
     */
    private updateDisplay(): void {
        this.fovValue.text = `${this.currentFov}°`;
    }

    /**
     * Update slider visual position
     */
    private updateSliderVisual(): void {
        const percent = ((this.currentFov - this.minFov) / (this.maxFov - this.minFov)) * 100;
        this.sliderContainer.dom.style.setProperty('--fov-percent', `${percent}%`);
    }
}

export { FOVIndicator };
