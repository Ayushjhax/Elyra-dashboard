import type { Page } from './browser/BrowserPage';
import type { StillImageFormat } from './image-format';
import type { CapturedFrame, RemotionSharedMemoryCapture } from './remotion-shared-memory';
export declare const screenshotTask: ({ format, height, omitBackground, page, width, path, jpegQuality, scale, remotionSharedMemory, }: {
    page: Page;
    format: StillImageFormat;
    path?: string;
    jpegQuality?: number;
    omitBackground: boolean;
    width: number;
    height: number;
    scale: number;
    remotionSharedMemory: RemotionSharedMemoryCapture | null;
}) => Promise<CapturedFrame>;
