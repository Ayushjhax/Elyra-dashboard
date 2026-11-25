import { CanvasPool } from './canvas-pool.js';
export declare const cleanupWithSharedWebGLPool: (cleanup: () => void) => void;
export declare const subscribeToSharedWebGLContextLoss: (onContextLost: (canvas: HTMLCanvasElement) => void) => (() => void);
export declare const acquireSharedWebGLPool: (width: number, height: number) => Promise<{
    pool: CanvasPool;
    release: () => void;
}>;
