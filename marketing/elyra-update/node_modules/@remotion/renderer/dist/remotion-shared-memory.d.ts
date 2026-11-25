import type { Page } from './browser/BrowserPage';
import type { RemotionRawFrame as CdpRemotionRawFrame, RemotionFramePoolBackend } from './browser/devtools-types';
import { type StillImageFormat } from './image-format';
import type { LogLevel } from './log-level';
import type { PixelFormat } from './pixel-format';
export declare const getPreferredRemotionSharedMemoryBackend: () => 'auto' | RemotionFramePoolBackend;
export type RemotionSharedMemoryPoolLifetime = {
    isRetired: () => boolean;
    waitForRetirement: () => Promise<void>;
    onRetired: (listener: () => Promise<void>) => (() => void) | null;
};
export type RemotionRawFrame = CdpRemotionRawFrame & {
    type: 'remotion-shared-memory';
    poolId: number;
    sharedMemoryName: string;
    backend: RemotionFramePoolBackend;
    slotCount: number;
    slotCapacity: number;
    poolLifetime: RemotionSharedMemoryPoolLifetime;
    release: () => Promise<void>;
};
export type CapturedFrame = Buffer | RemotionRawFrame;
export declare class RemotionSharedMemoryCapture {
    #private;
    constructor(options: {
        width: number;
        height: number;
        indent: boolean;
        logLevel: LogLevel;
        backingDirectory: string | null;
    });
    isSupported(): boolean;
    getImageFormat(imageFormat: StillImageFormat): StillImageFormat;
    setPixelFormat(pixelFormat: PixelFormat): void;
    initializePages(pages: Page[]): Promise<void>;
    ensurePage(page: Page): Promise<void>;
    acquire(page: Page): Promise<{
        slot: number;
        frameId: string;
        fail: () => void;
        discardPublished: () => Promise<void>;
        publish: (metadata: CdpRemotionRawFrame) => Promise<RemotionRawFrame>;
    } | null>;
    destroy(): Promise<void>;
    forgetPage(page: Page): Promise<void>;
    forgetAllPages(): Promise<void>;
    dispose(): Promise<void>;
}
export declare const isRemotionRawFrame: (frame: CapturedFrame) => frame is RemotionRawFrame;
