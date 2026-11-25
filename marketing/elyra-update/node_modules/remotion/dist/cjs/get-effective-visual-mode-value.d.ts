import type { CanUpdateSequencePropStatusKeyframed, CanUpdateSequencePropStatusStatic, DragOverrideValue } from './use-schema';
export type ResolvedDragOverrideValue = {
    readonly type: 'none';
} | {
    readonly type: 'resolved';
    readonly value: unknown;
};
export declare const getFrameInKeyframedStatusClock: ({ frame, status, }: {
    readonly frame: number;
    readonly status: CanUpdateSequencePropStatusKeyframed;
}) => number;
export declare const resolveDragOverrideValue: ({ dragOverrideValue, frame, }: {
    dragOverrideValue: DragOverrideValue | undefined;
    frame: number | null;
}) => ResolvedDragOverrideValue;
export declare const getEffectiveVisualModeValue: ({ propStatus, dragOverrideValue, defaultValue, frame, shouldResortToDefaultValueIfUndefined, }: {
    propStatus: CanUpdateSequencePropStatusStatic | CanUpdateSequencePropStatusKeyframed;
    dragOverrideValue: DragOverrideValue | undefined;
    defaultValue: unknown;
    frame?: number | null;
    shouldResortToDefaultValueIfUndefined: boolean;
}) => unknown;
