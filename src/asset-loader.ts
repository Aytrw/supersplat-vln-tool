import { AppBase, Asset, GSplatData, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { AssetSource } from './loaders/asset-source';
import { loadGsplat } from './loaders/gsplat';
import { loadLcc } from './loaders/lcc';
import { loadSplat } from './loaders/splat';
import { Splat } from './splat';
import { downsampleGSplat, DownsampleOptions, suggestDownsampleRatio, formatSplatCount } from './splat-downsample';

const defaultOrientation = new Vec3(90, 0, 180);  // 与 LCC 相同，适用于 Y-up 坐标系
const lccOrientation = new Vec3(90, 0, 180);

/**
 * 加载选项
 */
interface LoadOptions {
    /** 降采样选项 */
    downsample?: DownsampleOptions;
    /** 是否自动降采样大型点云 */
    autoDownsample?: boolean;
    /** 自动降采样的阈值（超过此数量才降采样） */
    autoDownsampleThreshold?: number;
}

// handles loading gltf container assets
class AssetLoader {
    app: AppBase;
    events: Events;
    defaultAnisotropy: number;
    loadAllData = true;

    // 全局降采样设置
    autoDownsample = false;
    downsampleMethod: 'random' | 'importance' = 'importance';

    constructor(app: AppBase, events: Events, defaultAnisotropy?: number) {
        this.app = app;
        this.events = events;
        this.defaultAnisotropy = defaultAnisotropy || 1;

        // 注册降采样配置事件
        this.events.function('downsample.auto', () => this.autoDownsample);
        this.events.function('downsample.method', () => this.downsampleMethod);

        this.events.on('downsample.setAuto', (auto: boolean) => {
            this.autoDownsample = auto;
        });
        this.events.on('downsample.setMethod', (method: 'random' | 'importance') => {
            this.downsampleMethod = method;
        });
    }

    /**
     * 应用降采样（导入时自动降采样）
     */
    private applyDownsample(gsplatData: GSplatData, options?: LoadOptions): GSplatData {
        const numSplats = gsplatData.numSplats;

        // 优先使用传入的选项
        if (options?.downsample) {
            return downsampleGSplat(gsplatData, options.downsample);
        }

        // 检查自动降采样
        if (options?.autoDownsample || this.autoDownsample) {
            const suggestedRatio = suggestDownsampleRatio(numSplats);
            if (suggestedRatio < 1.0) {
                console.log(`Auto-downsample: ${formatSplatCount(numSplats)} splats, suggested ratio: ${suggestedRatio}, method: ${this.downsampleMethod}`);
                return downsampleGSplat(gsplatData, {
                    ratio: suggestedRatio,
                    method: this.downsampleMethod
                });
            }
        }

        return gsplatData;
    }

    async load(assetSource: AssetSource, options?: LoadOptions) {
        const wrap = (gsplatData: GSplatData) => {
            // 应用降采样
            const processedData = this.applyDownsample(gsplatData, options);

            const asset = new Asset(assetSource.filename || assetSource.url, 'gsplat', {
                url: assetSource.contents ? `local-asset-${Date.now()}` : assetSource.url ?? assetSource.filename,
                filename: assetSource.filename
            });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, processedData);
            return asset;
        };

        if (!assetSource.animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const filename = (assetSource.filename || assetSource.url).toLowerCase();

            let asset;
            let orientation = defaultOrientation;

            if (filename.endsWith('.splat')) {
                asset = wrap(await loadSplat(assetSource));
            } else if (filename.endsWith('.lcc')) {
                asset = wrap(await loadLcc(assetSource));
                orientation = lccOrientation;
            } else {
                // 对于 PLY 等通过引擎加载的格式，需要在加载后处理
                asset = await loadGsplat(this.app.assets, assetSource);
                
                // 检查是否需要自动降采样
                const resource = asset.resource as GSplatResource;
                const originalData = resource.gsplatData as GSplatData;
                const numSplats = originalData.numSplats;

                let downsampleOptions: DownsampleOptions | undefined;

                // 检查降采样条件
                if (options?.downsample) {
                    downsampleOptions = options.downsample;
                } else if (options?.autoDownsample || this.autoDownsample) {
                    const suggestedRatio = suggestDownsampleRatio(numSplats);
                    if (suggestedRatio < 1.0) {
                        downsampleOptions = {
                            ratio: suggestedRatio,
                            method: this.downsampleMethod
                        };
                        console.log(`Auto-downsample PLY: ${formatSplatCount(numSplats)} splats, ratio: ${suggestedRatio}, method: ${this.downsampleMethod}`);
                    }
                }

                // 如果需要降采样，创建新的资源
                if (downsampleOptions) {
                    const downsampledData = downsampleGSplat(originalData, downsampleOptions);
                    
                    // 创建新的 asset 使用降采样后的数据
                    const newAsset = new Asset(assetSource.filename || assetSource.url, 'gsplat', {
                        url: `local-downsample-${Date.now()}`,
                        filename: assetSource.filename
                    });
                    this.app.assets.add(newAsset);
                    newAsset.resource = new GSplatResource(this.app.graphicsDevice, downsampledData);
                    
                    // 移除原始资源
                    this.app.assets.remove(asset);
                    asset = newAsset;
                }
            }

            return new Splat(asset, orientation);
        } finally {
            if (!assetSource.animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader, LoadOptions };
