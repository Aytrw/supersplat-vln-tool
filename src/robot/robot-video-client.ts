/**
 * GO2 机器人视频客户端 v2 - 低延迟版本
 * 
 * 优化：
 * 1. 使用二进制 WebSocket 接收 JPEG 数据
 * 2. 直接使用 Blob URL 显示图片，避免 base64 开销
 * 3. 跳帧渲染，避免堆积
 */

import { Events } from '../events';

/**
 * 视频帧数据
 */
export interface VideoFrame {
    frameId: number;
    timestamp: number;
    fps: number;
    size: number;
}

/**
 * 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * 事件名称
 */
export const RobotVideoEvents = {
    STATUS_CHANGED: 'robot.video.status',
    FRAME_RECEIVED: 'robot.video.frame',
    STATS_UPDATED: 'robot.video.stats',
    ERROR: 'robot.video.error'
} as const;

/**
 * 配置
 */
export interface RobotVideoConfig {
    serverUrl: string;
    autoReconnect: boolean;
    reconnectInterval: number;
    maxReconnectAttempts: number;
}

const defaultConfig: RobotVideoConfig = {
    serverUrl: 'ws://localhost:9000',
    autoReconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10
};

/**
 * GO2 机器人视频客户端 - 低延迟版本
 */
class RobotVideoClient {
    private events: Events;
    private config: RobotVideoConfig;
    
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private reconnectAttempts = 0;
    private reconnectTimer: number | null = null;
    
    // 统计
    private stats = {
        fps: 0,
        latency: 0,
        frameCount: 0,
        bytesReceived: 0
    };
    
    // Canvas 渲染
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    
    // 渲染状态
    private pendingFrame: Blob | null = null;
    private rendering = false;
    private lastBlobUrl: string | null = null;
    
    constructor(events: Events, config: Partial<RobotVideoConfig> = {}) {
        this.events = events;
        this.config = { ...defaultConfig, ...config };
        this.registerEvents();
    }
    
    private registerEvents(): void {
        this.events.function('robot.video.status', () => this.status);
        this.events.function('robot.video.stats', () => this.stats);
        this.events.function('robot.video.canvas', () => this.canvas);
        
        this.events.on('robot.video.connect', (url?: string) => {
            if (url) this.config.serverUrl = url;
            this.connect();
        });
        
        this.events.on('robot.video.disconnect', () => {
            this.disconnect();
        });
    }
    
    connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }
        
        this.setStatus('connecting');
        console.log(`[RobotVideo] Connecting to ${this.config.serverUrl}`);
        
        try {
            this.ws = new WebSocket(this.config.serverUrl);
            this.ws.binaryType = 'arraybuffer';  // 接收二进制数据
            this.ws.onopen = this.onOpen.bind(this);
            this.ws.onmessage = this.onMessage.bind(this);
            this.ws.onclose = this.onClose.bind(this);
            this.ws.onerror = this.onError.bind(this);
        } catch (err) {
            console.error('[RobotVideo] Failed to create WebSocket:', err);
            this.setStatus('error');
            this.scheduleReconnect();
        }
    }
    
    disconnect(): void {
        this.cancelReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.lastBlobUrl) {
            URL.revokeObjectURL(this.lastBlobUrl);
            this.lastBlobUrl = null;
        }
        this.setStatus('disconnected');
    }
    
    getCanvas(): HTMLCanvasElement {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = 1280;
            this.canvas.height = 720;
            this.ctx = this.canvas.getContext('2d', {
                alpha: false,
                desynchronized: true  // 低延迟渲染
            });
        }
        return this.canvas;
    }
    
    private onOpen(): void {
        console.log('[RobotVideo] Connected');
        this.setStatus('connected');
        this.reconnectAttempts = 0;
    }
    
    private onMessage(event: MessageEvent): void {
        if (event.data instanceof ArrayBuffer) {
            this.handleBinaryFrame(event.data);
        } else {
            // JSON 消息（状态等）
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'status') {
                    console.log('[RobotVideo] Status:', data);
                }
            } catch (e) {
                // 忽略
            }
        }
    }
    
    private handleBinaryFrame(buffer: ArrayBuffer): void {
        // 解析头部: [frame_id: 4bytes][timestamp: 8bytes][fps: 4bytes][jpeg_data]
        const view = new DataView(buffer);
        const frameId = view.getUint32(0, true);
        const timestamp = view.getFloat64(4, true);
        const fps = view.getFloat32(12, true);
        const jpegData = buffer.slice(16);
        
        // 更新统计
        this.stats.fps = fps;
        this.stats.frameCount++;
        this.stats.bytesReceived += buffer.byteLength;
        this.stats.latency = (Date.now() / 1000 - timestamp) * 1000;  // ms
        
        // 创建 Blob 并渲染
        const blob = new Blob([jpegData], { type: 'image/jpeg' });
        
        // 跳帧策略：如果正在渲染，替换待渲染帧
        this.pendingFrame = blob;
        
        if (!this.rendering) {
            this.renderNextFrame();
        }
        
        // 触发事件
        this.events.fire(RobotVideoEvents.FRAME_RECEIVED, {
            frameId,
            timestamp,
            fps,
            size: jpegData.byteLength
        } as VideoFrame);
        
        // 定期更新统计
        if (this.stats.frameCount % 30 === 0) {
            this.events.fire(RobotVideoEvents.STATS_UPDATED, { ...this.stats });
        }
    }
    
    private async renderNextFrame(): Promise<void> {
        if (!this.pendingFrame || !this.ctx || !this.canvas) {
            this.rendering = false;
            return;
        }
        
        this.rendering = true;
        const blob = this.pendingFrame;
        this.pendingFrame = null;
        
        try {
            // 使用 createImageBitmap 解码（GPU 加速）
            const imageBitmap = await createImageBitmap(blob);
            
            // 调整 canvas 大小
            if (this.canvas.width !== imageBitmap.width || this.canvas.height !== imageBitmap.height) {
                this.canvas.width = imageBitmap.width;
                this.canvas.height = imageBitmap.height;
            }
            
            // 绘制
            this.ctx.drawImage(imageBitmap, 0, 0);
            imageBitmap.close();
            
        } catch (err) {
            console.error('[RobotVideo] Render error:', err);
        }
        
        // 检查是否有新帧等待渲染
        if (this.pendingFrame) {
            // 使用 requestAnimationFrame 避免阻塞
            requestAnimationFrame(() => this.renderNextFrame());
        } else {
            this.rendering = false;
        }
    }
    
    private onClose(event: CloseEvent): void {
        console.log(`[RobotVideo] Connection closed: ${event.code}`);
        this.ws = null;
        
        if (this.status !== 'disconnected') {
            this.setStatus('disconnected');
            this.scheduleReconnect();
        }
    }
    
    private onError(event: Event): void {
        console.error('[RobotVideo] WebSocket error');
        this.events.fire(RobotVideoEvents.ERROR, { message: 'WebSocket error' });
    }
    
    private setStatus(status: ConnectionStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.events.fire(RobotVideoEvents.STATUS_CHANGED, status);
        }
    }
    
    private scheduleReconnect(): void {
        if (!this.config.autoReconnect) return;
        
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.setStatus('error');
            return;
        }
        
        this.reconnectAttempts++;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.config.reconnectInterval);
    }
    
    private cancelReconnect(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
    }
    
    destroy(): void {
        this.disconnect();
        this.canvas = null;
        this.ctx = null;
    }
}

export { RobotVideoClient };
