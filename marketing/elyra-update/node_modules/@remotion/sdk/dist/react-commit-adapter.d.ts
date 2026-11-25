import { type CommittedSequenceRegistration, type CommittedCompositionRegistration } from './commit-registry-collector';
import { type FiberProjectionCache } from './project-committed-fiber-tree';
import { type FiberRoot, type HookTarget } from './react-commit-types';
export declare const collectReactCommit: (root: FiberRoot, registrations?: Map<string, CommittedSequenceRegistration> | null, previousRegistrations?: ReadonlyMap<string, CommittedSequenceRegistration> | null, compositionRegistry?: {
    readonly registrations: Map<string, CommittedCompositionRegistration>;
    readonly previous: ReadonlyMap<string, CommittedCompositionRegistration> | null;
} | null, projectionCache?: FiberProjectionCache | null) => {
    sequenceManagers: {
        managerId: string;
        sequenceIds: readonly string[];
    }[];
    outlineCount: number;
};
export declare const installReactCommitObserver: (target: HookTarget) => boolean;
