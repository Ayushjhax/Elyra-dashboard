import type { CanvasOutline, CanvasOutlineTarget } from './outline-geometry';
type SvgViewport = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};
type SvgScreenCtm = Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;
export declare const getTransformedSvgViewportPoints: ({ viewport, ctm, containerRect, }: {
    readonly viewport: SvgViewport;
    readonly ctm: SvgScreenCtm;
    readonly containerRect: Pick<DOMRect, 'left' | 'top'>;
}) => CanvasOutline['points'];
export declare const cropCanvasOutlinePoints: (points: CanvasOutline['points'], crop: CanvasOutlineTarget['crop']) => CanvasOutline['points'];
/**
 * Measures a batch in composition pixels at scale 1. Shared ancestor transforms
 * are cached only within this measurement batch.
 */
export declare const measureCanvasOutlineTargets: (contentRoot: HTMLElement, targets: readonly CanvasOutlineTarget[]) => CanvasOutline[];
export declare const canvasOutlinesAreEqual: (a: readonly CanvasOutline[], b: readonly CanvasOutline[]) => boolean;
export {};
