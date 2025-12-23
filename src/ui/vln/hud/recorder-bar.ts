/**
 * Recorder Bar - HUD Module B
 * 
 * Position: Bottom-Center
 * Content: Recording controls, status indicator, timer
 * Layout: Horizontal row like a media player control bar
 */

import { Container, Label, Button } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { VLNEventNames, RecordingStatus, RecordingSession } from '../../../vln/types';

/**
 * Recorder Control Bar
 */
class RecorderBar extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private indicator: Container;
    private meta: Container;
    private hintLabel: Label;
    private stateLabel: Label;
    private recordBtn: Button;
    private pauseBtn: Button;
    private stopBtn: Button;
    private timerLabel: Label;
    private framesLabel: Label;
    
    // State
    private status: RecordingStatus = 'idle';
    private frameCount: number = 0;
    private duration: number = 0;
    private startTime: number = 0;
    private timerInterval: number | null = null;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-recorder-bar',
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
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        const recordSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7v10l9-5-9-5z"/></svg>`;
        const pauseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h4v12H7zM13 6h4v12h-4z"/></svg>`;
        const playSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7v10l9-5-9-5z"/></svg>`;
        const stopSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>`;

        // Status indicator light
        this.indicator = new Container({
            class: ['vln-recorder-indicator', 'idle']
        });
        this.append(this.indicator);

        // In-bar hint: Path recording + status
        this.meta = new Container({
            class: 'vln-recorder-meta'
        });

        this.hintLabel = new Label({
            text: '路径录制',
            class: 'vln-recorder-hint'
        });
        this.meta.append(this.hintLabel);

        this.stateLabel = new Label({
            text: '待机',
            class: ['vln-recorder-state', 'idle']
        });
        this.meta.append(this.stateLabel);

        this.append(this.meta);

        // Button group
        const btnGroup = new Container({
            class: 'vln-recorder-btn-group'
        });

        // Record / Resume button
        this.recordBtn = new Button({
            class: ['vln-recorder-btn', 'record-btn']
        });
        this.recordBtn.dom.innerHTML = recordSvg;

        // Pause button
        this.pauseBtn = new Button({
            class: ['vln-recorder-btn', 'pause-btn'],
            enabled: false
        });
        this.pauseBtn.dom.innerHTML = pauseSvg;

        // Stop button
        this.stopBtn = new Button({
            class: 'vln-recorder-btn',
            enabled: false
        });
        this.stopBtn.dom.innerHTML = stopSvg;

        btnGroup.append(this.recordBtn);
        btnGroup.append(this.pauseBtn);
        btnGroup.append(this.stopBtn);
        this.append(btnGroup);

        // Separator
        const separator1 = new Container({
            class: 'vln-recorder-separator'
        });
        this.append(separator1);

        // Timer display
        this.timerLabel = new Label({
            text: '00:00.0',
            class: 'vln-recorder-timer'
        });
        this.append(this.timerLabel);

        // Separator
        const separator2 = new Container({
            class: 'vln-recorder-separator'
        });
        this.append(separator2);

        // Frame counter
        this.framesLabel = new Label({
            text: '0 帧',
            class: 'vln-recorder-frames'
        });
        this.append(this.framesLabel);

        // Button events
        this.recordBtn.on('click', () => this.onRecordClick());
        this.pauseBtn.on('click', () => this.onPauseClick());
        this.stopBtn.on('click', () => this.onStopClick());

        // Tooltips
        this.tooltips.register(this.recordBtn, '开始录制路径', 'top');
        this.tooltips.register(this.pauseBtn, '暂停录制路径', 'top');
        this.tooltips.register(this.stopBtn, '停止录制路径', 'top');

        // Ensure initial UI state is consistent
        this.updateRecordingUi('idle', { recordSvg, playSvg });
    }

    private updateRecordingUi(status: RecordingStatus, icons: { recordSvg: string; playSvg: string }): void {
        // Update in-bar state label
        this.stateLabel.class.remove('idle', 'recording', 'paused');
        this.stateLabel.class.add(status);

        switch (status) {
            case 'idle':
                this.stateLabel.text = '待机';
                this.recordBtn.dom.innerHTML = icons.recordSvg;
                this.recordBtn.class.remove('resume');
                this.tooltips.unregister(this.recordBtn);
                this.tooltips.register(this.recordBtn, '开始录制路径', 'top');
                break;
            case 'recording':
                this.stateLabel.text = '录制中';
                this.recordBtn.dom.innerHTML = icons.recordSvg;
                this.recordBtn.class.remove('resume');
                // record button is disabled while recording
                break;
            case 'paused':
                this.stateLabel.text = '已暂停';
                this.recordBtn.dom.innerHTML = icons.playSvg;
                this.recordBtn.class.add('resume');
                this.tooltips.unregister(this.recordBtn);
                this.tooltips.register(this.recordBtn, '继续录制路径', 'top');
                break;
        }
    }

    /**
     * Register events
     */
    private registerEvents(): void {
        // Recording started
        this.events.on(VLNEventNames.RECORDING_STARTED, (session: RecordingSession) => {
            this.setStatus('recording');
            this.startTimer();
        });

        // Recording paused
        this.events.on(VLNEventNames.RECORDING_PAUSED, () => {
            this.setStatus('paused');
            this.stopTimer();
        });

        // Recording resumed
        this.events.on(VLNEventNames.RECORDING_RESUMED, () => {
            this.setStatus('recording');
            this.startTimer();
        });

        // Recording stopped
        this.events.on(VLNEventNames.RECORDING_STOPPED, (session: RecordingSession) => {
            this.reset();
        });

        // Frame recorded
        this.events.on(VLNEventNames.RECORDING_FRAME, () => {
            this.frameCount++;
            this.updateFrameDisplay();
        });
    }

    // ========================================================================
    // Button Handlers
    // ========================================================================

    private onRecordClick(): void {
        if (this.status === 'idle') {
            // Start recording
            this.events.fire(VLNEventNames.RECORDING_START);
        } else if (this.status === 'paused') {
            // Resume recording
            this.events.fire(VLNEventNames.RECORDING_RESUME);
        }
    }

    private onPauseClick(): void {
        if (this.status === 'recording') {
            this.events.fire(VLNEventNames.RECORDING_PAUSE);
        }
    }

    private onStopClick(): void {
        if (this.status === 'recording' || this.status === 'paused') {
            this.events.fire(VLNEventNames.RECORDING_STOP);
            // Defensive: reset UI even if backend event is delayed/missed
            this.reset();
        }
    }

    // ========================================================================
    // State Management
    // ========================================================================

    /**
     * Set recording status
     */
    setStatus(status: RecordingStatus): void {
        this.status = status;

        // Update indicator
        this.indicator.class.remove('idle', 'recording', 'paused');
        this.indicator.class.add(status);

        // Update button states
        // Also refresh icons / hint text
        this.updateRecordingUi(status, {
            recordSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7v10l9-5-9-5z"/></svg>`,
            playSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 7v10l9-5-9-5z"/></svg>`
        });

        switch (status) {
            case 'idle':
                this.recordBtn.enabled = true;
                this.recordBtn.class.remove('active');
                this.pauseBtn.enabled = false;
                this.stopBtn.enabled = false;
                break;
            case 'recording':
                this.recordBtn.enabled = false;
                this.recordBtn.class.add('active');
                this.pauseBtn.enabled = true;
                this.stopBtn.enabled = true;
                break;
            case 'paused':
                this.recordBtn.enabled = true;
                this.recordBtn.class.remove('active');
                this.pauseBtn.enabled = false;
                this.stopBtn.enabled = true;
                break;
        }
    }

    /**
     * Start timer
     */
    private startTimer(): void {
        if (this.status === 'recording' && !this.timerInterval) {
            this.startTime = Date.now() - this.duration * 1000;
            this.timerInterval = window.setInterval(() => {
                this.duration = (Date.now() - this.startTime) / 1000;
                this.updateTimerDisplay();
            }, 100);
        }
    }

    /**
     * Stop timer
     */
    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Reset state
     */
    reset(): void {
        this.stopTimer();
        this.frameCount = 0;
        this.duration = 0;
        this.setStatus('idle');
        this.updateDisplay();
    }

    // ========================================================================
    // Display Updates
    // ========================================================================

    /**
     * Update all displays
     */
    private updateDisplay(): void {
        this.updateTimerDisplay();
        this.updateFrameDisplay();
    }

    /**
     * Update timer display
     */
    private updateTimerDisplay(): void {
        const minutes = Math.floor(this.duration / 60);
        const seconds = Math.floor(this.duration % 60);
        const tenths = Math.floor((this.duration * 10) % 10);
        
        this.timerLabel.text = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    }

    /**
     * Update frame counter display
     */
    private updateFrameDisplay(): void {
        this.framesLabel.text = `${this.frameCount} 帧`;
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Get current status
     */
    getStatus(): RecordingStatus {
        return this.status;
    }

    /**
     * Get frame count
     */
    getFrameCount(): number {
        return this.frameCount;
    }

    /**
     * Get duration in seconds
     */
    getDuration(): number {
        return this.duration;
    }
}

export { RecorderBar };
