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

import { Container } from '@playcanvas/pcui';

import { Events } from '../../events';
import { Tooltips } from '../tooltips';
import { VLNEventNames, VLNTask, RecordingStatus } from '../../vln/types';

// Import sub-modules
import { InstructionPanel } from './hud/instruction-panel';
import { RecorderBar } from './hud/recorder-bar';
import { AuxiliaryView } from './hud/auxiliary-view';
import { TaskBadge } from './hud/task-badge';
import { QuickActions } from './hud/quick-actions';
import { FlyHint } from './hud/fly-hint';

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
    private quickActions: QuickActions;
    private flyHint: FlyHint;

    private bottomBarDom?: HTMLElement;
    private instructionPanelDom?: HTMLElement;
    private flyHintDom?: HTMLElement;
    
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
        this.instructionPanelDom = this.instructionPanel.dom;

        // Unified VLN Bottom Toolbar (contains recorder + quick actions)
        const vlnBottomBar = new Container({
            id: 'vln-bottom-bar'
        });
        // Block pointer events from passing through
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            vlnBottomBar.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // Task Info Badge (integrated into the middle bar)
        this.taskBadge = new TaskBadge(this.events);
        vlnBottomBar.append(this.taskBadge);

        // Quick Action Buttons
        this.quickActions = new QuickActions(this.events, this.tooltips);
        vlnBottomBar.append(this.quickActions);

        // Module B: Recorder Control Bar (right side)
        this.recorderBar = new RecorderBar(this.events, this.tooltips);
        vlnBottomBar.append(this.recorderBar);

        this.append(vlnBottomBar);

        this.bottomBarDom = vlnBottomBar.dom;
        this.setupBottomBarPositioning();

        // Module C: Auxiliary View Placeholder (Top-Right)
        this.auxiliaryView = new AuxiliaryView(this.events, this.tooltips);
        this.append(this.auxiliaryView);

        // Fly hint (Bottom-Right)
        this.flyHint = new FlyHint(this.events);
        this.append(this.flyHint);
        this.flyHintDom = this.flyHint.dom;
    }

    private setupBottomBarPositioning(): void {
        const bottomBarDom = this.bottomBarDom;
        if (!bottomBarDom) return;

        const gapPx = 8;

        const isVisible = (el: HTMLElement | null): el is HTMLElement => {
            if (!el) return false;
            if (el.classList.contains('pcui-hidden')) return false;
            // offsetParent is null for display:none, but still true for fixed/absolute
            // elements in normal rendering; good enough for our toolbar usage.
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
            return true;
        };

        const pickTargetToolbar = (): HTMLElement | null => {
            const selectToolbar = document.querySelector('.select-toolbar') as HTMLElement | null;
            const bottomToolbar = document.getElementById('bottom-toolbar') as HTMLElement | null;

            if (isVisible(selectToolbar)) return selectToolbar;
            if (isVisible(bottomToolbar)) return bottomToolbar;
            return selectToolbar || bottomToolbar;
        };

        const update = () => {
            const target = pickTargetToolbar();
            if (!target) return;

            const rect = target.getBoundingClientRect();
            // Place VLN bar above the target toolbar top edge.
            const bottom = Math.max(0, Math.round(window.innerHeight - rect.top + gapPx));
            bottomBarDom.style.bottom = `${bottom}px`;

            // Keep instruction panel bottom aligned with SuperSplat native middle toolbar bottom.
            this.updateInstructionPanelLayout();
        };

        // Initial positioning after layout
        requestAnimationFrame(update);

        // Track size/visibility changes of toolbars with minimal overhead
        const toolbarObserver = new MutationObserver(() => update());

        const tryObserveToolbars = () => {
            const selectToolbar = document.querySelector('.select-toolbar') as HTMLElement | null;
            const bottomToolbar = document.getElementById('bottom-toolbar') as HTMLElement | null;

            if (selectToolbar) {
                toolbarObserver.observe(selectToolbar, { attributes: true, attributeFilter: ['class', 'style'] });
            }
            if (bottomToolbar) {
                toolbarObserver.observe(bottomToolbar, { attributes: true, attributeFilter: ['class', 'style'] });
            }
        };

        tryObserveToolbars();

        // If toolbars are created later, re-attach observers and update.
        const bodyObserver = new MutationObserver(() => {
            tryObserveToolbars();
            update();
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('resize', update);
    }

    private updateInstructionPanelLayout(): void {
        const panelDom = this.instructionPanelDom;
        if (!panelDom) return;

        const isVisible = (el: HTMLElement | null): el is HTMLElement => {
            if (!el) return false;
            if (el.classList.contains('pcui-hidden')) return false;
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
            return true;
        };

        // Prefer SuperSplat native "middle bar" (.select-toolbar). Fallback to bottom toolbar.
        const selectToolbar = document.querySelector('.select-toolbar') as HTMLElement | null;
        const bottomToolbar = document.getElementById('bottom-toolbar') as HTMLElement | null;
        const anchor = (isVisible(selectToolbar) ? selectToolbar : (isVisible(bottomToolbar) ? bottomToolbar : (selectToolbar || bottomToolbar)));
        if (!anchor) return;

        const anchorRect = anchor.getBoundingClientRect();
        const anchorBottomPx = Math.max(0, Math.round(window.innerHeight - anchorRect.bottom));

        // Bottom-align with the native toolbar bottom edge
        panelDom.style.bottom = `${anchorBottomPx}px`;

        // Increase max height so instructions can be fully shown (scrollable)
        // Leave a safe top margin for menu/robot view.
        const topMarginPx = 24;
        const maxHeightPx = Math.max(240, Math.floor(window.innerHeight - anchorBottomPx - topMarginPx));
        panelDom.style.maxHeight = `${maxHeightPx}px`;

        // Keep fly hint aligned above instruction panel
        this.updateFlyHintLayout();
    }

    private updateFlyHintLayout(): void {
        // Fly hint is now centered via CSS, no dynamic positioning needed
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
