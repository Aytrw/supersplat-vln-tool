/**
 * 录制控制组件
 * 
 * 提供录制的开始、暂停、停止等控制功能
 */

import { Container, Label, Button, SelectInput } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { VLNEventNames, RecordingStatus, RecordingSession } from '../../vln/types';

/**
 * 录制控制组件类
 */
class RecorderControls extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI 组件
    private recordBtn: Button;
    private pauseBtn: Button;
    private stopBtn: Button;
    private frameRateSelect: SelectInput;
    private statusLabel: Label;
    private frameCountLabel: Label;
    private durationLabel: Label;
    
    // 状态
    private recordingStatus: RecordingStatus = 'idle';
    private frameCount: number = 0;
    private duration: number = 0;
    
    // 更新定时器
    private updateTimer: number | null = null;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            class: ['vln-section', 'vln-recorder-controls']
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        this.buildUI();
        this.registerEvents();
    }

    /**
     * 构建 UI
     */
    private buildUI(): void {
        // Header removed - now in collapsible section

        // 控制按钮行
        const buttonsRow = new Container({
            class: 'vln-recorder-buttons'
        });

        // Record button
        this.recordBtn = new Button({
            text: '录制',
            class: ['vln-recorder-btn', 'vln-recorder-btn-record']
        });

        // Pause button
        this.pauseBtn = new Button({
            text: '暂停',
            class: ['vln-recorder-btn', 'vln-recorder-btn-pause'],
            enabled: false
        });

        // Stop button
        this.stopBtn = new Button({
            text: '停止',
            class: ['vln-recorder-btn', 'vln-recorder-btn-stop'],
            enabled: false
        });

        buttonsRow.append(this.recordBtn);
        buttonsRow.append(this.pauseBtn);
        buttonsRow.append(this.stopBtn);
        this.append(buttonsRow);

        // Frame rate setting row
        const frameRateRow = new Container({
            class: 'vln-recorder-row'
        });

        const frameRateLabel = new Label({
            text: '帧率:',
            class: 'vln-recorder-label'
        });

        this.frameRateSelect = new SelectInput({
            class: 'vln-recorder-select',
            options: [
                { v: '10', t: '10 fps' },
                { v: '15', t: '15 fps' },
                { v: '30', t: '30 fps' },
                { v: '60', t: '60 fps' }
            ],
            value: '30'
        });

        frameRateRow.append(frameRateLabel);
        frameRateRow.append(this.frameRateSelect);
        this.append(frameRateRow);

        // Status display row
        const statusRow = new Container({
            class: 'vln-recorder-status'
        });

        this.statusLabel = new Label({
            text: '状态: 就绪',
            class: 'vln-recorder-status-label'
        });

        statusRow.append(this.statusLabel);
        this.append(statusRow);

        // Stats row
        const statsRow = new Container({
            class: 'vln-recorder-stats'
        });

        this.frameCountLabel = new Label({
            text: '已录制: 0 帧',
            class: 'vln-recorder-stat'
        });

        this.durationLabel = new Label({
            text: '| 0.0 秒',
            class: 'vln-recorder-stat'
        });

        statsRow.append(this.frameCountLabel);
        statsRow.append(this.durationLabel);
        this.append(statsRow);

        // 注册按钮事件
        this.recordBtn.on('click', () => this.onRecordClick());
        this.pauseBtn.on('click', () => this.onPauseClick());
        this.stopBtn.on('click', () => this.onStopClick());
        this.frameRateSelect.on('change', (value: string) => this.onFrameRateChange(value));

        // Register tooltips
        this.tooltips.register(this.recordBtn, '开始录制相机路径', 'top');
        this.tooltips.register(this.pauseBtn, '暂停/恢复录制', 'top');
        this.tooltips.register(this.stopBtn, '停止录制并保存', 'top');
        this.tooltips.register(this.frameRateSelect, '设置录制帧率', 'top');
    }

    /**
     * 注册事件
     */
    private registerEvents(): void {
        // 录制开始
        this.events.on(VLNEventNames.RECORDING_STARTED, (session: RecordingSession) => {
            this.setStatus('recording');
            this.startStatsUpdate();
        });

        // 录制暂停
        this.events.on(VLNEventNames.RECORDING_PAUSED, () => {
            this.setStatus('paused');
            this.stopStatsUpdate();
        });

        // 录制恢复
        this.events.on(VLNEventNames.RECORDING_RESUMED, () => {
            this.setStatus('recording');
            this.startStatsUpdate();
        });

        // 录制停止
        this.events.on(VLNEventNames.RECORDING_STOPPED, (session: RecordingSession) => {
            this.setStatus('stopped');
            this.stopStatsUpdate();
            
            if (session) {
                this.frameCount = session.frames.length;
                this.updateStats();
            }
        });

        // 录制帧
        this.events.on(VLNEventNames.RECORDING_FRAME, () => {
            this.frameCount++;
        });
    }

    // ========================================================================
    // 按钮事件处理
    // ========================================================================

    /**
     * 录制按钮点击
     */
    private onRecordClick(): void {
        console.log('VLN UI: Record button clicked');
        
        if (this.recordingStatus === 'idle' || this.recordingStatus === 'stopped') {
            // 开始新录制
            this.frameCount = 0;
            this.duration = 0;
            this.events.fire(VLNEventNames.RECORDING_START);
        }
    }

    /**
     * 暂停按钮点击
     */
    private onPauseClick(): void {
        console.log('VLN UI: Pause button clicked');
        
        if (this.recordingStatus === 'recording') {
            this.events.fire(VLNEventNames.RECORDING_PAUSE);
        } else if (this.recordingStatus === 'paused') {
            this.events.fire(VLNEventNames.RECORDING_RESUME);
        }
    }

    /**
     * 停止按钮点击
     */
    private onStopClick(): void {
        console.log('VLN UI: Stop button clicked');
        
        if (this.recordingStatus === 'recording' || this.recordingStatus === 'paused') {
            this.events.fire(VLNEventNames.RECORDING_STOP);
        }
    }

    /**
     * 帧率变更
     */
    private onFrameRateChange(value: string): void {
        console.log('VLN UI: Frame rate changed to', value);
        
        const frameRate = parseInt(value, 10);
        this.events.fire('vln.recorder.setFrameRate', frameRate);
    }

    // ========================================================================
    // 状态管理
    // ========================================================================

    /**
     * 设置录制状态
     */
    private setStatus(status: RecordingStatus): void {
        this.recordingStatus = status;

        // 更新按钮状态
        switch (status) {
            case 'idle':
            case 'stopped':
                this.recordBtn.enabled = true;
                this.pauseBtn.enabled = false;
                this.stopBtn.enabled = false;
                this.frameRateSelect.enabled = true;
                this.statusLabel.text = status === 'idle' ? '状态: 就绪' : '状态: 已停止';
                this.recordBtn.text = '录制';
                this.pauseBtn.text = '暂停';
                break;
                
            case 'recording':
                this.recordBtn.enabled = false;
                this.pauseBtn.enabled = true;
                this.stopBtn.enabled = true;
                this.frameRateSelect.enabled = false;
                this.statusLabel.text = '状态: 录制中...';
                this.pauseBtn.text = '暂停';
                break;
                
            case 'paused':
                this.recordBtn.enabled = false;
                this.pauseBtn.enabled = true;
                this.stopBtn.enabled = true;
                this.frameRateSelect.enabled = false;
                this.statusLabel.text = '状态: 已暂停';
                this.pauseBtn.text = '继续';
                break;
        }

        // 更新样式
        this.dom.classList.remove('recording', 'paused', 'stopped');
        if (status !== 'idle') {
            this.dom.classList.add(status);
        }
    }

    /**
     * 开始统计更新
     */
    private startStatsUpdate(): void {
        if (this.updateTimer !== null) {
            return;
        }

        const startTime = Date.now();
        this.updateTimer = window.setInterval(() => {
            this.duration = (Date.now() - startTime) / 1000;
            this.updateStats();
        }, 100);
    }

    /**
     * 停止统计更新
     */
    private stopStatsUpdate(): void {
        if (this.updateTimer !== null) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /**
     * 更新统计显示
     */
    private updateStats(): void {
        this.frameCountLabel.text = `已录制: ${this.frameCount} 帧`;
        this.durationLabel.text = `| ${this.duration.toFixed(1)} 秒`;
    }

    // ========================================================================
    // 公共接口
    // ========================================================================

    /**
     * 获取当前帧率设置
     */
    getFrameRate(): number {
        return parseInt(this.frameRateSelect.value as string, 10);
    }

    /**
     * 设置帧率
     */
    setFrameRate(frameRate: number): void {
        this.frameRateSelect.value = frameRate.toString();
    }

    /**
     * 重置控件
     */
    reset(): void {
        this.setStatus('idle');
        this.frameCount = 0;
        this.duration = 0;
        this.updateStats();
    }
}

export { RecorderControls };
