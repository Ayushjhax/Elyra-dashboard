import type { InternalState } from '../internal-state';
export declare const getPrecomposeRectFor3DTransform: ({ element, parentRect, matrix, }: {
    element: HTMLElement | SVGElement;
    parentRect: DOMRect;
    matrix: DOMMatrix;
}) => DOMRect | null;
export declare const handle3dTransform: ({ matrix, sourceRect, tempCanvas, rectAfterTransforms, internalState, scale, }: {
    matrix: DOMMatrix;
    sourceRect: DOMRect;
    tempCanvas: OffscreenCanvas;
    rectAfterTransforms: DOMRect;
    internalState: InternalState;
    scale: number;
}) => OffscreenCanvas | null;
