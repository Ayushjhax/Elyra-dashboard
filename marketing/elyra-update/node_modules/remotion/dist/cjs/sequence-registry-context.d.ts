import React from 'react';
import type { TSequence } from './CompositionManager.js';
import type { RegistryStore } from './registry-store.js';
export type SequenceManagerActions = {
    registerSequence: (seq: TSequence) => void;
    updateSequence: (seq: TSequence) => void;
    unregisterSequence: (id: string) => void;
};
export type SequenceManagerRef = {
    current: TSequence[];
};
export type SequenceNodePath = Array<string | number>;
export declare const SequenceManagerActionsContext: React.Context<SequenceManagerActions>;
export declare const SequenceRegistryContext: React.Context<RegistryStore<TSequence[]> | null>;
export declare const SequenceCommitRegistrationContext: React.Context<boolean>;
export declare const SequenceRegistryScopeContext: React.Context<{
    readonly commitRegistrationRequested: boolean;
    readonly onCommitSequences: (scopeId: string, sequences: readonly TSequence[], sequenceIds: readonly string[]) => void;
} | null>;
export declare const useSequenceManagerSequences: () => TSequence[];
export declare const SequenceManagerRefContext: React.Context<SequenceManagerRef>;
export declare const SequenceRegistrationContext: React.Context<boolean>;
export declare const DisableSequenceRegistrationContext: React.Context<boolean>;
export declare const DisableSequenceRegistrationProvider: React.FC<{
    readonly children: React.ReactNode;
}>;
