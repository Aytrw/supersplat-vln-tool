/**
 * Fly Hint - HUD Element
 *
 * Purpose:
 * - When fly mode is enabled, show a compact cheat-sheet for keyboard controls.
 * - Centered on screen, user can close it via button or toggle via event.
 */

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../../../events';

class FlyHint extends Container {
    private events: Events;

    private content: Container;
    private wakeTimer: number | null = null;
    private userDismissed = false;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'vln-fly-hint',
            class: ['vln-hud-panel', 'vln-fly-hint']
        };

        super(args);

        this.events = events;

        // Allow pointer events for close button
        this.dom.style.pointerEvents = 'auto';

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
        // Use a native button to avoid any PCUI event/pointer quirks.
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'vln-fly-hint-close';
        closeBtn.setAttribute('aria-label', '关闭');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.userDismissed = true;
            this.hidden = true;
        });
        header.dom.appendChild(closeBtn);
        this.append(header);

        this.content = new Container({ class: 'vln-fly-hint-content' });

        // Build visual key diagram
        const visual = document.createElement('div');
        visual.className = 'vln-fly-hint-visual';

        const makeKeycap = (label: string, extraClass?: string) => {
            const el = document.createElement('div');
            el.className = extraClass ? `vln-keycap ${extraClass}` : 'vln-keycap';
            el.textContent = label;
            return el;
        };

        // Main controls row: WASD diagram + Vertical controls
        const mainRow = document.createElement('div');
        mainRow.className = 'vln-fly-hint-main';

        // WASD diagram (movement)
        const wasdBox = document.createElement('div');
        wasdBox.className = 'vln-fly-hint-wasd';
        const wasdLabel = document.createElement('div');
        wasdLabel.className = 'vln-fly-hint-section-label';
        wasdLabel.textContent = '移动';
        const wasdGrid = document.createElement('div');
        wasdGrid.className = 'vln-fly-hint-wasd-grid';
        wasdGrid.appendChild(makeKeycap('W'));
        const wasdMiddle = document.createElement('div');
        wasdMiddle.className = 'vln-fly-hint-wasd-middle';
        wasdMiddle.appendChild(makeKeycap('A'));
        wasdMiddle.appendChild(makeKeycap('S'));
        wasdMiddle.appendChild(makeKeycap('D'));
        wasdGrid.appendChild(wasdMiddle);
        wasdBox.appendChild(wasdLabel);
        wasdBox.appendChild(wasdGrid);

        // Vertical controls (Space/Ctrl)
        const vertBox = document.createElement('div');
        vertBox.className = 'vln-fly-hint-vert';
        const vertLabel = document.createElement('div');
        vertLabel.className = 'vln-fly-hint-section-label';
        vertLabel.textContent = '上升 / 下降';
        const vertKeys = document.createElement('div');
        vertKeys.className = 'vln-fly-hint-vert-keys';
        const spaceRow = document.createElement('div');
        spaceRow.className = 'vln-fly-hint-vert-row';
        spaceRow.appendChild(makeKeycap('Space', 'vln-keycap--wide'));
        spaceRow.appendChild(document.createTextNode(' ↑'));
        const ctrlRow = document.createElement('div');
        ctrlRow.className = 'vln-fly-hint-vert-row';
        ctrlRow.appendChild(makeKeycap('Ctrl', 'vln-keycap--wide'));
        ctrlRow.appendChild(document.createTextNode(' ↓'));
        vertKeys.appendChild(spaceRow);
        vertKeys.appendChild(ctrlRow);
        vertBox.appendChild(vertLabel);
        vertBox.appendChild(vertKeys);

        mainRow.appendChild(wasdBox);
        mainRow.appendChild(vertBox);
        visual.appendChild(mainRow);

        // Extra controls row
        const extra = document.createElement('div');
        extra.className = 'vln-fly-hint-extra';

        const makeGroup = (label: string, keys: string[]) => {
            const group = document.createElement('div');
            group.className = 'vln-fly-hint-extra-group';
            const lab = document.createElement('div');
            lab.className = 'vln-fly-hint-extra-label';
            lab.textContent = label;
            group.appendChild(lab);
            keys.forEach((k) => group.appendChild(makeKeycap(k, k.length > 1 ? 'vln-keycap--wide' : undefined)));
            return group;
        };

        extra.appendChild(makeGroup('翻滚', ['Q', 'E']));
        extra.appendChild(makeGroup('速度', ['Shift', 'Alt']));
        extra.appendChild(makeGroup('提示', ['H']));
        extra.appendChild(makeGroup('切换飞行', ['V']));

        const look = document.createElement('div');
        look.className = 'vln-fly-hint-look';
        look.textContent = '转向：右键拖拽（或 方向键 / IJKL）       提示开关：H';

        visual.appendChild(extra);
        visual.appendChild(look);

        this.content.dom.appendChild(visual);
        this.append(this.content);
    }

    private registerEvents(): void {
        this.events.on('vln.camera.flyMode', (enabled: boolean) => {
            if (enabled && !this.userDismissed) {
                this.hidden = false;
                this.wake();
            } else if (!enabled) {
                this.hidden = true;
                // Reset dismissed state when exiting fly mode, so it shows again next time
                this.userDismissed = false;
            }
        });

        // Fired by FlyControls when the user starts pressing fly-related keys
        this.events.on('vln.camera.flyInput', () => {
            if (!this.hidden) {
                this.wake();
            }
        });

        // Allow external toggle (e.g., from a menu or shortcut)
        this.events.on('vln.flyHint.toggle', () => {
            if (this.hidden) {
                this.userDismissed = false;
                this.hidden = false;
            } else {
                this.userDismissed = true;
                this.hidden = true;
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

    /** Show the hint (resets userDismissed) */
    show(): void {
        this.userDismissed = false;
        this.hidden = false;
    }
}

export { FlyHint };
