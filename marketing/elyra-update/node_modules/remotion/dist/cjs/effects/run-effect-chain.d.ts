import { CanvasPool } from './canvas-pool.js';
import type { EffectImplementation, PreferredEffectBackend, Backend, EffectDefinitionAndStack } from './effect-types.js';
export type EffectChainState = {
    preferredEffectBackend: PreferredEffectBackend;
    gpuDevice: unknown | null;
    selections: WeakMap<object, {
        backend: Backend;
        implementation: EffectImplementation<unknown, unknown>;
    }>;
    readonly width: number;
    readonly height: number;
    pool: CanvasPool;
    webglPool: CanvasPool | null;
    releaseWebGL: (() => void) | null;
    unsubscribeWebGL: (() => void) | null;
    onWebGLContextLost: (canvas: HTMLCanvasElement) => void;
    webglGeneration: number;
    lastLostWebGLCanvas: HTMLCanvasElement | null;
    requestRedraw: (() => void) | null;
    setupCache: WeakMap<EffectImplementation<unknown, unknown>, WeakMap<HTMLCanvasElement, unknown>>;
    cleanupRegistry: Array<{
        backend: Backend;
        definition: EffectImplementation<unknown, unknown>;
        state: unknown;
        target: HTMLCanvasElement;
    }>;
    currentRunId: number;
    pendingRun: Promise<void> | null;
    cleanupRequested: boolean;
};
export declare const createEffectChainState: (width: number, height: number) => EffectChainState;
export declare const cleanupEffectChainState: (state: EffectChainState) => void;
/** Final compositing target for an effect chain (layout canvas or transferred offscreen). */
export type EffectChainOutput = HTMLCanvasElement | OffscreenCanvas;
export type RunEffectChainOptions = {
    readonly state: EffectChainState;
    readonly source: CanvasImageSource;
    readonly effects: EffectDefinitionAndStack<unknown>[];
    readonly output: EffectChainOutput;
    readonly width: number;
    readonly height: number;
};
export declare const runEffectChain: (options: RunEffectChainOptions) => Promise<boolean>;
