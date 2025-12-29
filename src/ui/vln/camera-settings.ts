/**
 * 相机设置面板
 * 
 * 提供相机 FOV 设置、位姿跳转等功能
 */

import { Container, Label, Button, SliderInput, NumericInput } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { VLNEventNames, CameraPose } from '../../vln/types';

/**
 * 相机设置面板类
 */
class CameraSettingsPanel extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI 组件
    private fovSlider: SliderInput;
    private fovInput: NumericInput;
    private gotoStartBtn: Button;
    private gotoEndBtn: Button;
    private resetPoseBtn: Button;
    
    // 当前 FOV 值
    private currentFov: number = 60;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            class: ['vln-section', 'vln-camera-settings']
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
        // FOV setting row (header removed - now in collapsible section)
        const fovRow = new Container({
            class: 'vln-camera-fov-row'
        });

        const fovLabel = new Label({
            text: '视角:',
            class: 'vln-camera-label'
        });

        this.fovSlider = new SliderInput({
            class: 'vln-camera-fov-slider',
            min: 10,
            max: 120,
            value: 60,
            step: 1
        });

        this.fovInput = new NumericInput({
            class: 'vln-camera-fov-input',
            min: 10,
            max: 120,
            value: 60,
            step: 1,
            precision: 0
        });

        const fovUnit = new Label({
            text: '°',
            class: 'vln-camera-fov-unit'
        });

        fovRow.append(fovLabel);
        fovRow.append(this.fovSlider);
        fovRow.append(this.fovInput);
        fovRow.append(fovUnit);
        this.append(fovRow);

        // Pose jump buttons row
        const poseButtonsRow = new Container({
            class: 'vln-camera-pose-buttons'
        });

        this.resetPoseBtn = new Button({
            text: '重置位姿',
            class: 'vln-camera-btn'
        });

        this.gotoStartBtn = new Button({
            text: '跳转起点',
            class: 'vln-camera-btn'
        });

        this.gotoEndBtn = new Button({
            text: '跳转终点',
            class: 'vln-camera-btn'
        });

        poseButtonsRow.append(this.resetPoseBtn);
        poseButtonsRow.append(this.gotoStartBtn);
        poseButtonsRow.append(this.gotoEndBtn);
        this.append(poseButtonsRow);

        // 绑定事件
        this.fovSlider.on('change', (value: number) => {
            this.setFov(value, false);
        });

        this.fovInput.on('change', (value: number) => {
            this.setFov(value, false);
        });

        this.resetPoseBtn.on('click', () => this.onResetPose());
        this.gotoStartBtn.on('click', () => this.onGotoStart());
        this.gotoEndBtn.on('click', () => this.onGotoEnd());

        // Register tooltips
        this.tooltips.register(this.fovSlider, '调整相机视角 (FOV)', 'top');
        this.tooltips.register(this.resetPoseBtn, '重置相机到默认位置', 'top');
        this.tooltips.register(this.gotoStartBtn, '跳转到任务起始位姿', 'top');
        this.tooltips.register(this.gotoEndBtn, '跳转到任务结束位姿', 'top');
    }

    /**
     * 注册事件
     */
    private registerEvents(): void {
        // 监听相机 FOV 变化
        this.events.on('camera.fov', (fov: number) => {
            this.updateFovDisplay(fov);
        });

        // 监听任务加载
        this.events.on(VLNEventNames.TASK_LOADED, (task: any) => {
            // 启用起点/终点按钮
            this.gotoStartBtn.enabled = !!task?.startPose;
            this.gotoEndBtn.enabled = !!task?.endPose;

            // 如果任务有起始 FOV，应用它
            if (task?.startPose?.fov) {
                this.setFov(task.startPose.fov);
            }
        });

        // 监听任务清空
        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.gotoStartBtn.enabled = false;
            this.gotoEndBtn.enabled = false;
        });
    }

    // ========================================================================
    // FOV 控制
    // ========================================================================

    /**
     * 设置 FOV
     */
    setFov(value: number, fireEvent: boolean = true): void {
        // 限制范围
        value = Math.max(10, Math.min(120, value));
        
        this.currentFov = value;
        this.updateFovDisplay(value);

        if (fireEvent) {
            // 触发相机 FOV 设置事件
            this.events.fire(VLNEventNames.CAMERA_SET_FOV, value);
        }
    }

    /**
     * 获取当前 FOV
     */
    getFov(): number {
        return this.currentFov;
    }

    /**
     * 更新 FOV 显示
     */
    private updateFovDisplay(value: number): void {
        // 避免触发 change 事件
        if (this.fovSlider.value !== value) {
            this.fovSlider.value = value;
        }
        if (this.fovInput.value !== value) {
            this.fovInput.value = value;
        }
    }

    // ========================================================================
    // 位姿跳转
    // ========================================================================

    /**
     * 重置位姿
     */
    private onResetPose(): void {
        console.log('VLN UI: Reset pose clicked');
        
        // 触发相机重置事件
        this.events.fire('camera.reset');
    }

    /**
     * 跳转到起点
     */
    private onGotoStart(): void {
        console.log('VLN UI: Goto start clicked');
        
        this.events.fire(VLNEventNames.CAMERA_GOTO_START);
    }

    /**
     * 跳转到终点
     */
    private onGotoEnd(): void {
        console.log('VLN UI: Goto end clicked');
        
        this.events.fire(VLNEventNames.CAMERA_GOTO_END);
    }

    // ========================================================================
    // 公共接口
    // ========================================================================

    /**
     * 设置起点按钮启用状态
     */
    setStartButtonEnabled(enabled: boolean): void {
        this.gotoStartBtn.enabled = enabled;
    }

    /**
     * 设置终点按钮启用状态
     */
    setEndButtonEnabled(enabled: boolean): void {
        this.gotoEndBtn.enabled = enabled;
    }

    /**
     * 重置设置
     */
    reset(): void {
        this.setFov(60);
        this.gotoStartBtn.enabled = false;
        this.gotoEndBtn.enabled = false;
    }
}

export { CameraSettingsPanel };
