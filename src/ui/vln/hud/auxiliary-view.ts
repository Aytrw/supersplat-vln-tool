/**
 * Auxiliary View - HUD Module C
 * 
 * Position: Top-Right
 * Content: Placeholder for robot first-person view camera
 * Maintains 16:9 aspect ratio
 */

import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { RobotVideoClient, RobotVideoEvents, ConnectionStatus } from '../../../robot/robot-video-client';

import { FOVIndicator } from './fov-indicator';

import cameraPanelSvg from '../../svg/camera-panel.svg';

const createSvg = (svgString: string): HTMLElement => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement as HTMLElement;
};

/**
 * Auxiliary View placeholder component
 */
class AuxiliaryView extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private contentContainer: Container;
    private fovIndicator: FOVIndicator;
    private placeholder?: Container;
    
    // Robot video client
    private robotVideoClient: RobotVideoClient | null = null;
    private videoCanvas: HTMLCanvasElement | null = null;
    private statusIndicator: Container | null = null;
    private connectButton: Container | null = null;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-auxiliary-view',
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
        this.initRobotVideo();
    }

    private fovToggleBtn?: Container;
    private fovExpanded: boolean = false;

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // Content container (video placeholder) - no header for borderless look
        this.contentContainer = new Container({
            class: 'vln-auxiliary-content'
        });

        // Collapsible FOV toggle button (in the mini-map frame, not blocking the view)
        this.fovToggleBtn = new Container({
            class: 'vln-fov-toggle-btn'
        });
        this.fovToggleBtn.dom.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
        // Use the shared tooltip system (matches SuperSplat)
        this.tooltips.register(this.fovToggleBtn, 'FOV 调节', 'left');
        this.fovToggleBtn.dom.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.toggleFovPanel();
        });

        // FOV indicator (hidden by default, shown when expanded)
        this.fovIndicator = new FOVIndicator(this.events, this.tooltips, {
            class: 'vln-aux-fov-panel'
        });
        this.fovIndicator.hidden = true;

        // Placeholder content
        const placeholder = new Container({
            class: 'vln-auxiliary-placeholder'
        });
        this.placeholder = placeholder;

        const placeholderIcon = new Element({
            class: 'vln-auxiliary-placeholder-icon'
        });
        placeholderIcon.dom.appendChild(createSvg(cameraPanelSvg));

        const placeholderText = new Label({
            text: '机器人视角',
            class: 'vln-auxiliary-placeholder-text'
        });

        placeholder.append(placeholderIcon);
        placeholder.append(placeholderText);
        
        // Connect button (on placeholder)
        this.connectButton = new Container({
            class: 'vln-video-connect-btn'
        });
        this.connectButton.dom.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 7l-7 5 7 5V7z"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            <span>连接机器人</span>
        `;
        this.tooltips.register(this.connectButton, '连接到 GO2 机器人视频流', 'bottom');
        this.connectButton.dom.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.toggleRobotConnection();
        });
        placeholder.append(this.connectButton);
        
        this.contentContainer.append(placeholder);

        // Connection status indicator (bottom-left corner)
        this.statusIndicator = new Container({
            class: 'vln-video-status'
        });
        this.statusIndicator.dom.innerHTML = `
            <span class="status-dot disconnected"></span>
            <span class="status-text">未连接</span>
        `;

        this.append(this.contentContainer);
        this.append(this.statusIndicator);

        // Keep these outside the content so setVideoElement/setCanvasElement won't remove them
        this.append(this.fovToggleBtn);
        this.append(this.fovIndicator);
    }

    // ========================================================================
    // FOV Panel Toggle
    // ========================================================================

    private toggleFovPanel(): void {
        this.fovExpanded = !this.fovExpanded;
        this.fovIndicator.hidden = !this.fovExpanded;

        // Hard guarantee: placeholder should never render above the expanded panel.
        // (z-index/stacking contexts can vary depending on how content is swapped)
        if (this.placeholder) {
            this.placeholder.hidden = this.fovExpanded;
        }

        if (this.fovExpanded) {
            this.class.add('fov-expanded');
        } else {
            this.class.remove('fov-expanded');
        }

        if (this.fovToggleBtn) {
            if (this.fovExpanded) {
                this.fovToggleBtn.class.add('expanded');
            } else {
                this.fovToggleBtn.class.remove('expanded');
            }
        }
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
        this.placeholder = undefined;
        
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
        this.placeholder = undefined;
        
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
        this.placeholder = placeholder;

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

        // Ensure toggle + panel stay above the content after rebuilding.
        if (this.fovToggleBtn) this.append(this.fovToggleBtn);
        this.append(this.fovIndicator);

        // Keep placeholder hidden if panel is currently expanded.
        if (this.placeholder) {
            this.placeholder.hidden = this.fovExpanded;
        }
    }

    // ========================================================================
    // Robot Video Connection
    // ========================================================================

    /**
     * Initialize robot video client
     */
    private initRobotVideo(): void {
        this.robotVideoClient = new RobotVideoClient(this.events, {
            serverUrl: 'ws://localhost:9000',
            autoReconnect: false,  // Manual control
            reconnectInterval: 3000,
            maxReconnectAttempts: 5
        });

        // Listen for status changes
        this.events.on(RobotVideoEvents.STATUS_CHANGED, (status: ConnectionStatus) => {
            this.updateStatusIndicator(status);
        });

        // Listen for frames
        this.events.on(RobotVideoEvents.FRAME_RECEIVED, () => {
            // Canvas is already updated by the client
            // Just make sure it's displayed
            if (this.videoCanvas && !this.contentContainer.dom.contains(this.videoCanvas)) {
                this.showVideoCanvas();
            }
        });
    }

    /**
     * Toggle robot connection
     */
    private toggleRobotConnection(): void {
        if (!this.robotVideoClient) return;

        const status = this.events.invoke('robot.video.status') as ConnectionStatus;
        
        if (status === 'connected' || status === 'connecting') {
            this.events.fire('robot.video.disconnect');
            this.resetToPlaceholder();
        } else {
            // Get canvas from client and display it
            this.videoCanvas = this.robotVideoClient.getCanvas();
            this.events.fire('robot.video.connect');
        }
    }

    /**
     * Show video canvas in content area
     */
    private showVideoCanvas(): void {
        if (!this.videoCanvas) return;

        // Clear placeholder
        this.contentContainer.dom.innerHTML = '';
        this.placeholder = undefined;

        // Add canvas
        this.videoCanvas.style.width = '100%';
        this.videoCanvas.style.height = '100%';
        this.videoCanvas.style.objectFit = 'cover';
        this.contentContainer.dom.appendChild(this.videoCanvas);
    }

    /**
     * Update status indicator UI
     */
    private updateStatusIndicator(status: ConnectionStatus): void {
        if (!this.statusIndicator) return;

        const dot = this.statusIndicator.dom.querySelector('.status-dot');
        const text = this.statusIndicator.dom.querySelector('.status-text');

        if (!dot || !text) return;

        // Remove all status classes
        dot.classList.remove('disconnected', 'connecting', 'connected', 'error');
        dot.classList.add(status);

        // Update text
        const statusTexts: Record<ConnectionStatus, string> = {
            'disconnected': '未连接',
            'connecting': '连接中...',
            'connected': '已连接',
            'error': '连接错误'
        };
        text.textContent = statusTexts[status] || status;

        // Update connect button text
        if (this.connectButton) {
            const btnText = this.connectButton.dom.querySelector('span');
            if (btnText) {
                if (status === 'connected') {
                    btnText.textContent = '断开连接';
                } else if (status === 'connecting') {
                    btnText.textContent = '连接中...';
                } else {
                    btnText.textContent = '连接机器人';
                }
            }
        }
    }
}

export { AuxiliaryView };
