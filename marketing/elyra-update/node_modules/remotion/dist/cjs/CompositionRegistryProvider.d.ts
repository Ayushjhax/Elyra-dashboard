import { type CommittedCompositionSnapshot } from './committed-metadata.js';
export declare const CompositionRegistryProvider: import("react").ForwardRefExoticComponent<{
    readonly children: React.ReactNode;
    readonly onSnapshot: (snapshot: CommittedCompositionSnapshot) => void;
} & import("react").RefAttributes<() => void>>;
