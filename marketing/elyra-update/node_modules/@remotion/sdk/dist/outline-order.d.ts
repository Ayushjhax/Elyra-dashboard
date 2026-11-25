import type { CanvasOutline } from './outline-geometry';
export type CanvasOutlineOrderTarget = {
    readonly sequence: CanvasOutlineSequenceParent & {
        readonly controls?: {
            readonly componentIdentity: string | null;
        } | null;
    };
    readonly selected: boolean;
    readonly containsSelection: boolean;
};
export type CanvasOutlineSequenceParent = {
    readonly id: string;
    readonly parent: string | null;
};
/** Orders quads from back to front while preserving access to nested targets. */
export declare const orderCanvasOutlinesForRendering: ({ outlines, sequences, targetsByKey, }: {
    readonly outlines: readonly CanvasOutline[];
    readonly sequences: readonly CanvasOutlineSequenceParent[];
    readonly targetsByKey: ReadonlyMap<string, CanvasOutlineOrderTarget>;
}) => readonly CanvasOutline[];
