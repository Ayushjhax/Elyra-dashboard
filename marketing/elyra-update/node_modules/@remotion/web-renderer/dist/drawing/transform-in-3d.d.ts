import type { InternalState } from '../internal-state';
export declare const transformIn3d: ({ matrix, sourceCanvas, sourceRect, destRect, internalState, scale, }: {
    sourceRect: DOMRect;
    matrix: DOMMatrix;
    sourceCanvas: OffscreenCanvas;
    destRect: DOMRect;
    internalState: InternalState;
    scale: number;
}) => OffscreenCanvas;
