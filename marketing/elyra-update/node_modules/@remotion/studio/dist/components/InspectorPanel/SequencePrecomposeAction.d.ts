import React from 'react';
import type { SequenceNodePathInfo } from '../../helpers/get-timeline-sequence-sort-key';
export declare const SequencePrecomposeAction: React.FC<{
    readonly targets: readonly {
        readonly nodePathInfo: SequenceNodePathInfo;
        readonly displayName: string | null;
        readonly line: number | null;
        readonly singleChildComponent: unknown;
        readonly isTransition: boolean;
    }[];
    readonly sourceActionsDisabled: boolean;
}>;
