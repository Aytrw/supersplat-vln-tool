/**
 * VLN 模块入口
 * 
 * 导出所有 VLN 相关的模块和类型
 */

// 类型定义
export * from './types';

// 核心模块
export { VLNManager } from './vln-manager';
export { PathRecorder } from './path-recorder';
export { CameraController } from './camera-controller';
export { PathVisualizer } from './path-visualizer';
export { DataLoader } from './data-loader';
export { FileSaver } from './file-saver';

// 事件注册
export { registerVLNEvents, destroyVLNModules, getVLNModules } from './vln-events';
export type { VLNModules } from './vln-events';
