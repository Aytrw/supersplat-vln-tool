/**
 * Instruction Panel - HUD Module A
 * 
 * Position: Bottom-Left
 * Content: Navigation instruction text display
 */

import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';
import { Tooltips } from '../../tooltips';
import { VLNEventNames, VLNTask } from '../../../vln/types';

/**
 * Instruction Panel for displaying navigation instructions
 */
class InstructionPanel extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // UI elements
    private contentContainer: Container;
    private countBadge: Label;
    private instructionSteps: Container[] = [];
    private emptyHint: Label;
    
    // Current state
    private currentIndex: number = -1;
    private instructions: string[] = [];

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-instruction-panel',
            class: 'vln-hud-panel'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // Block pointer events from passing through to canvas
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
        // Header
        const header = new Container({
            class: 'vln-hud-header'
        });

        const headerIcon = new Element({
            class: 'vln-hud-header-icon'
        });
        headerIcon.dom.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true" focusable="false">
                <path d="M3 12h4l3-9 4 18 3-9h4"/>
            </svg>
        `;

        const headerTitle = new Label({
            text: '导航指令',
            class: 'vln-hud-header-title'
        });

        this.countBadge = new Label({
            text: '0',
            class: 'vln-hud-header-badge'
        });

        header.append(headerIcon);
        header.append(headerTitle);
        header.append(this.countBadge);
        this.append(header);

        // Content container
        this.contentContainer = new Container({
            class: 'vln-instruction-content'
        });

        // Empty state hint
        this.emptyHint = new Label({
            text: '暂无导航指令',
            class: 'vln-instruction-empty'
        });
        this.contentContainer.append(this.emptyHint);

        this.append(this.contentContainer);
    }

    /**
     * Register events
     */
    private registerEvents(): void {
        // Task loaded
        this.events.on(VLNEventNames.TASK_LOADED, (task: VLNTask) => {
            if (task && task.instructions) {
                this.setInstructions(task.instructions);
            }
        });

        // Task cleared
        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.clearInstructions();
        });

        // Instruction index changed
        this.events.on(VLNEventNames.INSTRUCTION_CHANGED, (index: number) => {
            this.setCurrentIndex(index);
        });
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Set instruction list
     */
    setInstructions(instructions: string[]): void {
        // Clear existing
        this.clearInstructions();

        if (!instructions || instructions.length === 0) {
            return;
        }

        // Store instructions
        this.instructions = instructions;

        // Hide empty hint
        this.emptyHint.hidden = true;

        // Update badge count
        this.countBadge.text = instructions.length.toString();

        // Create instruction steps
        instructions.forEach((instruction, index) => {
            const step = this.createInstructionStep(index, instruction);
            this.contentContainer.append(step);
            this.instructionSteps.push(step);
        });
    }

    /**
     * Clear instructions
     */
    clearInstructions(): void {
        // Remove all steps
        for (const step of this.instructionSteps) {
            step.destroy();
        }
        this.instructionSteps = [];
        this.instructions = [];
        this.currentIndex = -1;

        // Show empty hint
        this.emptyHint.hidden = false;

        // Update badge
        this.countBadge.text = '0';
    }

    /**
     * Set current instruction index
     */
    setCurrentIndex(index: number): void {
        // Remove previous highlight
        if (this.currentIndex >= 0 && this.currentIndex < this.instructionSteps.length) {
            this.instructionSteps[this.currentIndex].class.remove('active');
        }

        // Set new index
        this.currentIndex = index;

        // Add new highlight
        if (index >= 0 && index < this.instructionSteps.length) {
            this.instructionSteps[index].class.add('active');
            
            // Scroll into view
            const stepDom = this.instructionSteps[index].dom;
            stepDom.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Get current index
     */
    getCurrentIndex(): number {
        return this.currentIndex;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Create instruction step element
     */
    private createInstructionStep(index: number, text: string): Container {
        const step = new Container({
            class: 'vln-instruction-step'
        });

        // Index badge
        const indexLabel = new Label({
            text: (index + 1).toString(),
            class: 'vln-instruction-step-index'
        });

        // Text content
        const textLabel = new Label({
            text: text,
            class: 'vln-instruction-step-text'
        });

        step.append(indexLabel);
        step.append(textLabel);

        // Click to select
        step.dom.addEventListener('click', () => {
            this.events.fire(VLNEventNames.INSTRUCTION_SELECT, index);
            this.setCurrentIndex(index);
        });

        step.dom.style.cursor = 'pointer';

        return step;
    }
}

export { InstructionPanel };
