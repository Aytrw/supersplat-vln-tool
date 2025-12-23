/**
 * 路径指示信息框
 * 
 * 显示 VLN 任务的导航指令列表
 */

import { Container, Label, TextAreaInput } from '@playcanvas/pcui';

import { Events } from '../../events';
import { VLNEventNames, VLNTask } from '../../vln/types';

/**
 * 路径信息框类
 */
class PathInfoBox extends Container {
    private events: Events;
    
    // UI 组件
    private instructionList: Container;
    private instructionItems: Container[] = [];
    
    // 当前选中的指令索引
    private currentInstructionIndex: number = -1;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: ['vln-section', 'vln-instruction-box']
        };

        super(args);
        this.events = events;

        this.buildUI();
        this.registerEvents();
    }

    /**
     * 构建 UI
     */
    private buildUI(): void {
        // 指令计数（标题已移至可折叠区域头部）
        const countLabel = new Label({
            text: '(0 条)',
            class: 'vln-instruction-count'
        });

        // 指令列表容器
        this.instructionList = new Container({
            class: 'vln-instruction-list'
        });

        // Empty state hint
        const emptyHint = new Label({
            text: '暂无导航指令，请导入任务',
            class: 'vln-instruction-empty'
        });
        this.instructionList.append(emptyHint);

        this.append(countLabel);
        this.append(this.instructionList);

        // 保存引用
        (this as any)._countLabel = countLabel;
        (this as any)._emptyHint = emptyHint;
    }

    /**
     * 注册事件
     */
    private registerEvents(): void {
        // 任务加载完成
        this.events.on(VLNEventNames.TASK_LOADED, (task: VLNTask) => {
            this.setInstructions(task.instructions);
        });

        // 任务清空
        this.events.on(VLNEventNames.TASK_CLEARED, () => {
            this.clearInstructions();
        });
    }

    // ========================================================================
    // 公共接口
    // ========================================================================

    /**
     * 设置指令列表
     */
    setInstructions(instructions: string[]): void {
        // 清空现有指令
        this.clearInstructions();

        if (!instructions || instructions.length === 0) {
            return;
        }

        // 隐藏空状态提示
        const emptyHint = (this as any)._emptyHint as Label;
        if (emptyHint) {
            emptyHint.hidden = true;
        }

        // Update count
        const countLabel = (this as any)._countLabel as Label;
        if (countLabel) {
            countLabel.text = `(${instructions.length} 条)`;
        }

        // 创建指令项
        instructions.forEach((instruction, index) => {
            const item = this.createInstructionItem(index, instruction);
            this.instructionList.append(item);
            this.instructionItems.push(item);
        });
    }

    /**
     * 清空指令列表
     */
    clearInstructions(): void {
        // 移除所有指令项
        for (const item of this.instructionItems) {
            item.destroy();
        }
        this.instructionItems = [];

        // 显示空状态提示
        const emptyHint = (this as any)._emptyHint as Label;
        if (emptyHint) {
            emptyHint.hidden = false;
        }

        // Update count
        const countLabel = (this as any)._countLabel as Label;
        if (countLabel) {
            countLabel.text = '(0 条)';
        }

        this.currentInstructionIndex = -1;
    }

    /**
     * 设置当前指令索引
     */
    setCurrentIndex(index: number): void {
        // 移除之前的高亮
        if (this.currentInstructionIndex >= 0 && this.currentInstructionIndex < this.instructionItems.length) {
            this.instructionItems[this.currentInstructionIndex].class.remove('vln-instruction-active');
        }

        // 设置新的高亮
        this.currentInstructionIndex = index;
        if (index >= 0 && index < this.instructionItems.length) {
            this.instructionItems[index].class.add('vln-instruction-active');
            
            // 滚动到可见区域
            this.instructionItems[index].dom.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // 触发事件
        this.events.fire('vln.instruction.indexChanged', index);
    }

    /**
     * 获取当前指令索引
     */
    getCurrentIndex(): number {
        return this.currentInstructionIndex;
    }

    /**
     * 下一条指令
     */
    nextInstruction(): void {
        if (this.currentInstructionIndex < this.instructionItems.length - 1) {
            this.setCurrentIndex(this.currentInstructionIndex + 1);
        }
    }

    /**
     * 上一条指令
     */
    prevInstruction(): void {
        if (this.currentInstructionIndex > 0) {
            this.setCurrentIndex(this.currentInstructionIndex - 1);
        }
    }

    // ========================================================================
    // 私有方法
    // ========================================================================

    /**
     * 创建指令项
     */
    private createInstructionItem(index: number, instruction: string): Container {
        const item = new Container({
            class: 'vln-instruction-item'
        });

        const indexLabel = new Label({
            text: `${index + 1}.`,
            class: 'vln-instruction-index'
        });

        const textLabel = new Label({
            text: instruction,
            class: 'vln-instruction-text'
        });

        item.append(indexLabel);
        item.append(textLabel);

        // 点击选中
        item.dom.addEventListener('click', () => {
            this.setCurrentIndex(index);
        });

        return item;
    }
}

export { PathInfoBox };
