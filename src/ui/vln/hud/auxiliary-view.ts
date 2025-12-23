/**
 * Auxiliary View - HUD Module C
 * 
 * Position: Top-Right
 * Content: Placeholder for robot first-person view camera
 * Maintains 16:9 aspect ratio
 */

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { VLNEventNames } from '../../../vln/types';

/**
 * Auxiliary View placeholder component
 */
class AuxiliaryView extends Container {
    private events: Events;
    
    // UI elements
    private contentContainer: Container;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'vln-auxiliary-view',
            class: 'vln-hud-panel'
        };

        super(args);

        this.events = events;

        // Block pointer events
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.buildUI();
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // Header
        const header = new Container({
            class: 'vln-hud-header'
        });

        const headerIcon = new Label({
            text: '\uE80E', // Camera icon
            class: 'vln-hud-header-icon'
        });

        const headerTitle = new Label({
            text: '辅助视角',
            class: 'vln-hud-header-title'
        });

        header.append(headerIcon);
        header.append(headerTitle);
        this.append(header);

        // Content container (video placeholder)
        this.contentContainer = new Container({
            class: 'vln-auxiliary-content'
        });

        // Placeholder content
        const placeholder = new Container({
            class: 'vln-auxiliary-placeholder'
        });

        const placeholderIcon = new Label({
            text: '\uE80E', // Camera icon
            class: 'vln-auxiliary-placeholder-icon'
        });

        const placeholderText = new Label({
            text: '机器人视角',
            class: 'vln-auxiliary-placeholder-text'
        });

        placeholder.append(placeholderIcon);
        placeholder.append(placeholderText);
        this.contentContainer.append(placeholder);

        this.append(this.contentContainer);
    }

    // ========================================================================
    // Public Interface (for future implementation)
    // ========================================================================

    /**
     * Set video element for displaying robot camera feed
     */
    setVideoElement(videoElement: HTMLVideoElement): void {
        // Clear placeholder
        this.contentContainer.dom.innerHTML = '';
        
        // Add video element
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        this.contentContainer.dom.appendChild(videoElement);
    }

    /**
     * Set canvas element for displaying rendered view
     */
    setCanvasElement(canvas: HTMLCanvasElement): void {
        // Clear placeholder
        this.contentContainer.dom.innerHTML = '';
        
        // Add canvas element
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        this.contentContainer.dom.appendChild(canvas);
    }

    /**
     * Reset to placeholder
     */
    resetToPlaceholder(): void {
        this.contentContainer.destroy();
        
        // Rebuild content
        this.contentContainer = new Container({
            class: 'vln-auxiliary-content'
        });

        const placeholder = new Container({
            class: 'vln-auxiliary-placeholder'
        });

        const placeholderIcon = new Label({
            text: '\uE80E',
            class: 'vln-auxiliary-placeholder-icon'
        });

        const placeholderText = new Label({
            text: '机器人视角',
            class: 'vln-auxiliary-placeholder-text'
        });

        placeholder.append(placeholderIcon);
        placeholder.append(placeholderText);
        this.contentContainer.append(placeholder);

        this.append(this.contentContainer);
    }
}

export { AuxiliaryView };
