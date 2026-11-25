import type { SequenceNodePathInfo } from './get-timeline-sequence-sort-key';
import type { CanvasHoverController } from './hover';
import type { CanvasOutlineTarget } from './outline-geometry';
import type { CanvasOutlineOrderTarget, CanvasOutlineSequenceParent } from './outline-order';
export type CanvasOutlineRenderTarget = Omit<CanvasOutlineTarget, 'includeOutsideContainer'> & CanvasOutlineOrderTarget & {
    readonly nodePathInfo: SequenceNodePathInfo;
    readonly showSelectedOutline: boolean;
};
/** Measure and order a host's outline targets without subscribing to playback. */
export declare const useCanvasOutlines: <Target extends CanvasOutlineRenderTarget>({ contentRoot, targets, sequences, hoverController, freezeOrder, }: {
    readonly contentRoot: HTMLElement;
    readonly targets: readonly Target[];
    readonly sequences: readonly CanvasOutlineSequenceParent[];
    readonly hoverController: CanvasHoverController;
    readonly freezeOrder: boolean;
}) => {
    outlines: readonly import("./outline-geometry").CanvasOutline[];
    outlinesForRendering: readonly import("./outline-geometry").CanvasOutline[];
    outlinesByKey: Map<string, import("./outline-geometry").CanvasOutline>;
    targetsByKey: Map<string, Target>;
    hoveredNodePathKey: string | null;
};
