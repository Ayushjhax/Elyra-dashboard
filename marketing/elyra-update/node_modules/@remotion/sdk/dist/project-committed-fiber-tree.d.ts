import { type Fiber, type CommittedMetadata } from './react-commit-types';
export type FiberProjection = {
    readonly metadata: CommittedMetadata | null;
    readonly outline: {
        readonly type: 'host';
        readonly node: Element | Text;
    } | {
        readonly type: 'portal' | 'hidden';
    } | null;
    readonly children: readonly FiberProjection[];
    readonly hasMetadata: boolean;
};
type CommittedFiberSnapshot = {
    readonly fiber: Fiber;
    readonly child: Fiber | null;
    readonly children: readonly CommittedFiberSnapshot[];
    readonly projectedChildren: readonly FiberProjection[];
    readonly projection: FiberProjection | null;
};
export type FiberProjectionCache = {
    current: CommittedFiberSnapshot | null;
};
export declare const projectCommittedFiberTree: (root: Fiber, cache: FiberProjectionCache | null) => {
    projection: FiberProjection | null;
    outlineCollectionFailed: boolean;
};
export {};
