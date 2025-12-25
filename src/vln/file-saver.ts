/**
 * VLN 文件保存器
 * 
 * 使用 File System Access API 管理本地文件保存
 */

import { Events } from '../events';

/**
 * 文件保存配置
 */
interface FileSaverConfig {
    /** 保存目录名 */
    dirName: string;
    /** 文件名前缀 */
    filePrefix: string;
    /** 是否自动递增编号 */
    autoIncrement: boolean;
}

/**
 * 文件保存器类
 */
class FileSaver {
    private events: Events;
    private config: FileSaverConfig;
    
    // 当前选择的目录句柄
    private rootDirHandle: FileSystemDirectoryHandle | null = null;
    private recordingsDirHandle: FileSystemDirectoryHandle | null = null;
    
    // 当前计数器（用于自动编号）
    private counter: number = 1;
    
    // 是否支持 File System Access API
    private readonly isSupported: boolean;

    constructor(events: Events, config?: Partial<FileSaverConfig>) {
        this.events = events;
        this.config = {
            dirName: 'vln-recordings',
            filePrefix: 'recording',
            autoIncrement: true,
            ...config
        };

        // 检查浏览器支持
        this.isSupported = 'showDirectoryPicker' in window;
        
        if (!this.isSupported) {
            console.warn('VLN: File System Access API not supported, falling back to download');
        }

        // 尝试从 localStorage 恢复上次的目录
        this.loadPersistedHandle();
    }

    /**
     * 初始化文件保存器
     */
    initialize(): void {
        console.log('VLN: FileSaver initialized', { supported: this.isSupported });
    }

    /**
     * 销毁文件保存器
     */
    destroy(): void {
        this.rootDirHandle = null;
        this.recordingsDirHandle = null;
    }

    /**
     * 确保目录已配置（首次使用时自动提示）
     */
    async ensureDirectoryConfigured(): Promise<boolean> {
        // 如果已经配置，直接返回
        if (this.recordingsDirHandle) {
            return true;
        }

        // 如果不支持 API，返回 false（将使用下载回退）
        if (!this.isSupported) {
            return false;
        }

        // 首次使用，提示用户选择目录
        console.log('VLN: First time recording, prompting for directory selection');
        
        try {
            // 提示用户
            const proceed = await this.showFirstTimePrompt();
            if (!proceed) {
                return false;
            }

            return await this.selectRootDirectory();
        } catch (error) {
            console.error('VLN: Failed to configure directory', error);
            return false;
        }
    }

    /**
     * 首次使用提示
     */
    private async showFirstTimePrompt(): Promise<boolean> {
        return new Promise((resolve) => {
            // 尝试使用宿主的弹窗，如果没有就用浏览器原生确认
            const message = '首次录制需要选择一个文件夹来保存录制文件。\n\n系统会在该文件夹下自动创建 "vln-recordings" 子目录。\n\n是否现在选择？';
            
            // 尝试事件方式
            this.events.invoke('showPopup', {
                type: 'confirm',
                header: '选择保存目录',
                message: message
            }).then(() => {
                resolve(true);
            }).catch(() => {
                // 回退到原生确认
                const confirmed = confirm(message);
                resolve(confirmed);
            });
        });
    }

    /**
     * 选择保存根目录
     */
    async selectRootDirectory(): Promise<boolean> {
        if (!this.isSupported) {
            console.error('VLN: File System Access API not supported');
            return false;
        }

        try {
            // 请求用户选择目录
            const dirHandle = await (window as any).showDirectoryPicker({
                mode: 'readwrite'
            });

            this.rootDirHandle = dirHandle;

            // 创建或获取 recordings 子目录
            this.recordingsDirHandle = await dirHandle.getDirectoryHandle(
                this.config.dirName,
                { create: true }
            );

            // 扫描现有文件以确定下一个编号
            await this.updateCounter();

            // 持久化目录句柄（用于下次自动恢复）
            await this.persistHandle(dirHandle);

            console.log('VLN: Directory selected and recordings folder created');
            
            this.events.fire('vln.fileSaver.directorySelected', {
                rootPath: dirHandle.name,
                recordingsPath: this.config.dirName
            });

            return true;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('VLN: User cancelled directory selection');
            } else {
                console.error('VLN: Failed to select directory', error);
            }
            return false;
        }
    }

    /**
     * 保存文件
     */
    async saveFile(content: string, filename?: string, mimeType: string = 'application/json'): Promise<{
        success: boolean;
        path?: string;
        filename?: string;
        error?: string;
    }> {
        // 确保目录已配置
        const configured = await this.ensureDirectoryConfigured();
        
        // 如果不支持 API 或用户取消，回退到下载
        if (!configured || !this.recordingsDirHandle) {
            const fallbackResult = this.fallbackDownload(content, filename || this.generateFilename(), mimeType);
            return {
                success: fallbackResult,
                error: fallbackResult ? undefined : 'Failed to download file'
            };
        }

        try {
            const actualFilename = filename || this.generateFilename();
            
            // 创建文件
            const fileHandle = await this.recordingsDirHandle.getFileHandle(actualFilename, { create: true });
            
            // 写入内容
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            console.log('VLN: File saved successfully:', actualFilename);

            // 更新计数器
            if (this.config.autoIncrement && !filename) {
                this.counter++;
            }

            const fullPath = `${this.rootDirHandle?.name}/${this.config.dirName}/${actualFilename}`;

            this.events.fire('vln.fileSaver.fileSaved', {
                filename: actualFilename,
                path: fullPath,
                size: content.length
            });

            return {
                success: true,
                path: fullPath,
                filename: actualFilename
            };
        } catch (error) {
            console.error('VLN: Failed to save file', error);
            
            // 如果保存失败，回退到下载
            const fallbackResult = this.fallbackDownload(content, filename || this.generateFilename(), mimeType);
            return {
                success: fallbackResult,
                error: fallbackResult ? undefined : 'Failed to save or download file'
            };
        }
    }

    /**
     * 生成文件名（带自动编号）
     */
    private generateFilename(): string {
        const ext = 'json';
        const paddedNumber = String(this.counter).padStart(3, '0');
        return `${this.config.filePrefix}_${paddedNumber}.${ext}`;
    }

    /**
     * 扫描已有文件并更新计数器
     */
    private async updateCounter(): Promise<void> {
        if (!this.recordingsDirHandle) return;

        try {
            let maxNumber = 0;
            
            // 遍历目录中的文件
            for await (const entry of (this.recordingsDirHandle as any).values()) {
                if (entry.kind === 'file') {
                    // 提取文件名中的编号
                    const match = entry.name.match(new RegExp(`${this.config.filePrefix}_(\\d+)\\.json`));
                    if (match) {
                        const number = parseInt(match[1], 10);
                        if (number > maxNumber) {
                            maxNumber = number;
                        }
                    }
                }
            }

            // 设置为最大编号 + 1
            this.counter = maxNumber + 1;
            console.log('VLN: Counter updated to', this.counter);
        } catch (error) {
            console.error('VLN: Failed to update counter', error);
        }
    }

    /**
     * 回退到浏览器下载
     */
    private fallbackDownload(content: string, filename: string, mimeType: string): boolean {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('VLN: File downloaded (fallback):', filename);
            return true;
        } catch (error) {
            console.error('VLN: Failed to download file', error);
            return false;
        }
    }

    /**
     * 持久化目录句柄（使用 IndexedDB）
     */
    private async persistHandle(dirHandle: FileSystemDirectoryHandle): Promise<void> {
        try {
            // 使用 IndexedDB 存储句柄
            const db = await this.openDB();
            const tx = db.transaction('handles', 'readwrite');
            const store = tx.objectStore('handles');
            await this.promisifyRequest(store.put(dirHandle, 'rootDirectory'));
            
            console.log('VLN: Directory handle persisted');
        } catch (error) {
            console.warn('VLN: Failed to persist directory handle', error);
        }
    }

    /**
     * 加载持久化的目录句柄
     */
    private async loadPersistedHandle(): Promise<void> {
        if (!this.isSupported) {
            return;
        }

        try {
            const db = await this.openDB();
            const tx = db.transaction('handles', 'readonly');
            const store = tx.objectStore('handles');
            const dirHandle = await this.promisifyRequest(store.get('rootDirectory')) as FileSystemDirectoryHandle | undefined;
            
            if (dirHandle) {
                // 验证权限
                const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
                
                if (permission === 'granted') {
                    // 权限已授予，直接使用
                    this.rootDirHandle = dirHandle;
                    this.recordingsDirHandle = await dirHandle.getDirectoryHandle(
                        this.config.dirName,
                        { create: true }
                    );
                    await this.updateCounter();
                    
                    console.log('VLN: Restored directory from previous session:', dirHandle.name);
                } else if (permission === 'prompt') {
                    // 需要重新请求权限
                    const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' });
                    
                    if (newPermission === 'granted') {
                        this.rootDirHandle = dirHandle;
                        this.recordingsDirHandle = await dirHandle.getDirectoryHandle(
                            this.config.dirName,
                            { create: true }
                        );
                        await this.updateCounter();
                        
                        console.log('VLN: Re-authorized and restored directory:', dirHandle.name);
                    }
                }
            }
        } catch (error) {
            console.warn('VLN: Failed to load persisted handle', error);
        }
    }

    /**
     * 打开 IndexedDB
     */
    private openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('VLNFileSaver', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };
        });
    }

    /**
     * 将 IDBRequest 转换为 Promise
     */
    private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取当前状态
     */
    getStatus(): {
        isConfigured: boolean;
        isSupported: boolean;
        rootDir: string | null;
        recordingsDir: string;
        nextFilename: string;
    } {
        return {
            isConfigured: !!this.recordingsDirHandle,
            isSupported: this.isSupported,
            rootDir: this.rootDirHandle?.name || null,
            recordingsDir: this.config.dirName,
            nextFilename: this.generateFilename()
        };
    }

    /**
     * 重置计数器
     */
    resetCounter(): void {
        this.counter = 1;
        console.log('VLN: Counter reset');
    }
}

export { FileSaver, FileSaverConfig };
