/**
 * VLN 事件注册
 * 
 * 注册所有 VLN 相关的事件和初始化各模块
 */

import { Events } from '../events';
import { Scene } from '../scene';
import { VLNManager } from './vln-manager';
import { PathRecorder } from './path-recorder';
import { CameraController } from './camera-controller';
import { PathVisualizer } from './path-visualizer';
import { DataLoader } from './data-loader';
import { FlyControls } from './fly-controls';
import { FileSaver } from './file-saver';

/**
 * VLN 模块实例容器
 */
interface VLNModules {
    manager: VLNManager;
    recorder: PathRecorder;
    cameraController: CameraController;
    visualizer: PathVisualizer;
    dataLoader: DataLoader;
    flyControls: FlyControls;
    fileSaver: FileSaver;
}

let vlnModules: VLNModules | null = null;

/**
 * 注册 VLN 事件和初始化模块
 */
function registerVLNEvents(events: Events, scene: Scene): VLNModules {
    console.log('VLN: Registering events and initializing modules');

    // 创建各模块实例
    const manager = new VLNManager(events, scene);
    const recorder = new PathRecorder(events, scene);
    const cameraController = new CameraController(events, scene);
    const visualizer = new PathVisualizer(events, scene);
    const dataLoader = new DataLoader(events);
    const flyControls = new FlyControls(events, scene);
    const fileSaver = new FileSaver(events);

    // 初始化模块
    manager.initialize();
    recorder.initialize();
    cameraController.initialize();
    visualizer.initialize();
    dataLoader.initialize();
    flyControls.initialize();
    fileSaver.initialize();

    // 保存模块引用
    vlnModules = {
        manager,
        recorder,
        cameraController,
        visualizer,
        dataLoader,
        flyControls,
        fileSaver
    };

    // 注册全局函数
    events.function('vln.modules', () => vlnModules);

    console.log('VLN: All modules initialized');

    return vlnModules;
}

/**
 * 销毁 VLN 模块
 */
function destroyVLNModules(): void {
    if (vlnModules) {
        vlnModules.manager.destroy();
        vlnModules.recorder.destroy();
        vlnModules.cameraController.destroy();
        vlnModules.fileSaver.destroy();
        vlnModules.visualizer.destroy();
        vlnModules.dataLoader.destroy();
        vlnModules.flyControls.destroy();
        vlnModules = null;
    }
}

/**
 * 获取 VLN 模块
 */
function getVLNModules(): VLNModules | null {
    return vlnModules;
}

export { registerVLNEvents, destroyVLNModules, getVLNModules, VLNModules };
