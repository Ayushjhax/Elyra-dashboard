import type { Provider, ProviderExoticComponent, ProviderProps, RefObject } from 'react';
import type { AnyComposition, TSequence } from './CompositionManager.js';
import type { TFolder } from './Folder.js';
declare const COMMITTED_METADATA_PROP = "_remotionCommitMetadata";
export declare const COMMIT_ORDER_EVENT = "remotion:commit-order";
export declare const COMMIT_REGISTRATION_ERROR_EVENT = "remotion:commit-registration-error";
export declare const isCommitRegistrationObserverInstalled: () => boolean;
export type CompositionAndFolderOrderItem = {
    readonly type: 'composition';
    readonly id: string;
} | {
    readonly type: 'folder';
    readonly id: string;
};
export declare const getCompositionAndFolderOrderKey: (item: CompositionAndFolderOrderItem) => string;
export type CommitOrderEventDetail = {
    readonly sequenceManagers: readonly {
        readonly managerId: string;
        readonly sequenceIds: readonly string[];
    }[];
};
export declare const getFolderOrderId: ({ name, parent, }: {
    readonly name: string;
    readonly parent: string | null;
}) => string;
export type CommittedSequenceSnapshot = {
    readonly sequences: readonly TSequence[];
    readonly sequenceIds: readonly string[];
};
export type CommittedCompositionSnapshot = {
    readonly compositions: readonly AnyComposition[];
    readonly folders: readonly TFolder[];
    readonly orderIds: readonly string[];
};
export type CommittedMetadata = {
    readonly type: 'sequence';
    readonly id: string;
    readonly value: TSequence | null;
    readonly outlineChildrenRef: RefObject<Element | null> | null;
} | {
    readonly type: 'composition';
    readonly id: string;
    readonly value: AnyComposition;
} | {
    readonly type: 'folder';
    readonly id: string;
    readonly value: TFolder;
} | {
    readonly type: 'sequence-manager';
    readonly id: string;
    readonly onCommit: ((sequences: readonly TSequence[], sequenceIds: readonly string[]) => void) | null;
} | {
    readonly type: 'composition-manager';
    readonly id: string;
    readonly onCommit: ((snapshot: CommittedCompositionSnapshot) => void) | null;
};
export declare const withCommittedMetadata: <T>(provider: Provider<T>) => ProviderExoticComponent<ProviderProps<T> & {
    readonly [COMMITTED_METADATA_PROP]: CommittedMetadata | null;
}>;
export declare const CommittedMetadataProvider: ProviderExoticComponent<ProviderProps<null> & {
    readonly _remotionCommitMetadata: CommittedMetadata | null;
}>;
export declare const CommittedMetadataInternals: {
    metadataProp: typeof COMMITTED_METADATA_PROP;
    eventName: string;
    installationMarker: symbol;
    failureMarker: symbol;
    registrationErrorEventName: string;
};
export {};
