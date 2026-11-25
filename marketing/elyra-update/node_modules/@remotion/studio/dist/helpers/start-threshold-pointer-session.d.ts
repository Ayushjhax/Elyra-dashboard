import type { PointerSessionEndReason } from './pointer-session';
type PointerHandlers = {
    onMove: (event: PointerEvent) => void;
    onEnd: (reason: PointerSessionEndReason, event: PointerEvent | null) => void;
};
export declare const startThresholdPointerSession: ({ event, captureTarget, minimumMovement, onStart, onCancel, }: {
    event: PointerEvent;
    captureTarget: Element;
    minimumMovement: number | null;
    onStart: () => PointerHandlers;
    onCancel: () => void;
}) => (() => void);
export {};
