import type { Page } from './browser/BrowserPage';
import type { StillImageFormat, VideoImageFormat } from './image-format';
import type { CapturedFrame, RemotionSharedMemoryCapture } from './remotion-shared-memory';
type TakeFrameOptions = {
    freePage: Page;
    imageFormat: VideoImageFormat | StillImageFormat;
    jpegQuality: number | undefined;
    height: number;
    width: number;
    output: string | null;
    scale: number;
    wantsBuffer: boolean;
    timeoutInMilliseconds: number;
    remotionSharedMemory: RemotionSharedMemoryCapture | null;
};
type TakeFrameResult<T extends RemotionSharedMemoryCapture | null> = T extends null ? Buffer | null : CapturedFrame | null;
export declare const takeFrame: <T extends RemotionSharedMemoryCapture | null>({ freePage, imageFormat, jpegQuality, width, height, output, scale, wantsBuffer, timeoutInMilliseconds, remotionSharedMemory, }: Omit<TakeFrameOptions, 'remotionSharedMemory'> & {
    remotionSharedMemory: T;
}) => Promise<TakeFrameResult<T>>;
export {};
