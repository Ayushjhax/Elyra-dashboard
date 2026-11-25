import type { AnyComposition } from './CompositionManager.js';
import type { TFolder } from './Folder.js';
export type CommittedCompositionEntry = {
    readonly type: 'composition';
    readonly value: AnyComposition;
} | {
    readonly type: 'folder';
    readonly value: TFolder;
};
type CompositionRegistryFallback = {
    readonly entries: Map<object, CommittedCompositionEntry>;
    readonly notifyCommit: () => void;
};
export declare const CompositionRegistryFallbackContext: import("react").Context<CompositionRegistryFallback | null>;
export declare const useCommittedCompositionEntry: (entry: CommittedCompositionEntry | null) => void;
export {};
