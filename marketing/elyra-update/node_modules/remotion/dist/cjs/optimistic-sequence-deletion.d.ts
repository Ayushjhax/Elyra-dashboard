import { type ReactNode } from 'react';
import type { SequenceNodePath } from './SequenceManager.js';
type Node = {
    absolutePath: string;
    nodePath: SequenceNodePath;
};
export declare const usePendingSequenceDeletions: () => ReadonlySet<string>;
export declare const OptimisticSequenceDeletion: {
    register: (stack: string | null, node: Node | null) => void;
    isDeleted: (node: Node | null, pending: ReadonlySet<string>) => boolean;
    isElementDeleted: (element: ReactNode, pending: ReadonlySet<string>) => boolean;
    set: (nodes: readonly Node[], revision: number, deleted: boolean) => void;
    rollback: (nodes: readonly Node[], revision: number) => void;
    rollbackRevision: (revision: number) => void;
    remap: (remappings: readonly {
        previousNodePath: Node;
        nodePath: Node | null;
        revision: number;
    }[]) => void;
    restore: (nodes: readonly Node[], revision: number, deleted: boolean) => void;
    prepareRetirement: (nodes: readonly Node[], dispatchedRevision: number) => () => void;
};
export {};
