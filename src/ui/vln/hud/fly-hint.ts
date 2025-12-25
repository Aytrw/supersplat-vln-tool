/**
 * Fly Hint - HUD Element
 *
 * Purpose:
 * - When fly mode is enabled, show a compact cheat-sheet for keyboard controls.
 * - When the user starts using keys, briefly “wake” the hint so it is noticeable.
 */

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';

class FlyHint extends Container {
    private events: Events;

    private content: Container;
    private wakeTimer: number | null = null;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'vln-fly-hint',
            class: ['vln-hud-panel', 'vln-fly-hint']
        };

        super(args);

        this.events = events;

        // Don’t block the canvas; it’s informational.
        this.dom.style.pointerEvents = 'none';

        this.buildUI();
        this.registerEvents();

        // Hidden until fly mode enabled
        this.hidden = true;
    }

    private buildUI(): void {
        const header = new Container({ class: 'vln-fly-hint-header' });

        const title = new Label({
            text: '飞行操作提示',
            class: 'vln-fly-hint-title'
        });

        header.append(title);
        this.append(header);

        this.content = new Container({ class: 'vln-fly-hint-content' });

        const keyboard = new Label({
            class: 'vln-fly-hint-text',
            text: [
                '  移动  W/A/S/D',
                '  上升  Space / E',
                '  下降  Ctrl / Q / C',
                '  转向  方向键 或 I/J/K/L',
                '  加速  Shift    减速  Alt',
                '  切换  V'
            ].join('\n')
        });

        this.content.append(keyboard);
        this.append(this.content);
    }

    private registerEvents(): void {
        this.events.on('vln.camera.flyMode', (enabled: boolean) => {
            this.hidden = !enabled;
            if (enabled) {
                this.wake();
            }
        });

        // Fired by FlyControls when the user starts pressing fly-related keys
        this.events.on('vln.camera.flyInput', () => {
            if (!this.hidden) {
                this.wake();
            }
        });
    }

    private wake(): void {
        this.dom.classList.add('is-wake');

        if (this.wakeTimer !== null) {
            window.clearTimeout(this.wakeTimer);
        }

        this.wakeTimer = window.setTimeout(() => {
            this.dom.classList.remove('is-wake');
            this.wakeTimer = null;
        }, 1600);
    }
}

export { FlyHint };
