/**
 * VLN HUD Overlay
 * 
 * Immersive HUD overlay mode for VLN annotation tool
 * Features:
 * - Full-screen transparent overlay
 * - Pointer-events passthrough for 3D interaction
 * - Frosted glass effect panels
 * - FPS/drone-style UI layout
 */

import { Container, Label, Button } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { VLNEventNames, VLNTask, RecordingStatus } from '../../vln/types';

// Import sub-modules
import { InstructionPanel } from './hud/instruction-panel';
import { RecorderBar } from './hud/recorder-bar';
import { AuxiliaryView } from './hud/auxiliary-view';
import { TaskBadge } from './hud/task-badge';
import { FOVIndicator } from './hud/fov-indicator';
import { QuickActions } from './hud/quick-actions';

/**
 * VLN HUD Overlay main container
 */
class VLNHudOverlay extends Container {
    private events: Events;
    private tooltips: Tooltips;
    
    // HUD Modules
    private instructionPanel: InstructionPanel;
    private recorderBar: RecorderBar;
    private auxiliaryView: AuxiliaryView;
    private taskBadge: TaskBadge;
    private fovIndicator: FOVIndicator;
    private quickActions: QuickActions;
    
    // Visibility state
    private isVisible: boolean = true;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'vln-hud-overlay'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // Build HUD layout
        this.buildHUD();
        
        // Register events
        this.registerEvents();
    }

    /**
     * Build HUD layout with all modules
     */
    private buildHUD(): void {
        // Module A: Instruction Panel (Bottom-Left)
        this.instructionPanel = new InstructionPanel(this.events, this.tooltips);
        this.append(this.instructionPanel);

        // Module B: Recorder Control Bar (Bottom-Center)
        this.recorderBar = new RecorderBar(this.events, this.tooltips);
        this.append(this.recorderBar);

        // Module C: Auxiliary View Placeholder (Top-Right)
        this.auxiliaryView = new AuxiliaryView(this.events);
        this.append(this.auxiliaryView);

        // Task Info Badge (Top-Left)
        this.taskBadge = new TaskBadge(this.events);
        this.append(this.taskBadge);

        // FOV Indicator (Bottom-Right)
        this.fovIndicator = new FOVIndicator(this.events, this.tooltips);
        this.append(this.fovIndicator);

        // Quick Action Buttons (Above recorder bar)
        this.quickActions = new QuickActions(this.events, this.tooltips);
        this.append(this.quickActions);
    }

    /**
     * Register global events
     */
    private registerEvents(): void {
        // Toggle HUD visibility
        this.events.on(VLNEventNames.PANEL_TOGGLE, () => {
            this.toggleVisibility();
        });

        // Show/hide HUD
        this.events.on(VLNEventNames.PANEL_VISIBLE, (visible: boolean) => {
            this.setVisibility(visible);
        });
    }

    // ========================================================================
    // Public Interface
    // ========================================================================

    /**
     * Toggle HUD visibility
     */
    toggleVisibility(): void {
        this.isVisible = !this.isVisible;
        this.hidden = !this.isVisible;
        this.events.fire(VLNEventNames.PANEL_VISIBLE, this.isVisible);
    }

    /**
     * Set HUD visibility
     */
    setVisibility(visible: boolean): void {
        this.isVisible = visible;
        this.hidden = !visible;
    }

    /**
     * Show HUD
     */
    show(): void {
        this.setVisibility(true);
    }

    /**
     * Hide HUD
     */
    hide(): void {
        this.setVisibility(false);
    }

    /**
     * Get instruction panel for external access
     */
    getInstructionPanel(): InstructionPanel {
        return this.instructionPanel;
    }

    /**
     * Get recorder bar for external access
     */
    getRecorderBar(): RecorderBar {
        return this.recorderBar;
    }
}

export { VLNHudOverlay };
