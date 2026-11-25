import type { SequenceNodePathInfo } from './get-timeline-sequence-sort-key';
import { type CanvasSelectionItem } from './selection';
/** The sequences to move when a timeline drag starts on a sequence. */
export declare const getCanvasSequenceReorderSelection: ({ draggedItem, selectedItems, }: {
    readonly draggedItem: Extract<CanvasSelectionItem, {
        type: 'sequence';
    }>;
    readonly selectedItems: readonly CanvasSelectionItem[];
}) => readonly SequenceNodePathInfo[];
/** The insertion index after the selected siblings have been removed. */
export declare const getCanvasSequenceReorderInsertionIndex: ({ sourceIndexes, targetIndex, position, }: {
    readonly sourceIndexes: readonly number[];
    readonly targetIndex: number;
    readonly position: 'before' | 'after';
}) => number | null;
