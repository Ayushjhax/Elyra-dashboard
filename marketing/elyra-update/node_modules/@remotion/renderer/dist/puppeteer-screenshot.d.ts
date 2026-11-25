import type { Page } from './browser/BrowserPage';
import type { StillImageFormat } from './image-format';
import type { CapturedFrame, RemotionSharedMemoryCapture } from './remotion-shared-memory';
export declare const screenshot: (options: {
    page: Page;
    type: StillImageFormat;
    path?: string;
    jpegQuality?: number;
    omitBackground: boolean;
    width: number;
    height: number;
    scale: number;
    remotionSharedMemory: RemotionSharedMemoryCapture | null;
}) => Promise<CapturedFrame>;
