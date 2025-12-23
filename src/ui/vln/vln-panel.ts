/**
 * VLN 主面板
 * 
 * VLN 标注工具的主要 UI 面板，包含任务信息、指令显示、相机设置、录制控制等
 * 采用可折叠设计，放置在右侧工具栏旁边
 */

import { Container, Label, Button, Panel } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { PathInfoBox } from './path-info-box';
import { RecorderControls } from './recorder-controls';
import { CameraSettingsPanel } from './camera-settings';
import { VLNEventNames } from '../../vln/types';

/**
 * 可折叠区域组件
 */
class CollapsibleSection extends Container {
    private headerContainer: Container;
    private contentContainer: Container;
    private collapseIcon: Label;
    private isCollapsed: boolean = false;

    constructor(title: string, args = {}) {
        super({
            ...args,
            class: 'vln-collapsible-section'
        });

        // 头部（可点击折叠）
        this.headerContainer = new Container({
            class: 'vln-collapsible-header'
        });

        this.collapseIcon = new Label({
            text: '-',
            class: 'vln-collapse-icon'
        });

        const titleLabel = new Label({
            text: title,
            class: 'vln-collapsible-title'
        });

        this.headerContainer.append(this.collapseIcon);
        this.headerContainer.append(titleLabel);

        // 内容区域
        this.contentContainer = new Container({
            class: 'vln-collapsible-content'
        });

        super.append(this.headerContainer);
        super.append(this.contentContainer);

        // 点击头部折叠/展开
        this.headerContainer.dom.addEventListener('click', () => {
            this.toggle();
        });
    }

    append(element: any): void {
        this.contentContainer.append(element);
    }

    toggle(): void {
        this.isCollapsed = !this.isCollapsed;
        this.collapseIcon.text = this.isCollapsed ? '+' : '-';
        this.contentContainer.hidden = this.isCollapsed;
        this.dom.classList.toggle('collapsed', this.isCollapsed);
    }

    collapse(): void {
        if (!this.isCollapsed) {
            this.toggle();
        }
    }

    expand(): void {
        if (this.isCollapsed) {
            this.toggle();
        }
    }
}

/**
 * VLN 主面板类
 */
class VLNPanel extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // 可折叠区域
    private taskSection: CollapsibleSection;
    private instructionSection: CollapsibleSection;
    private cameraSection: CollapsibleSection;
    private recordSection: CollapsibleSection;
    
    // 子组件
    private instructionBox: PathInfoBox;
    private cameraSettings: CameraSettingsPanel;
    private recorderControls: RecorderControls;
    
    // 任务信息标签
    private taskIdLabel: Label;
    private sceneIdLabel: Label;
    
    // 面板折叠状态
    private isPanelCollapsed: boolean = false;
    private panelContent: Container;
    private collapseBtn: Button;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-panel',
            class: 'panel'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // 阻止事件冒泡
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // 构建 UI
        this.buildUI();
        
        // 注册事件
        this.registerEvents();
    }

    /**
     * 构建 UI 结构
     */
    private buildUI(): void {
        // ====== 面板头部 ======
        const header = this.createHeader();
        this.append(header);

        // ====== 内容容器（可整体折叠） ======
        this.panelContent = new Container({
            class: 'vln-panel-content'
        });

        // ====== 任务信息区（可折叠） ======
        this.taskSection = new CollapsibleSection('任务信息');
        this.createTaskInfoContent(this.taskSection);
        this.panelContent.append(this.taskSection);

        // ====== 导航指令区（可折叠） ======
        this.instructionSection = new CollapsibleSection('导航指令');
        this.instructionBox = new PathInfoBox(this.events);
        this.instructionSection.append(this.instructionBox);
        this.panelContent.append(this.instructionSection);

        // ====== 相机设置区（可折叠，默认折叠） ======
        this.cameraSection = new CollapsibleSection('相机设置');
        this.cameraSettings = new CameraSettingsPanel(this.events, this.tooltips);
        this.cameraSection.append(this.cameraSettings);
        this.cameraSection.collapse();
        this.panelContent.append(this.cameraSection);

        // ====== 录制控制区（可折叠） ======
        this.recordSection = new CollapsibleSection('录制控制');
        this.recorderControls = new RecorderControls(this.events, this.tooltips);
        this.recordSection.append(this.recorderControls);
        this.panelContent.append(this.recordSection);

        // ====== 操作按钮区 ======
        const actionButtons = this.createActionButtons();
        this.panelContent.append(actionButtons);

        this.append(this.panelContent);
    }

    /**
     * 创建面板头部
     */
    private createHeader(): Container {
        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            text: '\uE401', // Navigation icon
            class: 'panel-header-icon'
        });

        const label = new Label({
            text: 'VLN 导航标注',
            class: 'panel-header-label'
        });

        // 折叠/展开按钮
        this.collapseBtn = new Button({
            class: 'panel-header-button',
            icon: 'E316'
        });

        this.collapseBtn.on('click', () => {
            this.togglePanel();
        });

        // 关闭按钮
        const closeBtn = new Button({
            class: 'panel-header-button',
            icon: 'E106'
        });

        closeBtn.on('click', () => {
            this.hidden = true;
            this.events.fire(VLNEventNames.PANEL_VISIBLE, false);
        });

        header.append(icon);
        header.append(label);
        header.append(this.collapseBtn);
        header.append(closeBtn);

        this.tooltips.register(this.collapseBtn, '折叠/展开面板', 'top');
        this.tooltips.register(closeBtn, '关闭面板', 'top');

        return header;
    }

    /**
     * 切换面板折叠状态
     */
    private togglePanel(): void {
        this.isPanelCollapsed = !this.isPanelCollapsed;
        this.panelContent.hidden = this.isPanelCollapsed;
        this.collapseBtn.icon = this.isPanelCollapsed ? 'E317' : 'E316';
        this.dom.classList.toggle('vln-panel-collapsed', this.isPanelCollapsed);
    }

    /**
     * 创建任务信息内容
     */
    private createTaskInfoContent(section: CollapsibleSection): void {
        const infoContainer = new Container({
            class: 'vln-task-info'
        });

        // Task ID
        const taskIdRow = new Container({ class: 'vln-info-row' });
        const taskIdTitle = new Label({ text: '任务ID:', class: 'vln-info-label' });
        this.taskIdLabel = new Label({ text: '未加载', class: 'vln-info-value' });
        taskIdRow.append(taskIdTitle);
        taskIdRow.append(this.taskIdLabel);

        // Scene ID
        const sceneIdRow = new Container({ class: 'vln-info-row' });
        const sceneIdTitle = new Label({ text: '场景:', class: 'vln-info-label' });
        this.sceneIdLabel = new Label({ text: '未加载', class: 'vln-info-value' });
        sceneIdRow.append(sceneIdTitle);
        sceneIdRow.append(this.sceneIdLabel);

        infoContainer.append(taskIdRow);
        infoContainer.append(sceneIdRow);

        section.append(infoContainer);
    }

    /**
     * 创建操作按钮区
     */
    private createActionButtons(): Container {
        const container = new Container({
            class: 'vln-action-buttons'
        });

        // Import task button
        const importBtn = new Button({
            text: '导入任务',
            class: 'vln-action-button'
        });

        // Export path button
        const exportBtn = new Button({
            text: '导出路径',
            class: 'vln-action-button'
        });

        // Clear button
        const clearBtn = new Button({
            text: '清空',
            class: ['vln-action-button', 'vln-action-button-danger']
        });

        // Event handlers (interface stubs, not implemented yet)
        importBtn.on('click', () => {
            console.log('VLN UI: Import task clicked');
            this.onImportTask();
        });

        exportBtn.on('click', () => {
            console.log('VLN UI: Export path clicked');
            this.onExportPath();
        });

        clearBtn.on('click', () => {
            console.log('VLN UI: Clear clicked');
            this.onClear();
        });

        container.append(importBtn);
        container.append(exportBtn);
        container.append(clearBtn);

        this.tooltips.register(importBtn, '导入 VLN 任务文件 (JSON)', 'top');
        this.tooltips.register(exportBtn, '导出录制的路径', 'top');
        this.tooltips.register(clearBtn, '清空当前任务和录制', 'top');

        return container;
    }

    /**
     * 注册事件处理器
     */
    private registerEvents(): void {
        // 面板可见性切换
        this.events.on(VLNEventNames.PANEL_TOGGLE, () => {
            this.hidden = !this.hidden;
            this.events.fire(VLNEventNames.PANEL_VISIBLE, !this.hidden);
        });

        // 任务加载完成
        this.events.on(VLNEventNames.TASK_LOADED, (task: any) => {
            this.updateTaskInfo(task);
        });

        // 任务清空
        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.clearTaskInfo();
        });
    }

    // ========================================================================
    // 公共接口
    // ========================================================================

    /**
     * 显示面板
     */
    show(): void {
        this.hidden = false;
        this.events.fire(VLNEventNames.PANEL_VISIBLE, true);
    }

    /**
     * 隐藏面板
     */
    hide(): void {
        this.hidden = true;
        this.events.fire(VLNEventNames.PANEL_VISIBLE, false);
    }

    /**
     * 切换面板可见性
     */
    toggle(): void {
        this.hidden = !this.hidden;
        this.events.fire(VLNEventNames.PANEL_VISIBLE, !this.hidden);
    }

    // ========================================================================
    // 任务信息更新
    // ========================================================================

    /**
     * 更新任务信息显示
     */
    private updateTaskInfo(task: any): void {
        if (task) {
            this.taskIdLabel.text = task.id || '未知';
            this.sceneIdLabel.text = task.sceneId || '未知';
        }
    }

    /**
     * 清空任务信息显示
     */
    private clearTaskInfo(): void {
        this.taskIdLabel.text = '未加载';
        this.sceneIdLabel.text = '未加载';
    }

    // ========================================================================
    // 操作回调（预留接口）
    // ========================================================================

    /**
     * 导入任务 - 预留接口
     */
    private onImportTask(): void {
        // TODO: 实现导入任务逻辑
        // 这里将调用 DataLoader 的文件选择和加载功能
        this.events.fire('vln.ui.importTask');
    }

    /**
     * 导出路径 - 预留接口
     */
    private onExportPath(): void {
        // TODO: 实现导出路径逻辑
        this.events.fire(VLNEventNames.PATH_EXPORT, 'json');
    }

    /**
     * 清空 - 预留接口
     */
    private onClear(): void {
        // TODO: 实现清空逻辑
        this.events.fire(VLNEventNames.TASK_CLEAR);
    }
}

export { VLNPanel };
