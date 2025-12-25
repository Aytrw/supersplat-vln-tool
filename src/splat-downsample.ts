/**
 * Gaussian Splat 点云降采样工具
 * 
 * 通过随机采样或基于重要性的采样来减少点云数量，提升渲染性能
 */

import { GSplatData } from 'playcanvas';

/**
 * 降采样选项
 */
export interface DownsampleOptions {
    /** 目标点数（如果设置，会覆盖 ratio） */
    targetCount?: number;
    /** 保留比例 (0-1)，默认 1.0 表示不降采样 */
    ratio?: number;
    /** 采样方法：'random' | 'importance' */
    method?: 'random' | 'importance';
    /** 随机种子（可选，用于可重复的结果） */
    seed?: number;
}

/**
 * 简单的伪随机数生成器（可设定种子）
 */
class SeededRandom {
    private seed: number;

    constructor(seed: number = Date.now()) {
        this.seed = seed;
    }

    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

/**
 * 计算点的重要性分数
 * 基于 opacity 和 scale 的组合
 */
function calculateImportance(
    opacity: Float32Array,
    scale0: Float32Array,
    scale1: Float32Array,
    scale2: Float32Array,
    index: number
): number {
    // opacity 越高越重要
    const opacityScore = 1 / (1 + Math.exp(-opacity[index])); // sigmoid 归一化

    // scale 越大的点越重要（视觉影响越大）
    const avgScale = (
        Math.exp(scale0[index]) +
        Math.exp(scale1[index]) +
        Math.exp(scale2[index])
    ) / 3;

    // 组合分数
    return opacityScore * Math.sqrt(avgScale);
}

/**
 * 对 GSplatData 进行降采样
 * 
 * @param splatData 原始点云数据
 * @param options 降采样选项
 * @returns 降采样后的点云数据
 */
export function downsampleGSplat(
    splatData: GSplatData,
    options: DownsampleOptions = {}
): GSplatData {
    const {
        targetCount,
        ratio = 1.0,
        method = 'importance',
        seed
    } = options;

    const originalCount = splatData.numSplats;

    // 计算目标数量
    let targetNum: number;
    if (targetCount !== undefined && targetCount > 0) {
        targetNum = Math.min(targetCount, originalCount);
    } else {
        targetNum = Math.floor(originalCount * Math.max(0, Math.min(1, ratio)));
    }

    // 如果不需要降采样，直接返回原数据
    if (targetNum >= originalCount) {
        console.log(`GSplat downsample: keeping all ${originalCount} splats`);
        return splatData;
    }

    console.log(`GSplat downsample: ${originalCount} -> ${targetNum} splats (${(targetNum / originalCount * 100).toFixed(1)}%)`);

    // 获取所有属性
    const element = splatData.getElement('vertex');
    const properties = element.properties;

    // 选择要保留的索引
    let selectedIndices: Uint32Array;

    if (method === 'importance') {
        // 基于重要性采样
        const opacity = splatData.getProp('opacity') as Float32Array;
        const scale0 = splatData.getProp('scale_0') as Float32Array;
        const scale1 = splatData.getProp('scale_1') as Float32Array;
        const scale2 = splatData.getProp('scale_2') as Float32Array;

        // 计算所有点的重要性
        const importance = new Float32Array(originalCount);
        for (let i = 0; i < originalCount; i++) {
            importance[i] = calculateImportance(opacity, scale0, scale1, scale2, i);
        }

        // 创建索引数组并按重要性排序
        const indices = new Uint32Array(originalCount);
        for (let i = 0; i < originalCount; i++) {
            indices[i] = i;
        }

        // 按重要性降序排序
        indices.sort((a, b) => importance[b] - importance[a]);

        // 选择最重要的点
        selectedIndices = indices.slice(0, targetNum);

        // 按原始顺序排序（保持空间局部性）
        selectedIndices.sort((a, b) => a - b);
    } else {
        // 随机采样
        const rng = new SeededRandom(seed);

        // Fisher-Yates shuffle 的变体，只 shuffle 前 targetNum 个
        const indices = new Uint32Array(originalCount);
        for (let i = 0; i < originalCount; i++) {
            indices[i] = i;
        }

        for (let i = 0; i < targetNum; i++) {
            const j = i + Math.floor(rng.next() * (originalCount - i));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        selectedIndices = indices.slice(0, targetNum);
        selectedIndices.sort((a, b) => a - b);
    }

    // 创建新的属性数组
    const newProperties: any[] = [];

    for (const prop of properties) {
        const oldStorage = prop.storage;
        let newStorage: any;

        if (oldStorage instanceof Float32Array) {
            newStorage = new Float32Array(targetNum);
        } else if (oldStorage instanceof Uint8Array) {
            newStorage = new Uint8Array(targetNum);
        } else if (oldStorage instanceof Uint16Array) {
            newStorage = new Uint16Array(targetNum);
        } else if (oldStorage instanceof Uint32Array) {
            newStorage = new Uint32Array(targetNum);
        } else if (oldStorage instanceof Int8Array) {
            newStorage = new Int8Array(targetNum);
        } else if (oldStorage instanceof Int16Array) {
            newStorage = new Int16Array(targetNum);
        } else if (oldStorage instanceof Int32Array) {
            newStorage = new Int32Array(targetNum);
        } else {
            // 默认使用 Float32Array
            newStorage = new Float32Array(targetNum);
        }

        // 复制选中的数据
        for (let i = 0; i < targetNum; i++) {
            newStorage[i] = oldStorage[selectedIndices[i]];
        }

        newProperties.push({
            type: prop.type,
            name: prop.name,
            storage: newStorage,
            byteSize: prop.byteSize
        });
    }

    // 创建新的 GSplatData
    return new GSplatData([{
        name: 'vertex',
        count: targetNum,
        properties: newProperties
    }]);
}

/**
 * 根据点云大小建议降采样比例
 */
export function suggestDownsampleRatio(numSplats: number): number {
    // 经验值：
    // < 500K: 不需要降采样
    // 500K - 1M: 建议 0.8
    // 1M - 2M: 建议 0.5
    // 2M - 5M: 建议 0.3
    // > 5M: 建议 0.2

    if (numSplats < 500_000) {
        return 1.0;
    } else if (numSplats < 1_000_000) {
        return 0.8;
    } else if (numSplats < 2_000_000) {
        return 0.5;
    } else if (numSplats < 5_000_000) {
        return 0.3;
    } else {
        return 0.2;
    }
}

/**
 * 格式化点数显示
 */
export function formatSplatCount(count: number): string {
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(2)}M`;
    } else if (count >= 1_000) {
        return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
}
