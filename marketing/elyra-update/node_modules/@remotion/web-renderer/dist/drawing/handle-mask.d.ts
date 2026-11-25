import type { InternalState } from '../internal-state';
import type { MaskImageInfo } from './mask-image';
export declare const getPrecomposeRectForMask: (element: HTMLElement | SVGElement) => DOMRect;
export declare const handleMask: ({ maskImageInfo, maskRect, precomposeRect, tempContext, scale, internalState, }: {
    maskImageInfo: MaskImageInfo;
    maskRect: DOMRect;
    precomposeRect: DOMRect;
    tempContext: OffscreenCanvasRenderingContext2D;
    scale: number;
    internalState: InternalState;
}) => Promise<void>;
