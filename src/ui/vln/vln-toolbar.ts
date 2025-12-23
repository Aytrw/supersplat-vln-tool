/**
 * VLN 工具栏
 * 
 * 在右侧工具栏中添加 VLN 相关的快捷按钮
 */

import { Button, Container, Element } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { VLNEventNames } from '../../vln/types';

/**
 * 创建 SVG 图标
 */
const createSvg = (svgString: string): HTMLElement => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement as HTMLElement;
};

/**
 * VLN 导航图标 SVG
 */
const vlnIconSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M3 12h4l3-9 4 18 3-9h4'/%3E%3C/svg%3E`;

/**
 * 录制图标 SVG
 */
const recordIconSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Ccircle cx='12' cy='12' r='8'/%3E%3C/svg%3E`;

/**
 * 路径图标 SVG
 */
const pathIconSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/%3E%3C/svg%3E`;

/**
 * VLN 工具栏类
 */
class VLNToolbar extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // 按钮
    private vlnPanelBtn: Button;
    private quickRecordBtn: Button;
    private pathVisibilityBtn: Button;
    
    // 状态
    private isPanelVisible: boolean = false;
    private isRecording: boolean = false;
    private isPathVisible: boolean = true;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-toolbar',
            class: 'vln-toolbar'
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
        // VLN 面板切换按钮
        this.vlnPanelBtn = new Button({
            id: 'vln-toolbar-panel-toggle',
            class: 'right-toolbar-toggle'
        });
        this.vlnPanelBtn.dom.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M3 12h4l3-9 4 18 3-9h4"/>
            </svg>
        `;

        // 快速录制按钮
        this.quickRecordBtn = new Button({
            id: 'vln-toolbar-quick-record',
            class: 'right-toolbar-toggle'
        });
        this.quickRecordBtn.dom.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <circle cx="12" cy="12" r="6"/>
            </svg>
        `;

        // 路径可见性切换按钮
        this.pathVisibilityBtn = new Button({
            id: 'vln-toolbar-path-visibility',
            class: ['right-toolbar-toggle', 'active']
        });
        this.pathVisibilityBtn.dom.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
        `;

        // 添加分隔线
        const separator = new Element({ class: 'right-toolbar-separator' });

        this.append(separator);
        this.append(this.vlnPanelBtn);
        this.append(this.quickRecordBtn);
        this.append(this.pathVisibilityBtn);

        // 绑定事件
        this.vlnPanelBtn.on('click', () => this.onTogglePanel());
        this.quickRecordBtn.on('click', () => this.onQuickRecord());
        this.pathVisibilityBtn.on('click', () => this.onTogglePathVisibility());

        // 注册工具提示
        this.tooltips.register(this.vlnPanelBtn, 'VLN 导航标注面板 (V)', 'left');
        this.tooltips.register(this.quickRecordBtn, '快速录制 (Ctrl+R)', 'left');
        this.tooltips.register(this.pathVisibilityBtn, '显示/隐藏路径', 'left');
    }

    /**
     * 注册事件
     */
    private registerEvents(): void {
        // 面板可见性变化
        this.events.on(VLNEventNames.PANEL_VISIBLE, (visible: boolean) => {
            this.isPanelVisible = visible;
            this.updatePanelButtonState();
        });

        // 录制状态变化
        this.events.on(VLNEventNames.RECORDING_STARTED, () => {
            this.isRecording = true;
            this.updateRecordButtonState();
        });

        this.events.on(VLNEventNames.RECORDING_STOPPED, () => {
            this.isRecording = false;
            this.updateRecordButtonState();
        });

        // 路径可见性变化
        this.events.on('vln.path.visibilityChanged', (visible: boolean) => {
            this.isPathVisible = visible;
            this.updatePathButtonState();
        });
    }

    // ========================================================================
    // 按钮事件处理
    // ========================================================================

    /**
     * 切换面板
     */
    private onTogglePanel(): void {
        this.events.fire(VLNEventNames.PANEL_TOGGLE);
    }

    /**
     * 快速录制
     */
    private onQuickRecord(): void {
        if (this.isRecording) {
            this.events.fire(VLNEventNames.RECORDING_STOP);
        } else {
            this.events.fire(VLNEventNames.RECORDING_START);
        }
    }

    /**
     * 切换路径可见性
     */
    private onTogglePathVisibility(): void {
        if (this.isPathVisible) {
            this.events.fire(VLNEventNames.PATH_HIDE);
        } else {
            this.events.fire(VLNEventNames.PATH_SHOW);
        }
    }

    // ========================================================================
    // 状态更新
    // ========================================================================

    /**
     * 更新面板按钮状态
     */
    private updatePanelButtonState(): void {
        if (this.isPanelVisible) {
            this.vlnPanelBtn.class.add('active');
        } else {
            this.vlnPanelBtn.class.remove('active');
        }
    }

    /**
     * 更新录制按钮状态
     */
    private updateRecordButtonState(): void {
        if (this.isRecording) {
            this.quickRecordBtn.class.add('recording');
            this.quickRecordBtn.dom.style.color = '#ff4444';
        } else {
            this.quickRecordBtn.class.remove('recording');
            this.quickRecordBtn.dom.style.color = '';
        }
    }

    /**
     * 更新路径按钮状态
     */
    private updatePathButtonState(): void {
        if (this.isPathVisible) {
            this.pathVisibilityBtn.class.add('active');
        } else {
            this.pathVisibilityBtn.class.remove('active');
        }
    }
}

export { VLNToolbar };
