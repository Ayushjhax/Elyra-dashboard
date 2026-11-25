import type { FiberProjection } from './project-committed-fiber-tree';
import type { CommittedMetadata } from './react-commit-types';
export type OutlineCollectors = readonly (Element | Text)[][] | null;
export declare const createCommitOutlineCollector: (projectionFailed: boolean) => {
    visit: (fiber: FiberProjection, metadata: CommittedMetadata | null, outlineCollectors: OutlineCollectors) => OutlineCollectors;
    publish: () => number;
};
