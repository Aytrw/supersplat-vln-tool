/**
 * VLN 管理器
 * 
 * VLN 功能的核心管理器，负责协调各子模块的工作
 */

import { Events } from '../events';
import { Scene } from '../scene';
import {
    VLNTask,
    VLNTaskImport,
    CameraPose,
    RecordingSession,
    RecordingConfig,
    RecordedFrame,
    PathData,
    PathExportFormat,
    VLNPathExport,
    VLNEventNames,
    poseFromSimple,
    poseToTransformMatrix,
    createDefaultPose,
    createDefaultRecordingConfig
} from './types';

/**
 * VLN 管理器类
 */
class VLNManager {
    private events: Events;
    private scene: Scene;
    
    // 当前任务
    private currentTask: VLNTask | null = null;
    
    // 当前录制会话
    private currentSession: RecordingSession | null = null;
    
    // 录制配置
    private recordingConfig: RecordingConfig;
    
    // 是否已初始化
    private initialized = false;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.recordingConfig = createDefaultRecordingConfig();
    }

    /**
     * 初始化 VLN 管理器
     */
    initialize(): void {
        if (this.initialized) {
            return;
        }

        this.registerEvents();
        this.initialized = true;
        
        console.log('VLN: Manager initialized');
    }

    /**
     * 销毁 VLN 管理器
     */
    destroy(): void {
        if (!this.initialized) {
            return;
        }

        this.clearTask();
        this.initialized = false;
        
        console.log('VLN: Manager destroyed');
    }

    /**
     * 注册事件处理器
     */
    private registerEvents(): void {
        // 任务加载
        this.events.on(VLNEventNames.TASK_LOAD, (taskData: VLNTaskImport) => {
            this.loadTask(taskData);
        });

        // 任务清空
        this.events.on(VLNEventNames.TASK_CLEAR, () => {
            this.clearTask();
        });

        // 录制开始
        this.events.on(VLNEventNames.RECORDING_START, () => {
            this.startRecording();
        });

        // 录制暂停
        this.events.on(VLNEventNames.RECORDING_PAUSE, () => {
            this.pauseRecording();
        });

        // 录制恢复
        this.events.on(VLNEventNames.RECORDING_RESUME, () => {
            this.resumeRecording();
        });

        // 录制停止
        this.events.on(VLNEventNames.RECORDING_STOP, () => {
            this.stopRecording();
        });

        // 跳转到起点
        this.events.on(VLNEventNames.CAMERA_GOTO_START, () => {
            this.gotoStartPose();
        });

        // 跳转到终点
        this.events.on(VLNEventNames.CAMERA_GOTO_END, () => {
            this.gotoEndPose();
        });

        // 设置相机位姿
        this.events.on(VLNEventNames.CAMERA_SET_POSE, (pose: CameraPose) => {
            this.setCameraPose(pose);
        });

        // 导出路径
        this.events.on(VLNEventNames.PATH_EXPORT, (format: PathExportFormat) => {
            this.exportPath(format);
        });

        // 录制帧率设置（来自 UI）
        this.events.on('vln.recorder.setFrameRate', (frameRate: number) => {
            this.setRecordingFrameRate(frameRate);
        });

        // 注册函数
        this.events.function('vln.currentTask', () => this.currentTask);
        this.events.function('vln.currentSession', () => this.currentSession);
        this.events.function('vln.isRecording', () => this.isRecording());
        this.events.function('vln.recordingConfig', () => this.recordingConfig);
    }

    private sanitizeFrameRate(frameRate: number): number | null {
        if (!Number.isFinite(frameRate)) {
            return null;
        }

        const next = Math.round(frameRate);
        if (next < 1) {
            return null;
        }

        return Math.min(next, 240);
    }

    private setRecordingFrameRate(frameRate: number): void {
        const next = this.sanitizeFrameRate(frameRate);
        if (next === null) {
            console.warn('VLN: setRecordingFrameRate - invalid value', frameRate);
            return;
        }

        if (this.recordingConfig.frameRate === next) {
            return;
        }

        this.recordingConfig.frameRate = next;

        // 如果已有会话（极端情况下 UI 仍触发），保持导出元数据一致
        if (this.currentSession && this.currentSession.status !== 'stopped') {
            this.currentSession.frameRate = next;
        }
    }

    // ========================================================================
    // 任务管理
    // ========================================================================

    /**
     * 加载 VLN 任务
     */
    loadTask(taskData: VLNTaskImport): void {
        // TODO: 实现任务加载逻辑
        console.log('VLN: loadTask - not fully implemented', taskData);

        // 转换任务数据格式
        const task: VLNTask = {
            id: taskData.id,
            sceneId: taskData.scene_id,
            startPose: poseFromSimple(taskData.start_pose),
            endPose: taskData.end_pose ? poseFromSimple(taskData.end_pose) : undefined,
            instructions: taskData.instructions,
            metadata: taskData.metadata
        };

        this.currentTask = task;

        // 触发任务加载完成事件
        this.events.fire(VLNEventNames.TASK_LOADED, task);

        // 跳转到起始位姿
        this.gotoStartPose();
    }

    /**
     * 获取当前任务
     */
    getCurrentTask(): VLNTask | null {
        return this.currentTask;
    }

    /**
     * 清空当前任务
     */
    clearTask(): void {
        // TODO: 实现任务清空逻辑
        console.log('VLN: clearTask - not fully implemented');

        if (this.isRecording()) {
            this.stopRecording();
        }

        this.currentTask = null;
        this.events.fire(VLNEventNames.TASK_CLEARED);
    }

    // ========================================================================
    // 录制管理
    // ========================================================================

    /**
     * 开始录制
     */
    startRecording(): void {
        if (this.isRecording()) {
            console.warn('VLN: Already recording');
            return;
        }

        console.log('VLN: startRecording');

        this.currentSession = {
            id: `rec_${Date.now()}`,
            taskId: this.currentTask?.id,
            startTime: Date.now(),
            frames: [],
            status: 'recording',
            frameRate: this.recordingConfig.frameRate
        };

        this.events.fire(VLNEventNames.RECORDING_STARTED, this.currentSession);
    }

    /**
     * 暂停录制
     */
    pauseRecording(): void {
        if (!this.currentSession || this.currentSession.status !== 'recording') {
            return;
        }

        console.log('VLN: pauseRecording');

        this.currentSession.status = 'paused';
        this.events.fire(VLNEventNames.RECORDING_PAUSED, this.currentSession);
    }

    /**
     * 恢复录制
     */
    resumeRecording(): void {
        if (!this.currentSession || this.currentSession.status !== 'paused') {
            return;
        }

        console.log('VLN: resumeRecording');

        this.currentSession.status = 'recording';
        this.events.fire(VLNEventNames.RECORDING_RESUMED, this.currentSession);
    }

    /**
     * 停止录制并导出
     */
    stopRecording(): RecordingSession | null {
        if (!this.currentSession) {
            return null;
        }

        console.log('VLN: stopRecording');

        this.currentSession.status = 'stopped';
        this.currentSession.endTime = Date.now();

        // 从 PathRecorder 获取录制的帧数据
        const frames = this.events.invoke('vln.recorder.frames') as RecordedFrame[] || [];
        this.currentSession.frames = frames;

        const session = this.currentSession;
        this.events.fire(VLNEventNames.RECORDING_STOPPED, session);

        // 自动保存
        if (frames.length > 0) {
            this.autoSaveRecording();
        } else {
            console.warn('VLN: No frames recorded, skipping save');
        }

        return session;
    }

    /**
     * 自动保存录制（停止时调用）
     */
    private async autoSaveRecording(): Promise<void> {
        if (!this.currentSession || this.currentSession.frames.length === 0) {
            return;
        }

        const frames = this.currentSession.frames;

        // 构建导出数据
        const exportData: VLNPathExport = {
            label: this.generateLabel(),
            path_points: frames.map(f => [
                f.pose.position.x,
                f.pose.position.y,
                f.pose.position.z
            ] as [number, number, number]),
            trajectory: frames.map(f => poseToTransformMatrix(f.pose)),
            videos: [],
            instructions: {
                full_instruction: this.currentTask?.instructions?.join(' ') || '',
                splited_instruction: this.currentTask?.instructions || []
            },
            human_trajectory: [],
            trajectory_score: {},
            metadata: {
                recorded_at: new Date().toISOString(),
                frame_rate: this.currentSession.frameRate,
                total_frames: frames.length,
                duration: this.currentSession.endTime 
                    ? (this.currentSession.endTime - this.currentSession.startTime) / 1000 
                    : 0,
                scene_id: this.currentTask?.sceneId,
                task_id: this.currentTask?.id,
                fov: frames[0]?.pose.fov
            }
        };

        const jsonString = JSON.stringify(exportData, null, 2);

        // 使用 FileSaver 保存
        const fileSaver = this.events.invoke('vln.modules')?.fileSaver;
        
        if (fileSaver) {
            const result = await fileSaver.saveFile(jsonString);
            
            if (result.success && result.path) {
                // 显示成功提示
                this.showSaveSuccessNotification(result.path, frames.length);
            } else {
                console.error('VLN: Failed to save recording');
            }
        } else {
            console.error('VLN: FileSaver not available');
        }
    }

    /**
     * 显示保存成功通知
     */
    private showSaveSuccessNotification(path: string, frameCount: number): void {
        console.log(`VLN: Recording saved to ${path} (${frameCount} frames)`);
        
        // 尝试使用宿主的通知系统
        try {
            this.events.invoke('showPopup', {
                type: 'info',
                header: '录制已保存',
                message: `路径已保存到：\n${path}\n\n共 ${frameCount} 帧`
            });
        } catch {
            // 回退到浏览器原生通知
            alert(`✅ 录制已保存\n\n路径：${path}\n帧数：${frameCount}`);
        }
    }

    /**
     * 是否正在录制
     */
    isRecording(): boolean {
        return this.currentSession?.status === 'recording';
    }

    /**
     * 获取当前录制会话
     */
    getCurrentSession(): RecordingSession | null {
        return this.currentSession;
    }

    /**
     * 设置录制配置
     */
    setRecordingConfig(config: Partial<RecordingConfig>): void {
        this.recordingConfig = {
            ...this.recordingConfig,
            ...config
        };
    }

    // ========================================================================
    // 相机控制
    // ========================================================================

    /**
     * 设置相机位姿
     */
    setCameraPose(pose: CameraPose): void {
        // 统一的“位姿已设置”广播：具体落地由 CameraController 响应 CAMERA_SET_POSE 完成。
        this.events.fire(VLNEventNames.CAMERA_POSE_SET, pose);
    }

    /**
     * 跳转到起始位姿
     */
    gotoStartPose(): void {
        if (this.currentTask?.startPose) {
            // 触发统一入口事件：CameraController 会执行实际相机跳转。
            this.events.fire(VLNEventNames.CAMERA_SET_POSE, this.currentTask.startPose);
        }
    }

    /**
     * 跳转到结束位姿
     */
    gotoEndPose(): void {
        if (this.currentTask?.endPose) {
            this.events.fire(VLNEventNames.CAMERA_SET_POSE, this.currentTask.endPose);
        }
    }

    // ========================================================================
    // 数据导出
    // ========================================================================

    /**
     * 导出路径数据
     */
    exportPath(format: PathExportFormat = 'json'): void {
        console.log('VLN: exportPath', format);

        if (!this.currentSession || this.currentSession.frames.length === 0) {
            console.warn('VLN: No recording data to export');
            return;
        }

        // 根据格式导出
        switch (format) {
            case 'json':
                this.exportAsJSON();
                break;
            case 'csv':
                this.exportAsCSV();
                break;
            case 'txt':
                this.exportAsTXT();
                break;
        }
    }

    /**
     * 生成导出标签
     */
    private generateLabel(): string {
        const now = new Date();
        const date = now.toISOString().split('T')[0].replace(/-/g, '');
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
        const sceneId = this.currentTask?.sceneId || 'unknown';
        const taskId = this.currentTask?.id || 'notask';
        const id = this.currentSession?.id || `rec_${Date.now()}`;
        
        return `path_${sceneId}_${date}_${time}_annotator_${id}`;
    }

    /**
     * 导出为用户指定的 JSON 格式
     */
    private exportAsJSON(): void {
        if (!this.currentSession) {
            console.warn('VLN: No session to export');
            return;
        }

        const frames = this.currentSession.frames;
        if (frames.length === 0) {
            console.warn('VLN: No frames to export');
            return;
        }

        // 构建用户指定格式的导出数据
        const exportData: VLNPathExport = {
            label: this.generateLabel(),
            
            // 路径点坐标
            path_points: frames.map(f => [
                f.pose.position.x,
                f.pose.position.y,
                f.pose.position.z
            ] as [number, number, number]),
            
            // 轨迹变换矩阵（c2w 格式）
            trajectory: frames.map(f => poseToTransformMatrix(f.pose)),
            
            // 视频路径（录制时为空）
            videos: [],
            
            // 导航指令
            instructions: {
                full_instruction: this.currentTask?.instructions?.join(' ') || '',
                splited_instruction: this.currentTask?.instructions || []
            },
            
            // 人类轨迹（评测用，录制时为空）
            human_trajectory: [],
            
            // 轨迹评分（评测用，录制时为空对象）
            trajectory_score: {},
            
            // 元数据
            metadata: {
                recorded_at: new Date().toISOString(),
                frame_rate: this.currentSession.frameRate,
                total_frames: frames.length,
                duration: this.currentSession.endTime 
                    ? (this.currentSession.endTime - this.currentSession.startTime) / 1000 
                    : 0,
                scene_id: this.currentTask?.sceneId,
                task_id: this.currentTask?.id,
                fov: frames[0]?.pose.fov
            }
        };

        // 转换为 JSON 字符串
        const jsonString = JSON.stringify(exportData, null, 2);

        // 使用 FileSaver 保存（会自动处理文件名和目录）
        this.saveToFile(jsonString, `${exportData.label}.json`);

        console.log('VLN: Exported path data:', {
            label: exportData.label,
            frames: frames.length,
            duration: exportData.metadata.duration
        });
    }

    /**
     * 导出为 CSV 格式
     */
    private exportAsCSV(): void {
        if (!this.currentSession || this.currentSession.frames.length === 0) {
            console.warn('VLN: No data to export as CSV');
            return;
        }

        const frames = this.currentSession.frames;
        const headers = [
            'frame', 'timestamp', 
            'pos_x', 'pos_y', 'pos_z', 
            'rot_x', 'rot_y', 'rot_z', 'rot_w', 
            'fov', 'instruction_index'
        ];

        const rows = frames.map(f => [
            f.index,
            f.timestamp,
            f.pose.position.x,
            f.pose.position.y,
            f.pose.position.z,
            f.pose.rotation.x,
            f.pose.rotation.y,
            f.pose.rotation.z,
            f.pose.rotation.w,
            f.pose.fov || '',
            f.instructionIndex ?? ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const label = this.generateLabel();
        
        this.saveToFile(csv, `${label}.csv`, 'text/csv');

        console.log('VLN: Exported CSV:', frames.length, 'frames');
    }

    /**
     * 导出为 TXT 格式（简单的位置列表）
     */
    private exportAsTXT(): void {
        if (!this.currentSession || this.currentSession.frames.length === 0) {
            console.warn('VLN: No data to export as TXT');
            return;
        }

        const frames = this.currentSession.frames;
        const lines = frames.map(f => 
            `${f.index}\t${f.pose.position.x.toFixed(6)}\t${f.pose.position.y.toFixed(6)}\t${f.pose.position.z.toFixed(6)}`
        );

        const txt = `# VLN Path Recording\n# frame\tx\ty\tz\n${lines.join('\n')}`;
        const label = this.generateLabel();
        
        this.saveToFile(txt, `${label}.txt`, 'text/plain');

        console.log('VLN: Exported TXT:', frames.length, 'frames');
    }

    /**
     * 使用 FileSaver 保存文件
     */
    private async saveToFile(content: string, filename: string, mimeType: string = 'application/json'): Promise<void> {
        // 尝试通过事件调用 FileSaver
        const fileSaver = this.events.invoke('vln.modules')?.fileSaver;
        
        if (fileSaver) {
            const result = await fileSaver.saveFile(content, filename, mimeType);
            if (result.success) {
                console.log('VLN: File saved via FileSaver:', result.path);
                
                // 显示保存成功提示
                if (result.path) {
                    try {
                        this.events.invoke('showPopup', {
                            type: 'info',
                            header: '导出成功',
                            message: `文件已保存到：\n${result.path}`
                        });
                    } catch {
                        alert(`✅ 文件已保存到：\n${result.path}`);
                    }
                }
                return;
            }
        }

        // 如果 FileSaver 不可用或保存失败，不执行任何操作（已在 FileSaver 中处理回退）
        console.warn('VLN: File not saved, FileSaver unavailable or failed');
    }

    /**
     * 下载文件（回退方案）
     */
    private downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export { VLNManager };
