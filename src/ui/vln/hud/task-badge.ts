/**
 * Task Badge - HUD Element
 * 
 * Position: Top-Left
 * Content: Task ID and Scene ID display (compact badge)
 */

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { VLNEventNames, VLNTask } from '../../../vln/types';

/**
 * Task info badge component
 */
class TaskBadge extends Container {
    private events: Events;
    
    // UI elements
    private taskIdValue: Label;
    private sceneIdValue: Label;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'vln-task-badge',
            class: 'vln-hud-panel'
        };

        super(args);

        this.events = events;

        // Block pointer events
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.buildUI();
        this.registerEvents();
        
        // Initially hidden until task loaded
        this.hidden = true;
    }

    /**
     * Build UI structure
     */
    private buildUI(): void {
        // Task ID item
        const taskItem = new Container({
            class: 'vln-task-badge-item'
        });

        const taskLabel = new Label({
            text: '任务',
            class: 'vln-task-badge-label'
        });

        this.taskIdValue = new Label({
            text: '--',
            class: 'vln-task-badge-value'
        });

        taskItem.append(taskLabel);
        taskItem.append(this.taskIdValue);
        this.append(taskItem);

        // Separator
        const separator = new Container({
            class: 'vln-task-badge-separator'
        });
        this.append(separator);

        // Scene ID item
        const sceneItem = new Container({
            class: 'vln-task-badge-item'
        });

        const sceneLabel = new Label({
            text: '场景',
            class: 'vln-task-badge-label'
        });

        this.sceneIdValue = new Label({
            text: '--',
            class: 'vln-task-badge-value'
        });

        sceneItem.append(sceneLabel);
        sceneItem.append(this.sceneIdValue);
        this.append(sceneItem);
    }

    /**
     * Register events
     */
    private registerEvents(): void {
        // Task loaded
        this.events.on(VLNEventNames.TASK_LOADED, (task: VLNTask) => {
            this.setTaskInfo(task);
            this.hidden = false;
        });

        // Task cleared
        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.clearTaskInfo();
            this.hidden = true;
        });
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Set task information
     */
    setTaskInfo(task: VLNTask): void {
        if (task) {
            this.taskIdValue.text = this.truncateId(task.id || '--');
            this.sceneIdValue.text = this.truncateId(task.sceneId || '--');
        }
    }

    /**
     * Clear task information
     */
    clearTaskInfo(): void {
        this.taskIdValue.text = '--';
        this.sceneIdValue.text = '--';
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Truncate long IDs for display
     */
    private truncateId(id: string, maxLength: number = 12): string {
        if (id.length <= maxLength) {
            return id;
        }
        return id.substring(0, maxLength - 2) + '..';
    }
}

export { TaskBadge };
