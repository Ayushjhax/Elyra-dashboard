import type { Backend } from './effect-types.js';
type CanvasPair = readonly [HTMLCanvasElement, HTMLCanvasElement];
export declare class CanvasPool {
    private width;
    private height;
    private readonly pairs;
    private readonly allocated;
    private readonly lostContexts;
    private readonly onContextLost;
    private disposed;
    constructor(width: number, height: number, onContextLost: (canvas: HTMLCanvasElement) => void);
    resize(width: number, height: number): void;
    owns(canvas: HTMLCanvasElement): boolean;
    assertWebGLContextsNotLost(): void;
    getCanvas(backend: Backend, index: 0 | 1): HTMLCanvasElement;
    getPair(backend: Backend): CanvasPair;
    private getCheckedEntry;
    assertContextNotLost(canvas: HTMLCanvasElement): void;
    prepareWebGL(canvas: HTMLCanvasElement, flipSourceY: boolean): void;
    retireWebGL(canvas: HTMLCanvasElement): void;
    dispose(): void;
    private allocateCanvas;
}
export {};
