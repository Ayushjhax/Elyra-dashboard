import React from 'react';
import type { CanvasController } from './canvas-controller';
import type { CanvasSequenceNodePathResolver } from './sequence-node-path';
import type { CanvasSequencePropsChangeHandler, CanvasSequencePropStatusResolver } from './sequence-props-change';
export declare const CanvasOutlineOverlay: React.MemoExoticComponent<({ controller, resolveSequenceNodePathInfo, onSequencePropsChange, getSequencePropStatuses, }: {
    readonly controller: CanvasController;
    readonly resolveSequenceNodePathInfo: CanvasSequenceNodePathResolver;
    readonly onSequencePropsChange: CanvasSequencePropsChangeHandler | null;
    readonly getSequencePropStatuses: CanvasSequencePropStatusResolver | null;
}) => React.JSX.Element>;
