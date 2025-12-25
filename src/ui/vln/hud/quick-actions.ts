/**
 * Quick Actions - HUD Element
 * 
 * Position: Above recorder bar (bottom-center)
 * Content: Quick action buttons (import, export, clear, etc.)
 */

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { VLNEventNames } from '../../../vln/types';

/**
 * Quick Action buttons component
 */
class QuickActions extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private importBtn: Container;
    private resetBtn: Container;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            class: 'vln-quick-actions'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        this.buildUI();
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // Import button
        this.importBtn = this.createActionButton('导入任务', 'primary', () => {
            this.events.fire('vln.ui.importTask');
        });
        this.append(this.importBtn);

        // Reset/Clear button
        this.resetBtn = this.createActionButton('重置', 'danger', () => {
            this.events.fire(VLNEventNames.TASK_CLEAR);
        });
        this.append(this.resetBtn);

        // Register tooltips
        this.tooltips.register(this.importBtn, '导入 VLN 任务文件 (JSON)', 'top');
        this.tooltips.register(this.resetBtn, '清空当前任务和录制数据', 'top');
    }

    /**
     * Create an action button
     */
    private createActionButton(
        text: string, 
        style: 'default' | 'primary' | 'danger',
        onClick: () => void
    ): Container {
        const btn = new Container({
            class: ['vln-quick-action-btn', style]
        });

        const label = new Label({
            text: text
        });
        btn.append(label);

        // Click handler
        btn.dom.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            onClick();
        });

        // Pointer events
        btn.dom.addEventListener('pointerdown', (e: Event) => e.stopPropagation());

        btn.dom.style.cursor = 'pointer';

        return btn;
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Enable/disable import button
     */
    setImportEnabled(enabled: boolean): void {
        this.importBtn.dom.style.opacity = enabled ? '1' : '0.4';
        this.importBtn.dom.style.pointerEvents = enabled ? 'auto' : 'none';
    }
}

export { QuickActions };
