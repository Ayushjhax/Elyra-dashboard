export type SourceMutationOperation = {
    readonly id: string;
    readonly revision: number;
};
export declare const getSourceMutationRevision: () => number;
export declare const getLastDispatchedSourceMutationRevision: () => number;
export declare const getActiveSourceMutationRevision: () => number | null;
export declare const waitForSourceMutationQueue: () => Promise<unknown>;
export declare const enqueueSourceMutation: <T>(run: (operation: SourceMutationOperation) => Promise<T>, onQueued?: ((operation: SourceMutationOperation) => void) | null) => Promise<T>;
