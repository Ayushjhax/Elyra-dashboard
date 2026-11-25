import type { CanvasSelectionInteraction } from './selection';
export type CanvasOutlinePointerDownDecision = {
    readonly interaction: CanvasSelectionInteraction;
    readonly temporaryTranslate: boolean;
    readonly shouldUpdateSelection: boolean;
    readonly deferSelection: boolean;
    readonly dragExistingSelection: boolean;
    readonly pointerInsideSelectedOutline: boolean;
};
export declare const getCanvasOutlineSelectionInteraction: ({ shiftKey, metaKey, ctrlKey, }: {
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
}) => CanvasSelectionInteraction;
/**
 * Consumes a primary pointer down and decides how it affects the selection.
 * Hosts with dragging defer the selection until pointer release when requested;
 * hosts without dragging can apply every requested selection immediately.
 */
export declare const handleCanvasOutlinePointerDown: ({ event, polygon, hasTarget, selected, containsSelection, translateWithCommandKey, isMac, }: {
    readonly event: Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'preventDefault' | 'stopPropagation'>;
    readonly polygon: SVGPolygonElement | null;
    readonly hasTarget: boolean;
    readonly selected: boolean;
    readonly containsSelection: boolean;
    readonly translateWithCommandKey: boolean;
    readonly isMac: boolean;
}) => CanvasOutlinePointerDownDecision | null;
