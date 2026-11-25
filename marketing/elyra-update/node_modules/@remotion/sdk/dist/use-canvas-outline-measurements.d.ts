import type { CanvasOutline, CanvasOutlineTarget } from './outline-geometry';
export declare const useCanvasOutlineMeasurements: ({ contentRoot, targets, }: {
    /** Observe composition mutations separately from the host's zoom and pan. */
    readonly contentRoot: HTMLElement;
    readonly targets: readonly CanvasOutlineTarget[];
}) => readonly CanvasOutline[];
