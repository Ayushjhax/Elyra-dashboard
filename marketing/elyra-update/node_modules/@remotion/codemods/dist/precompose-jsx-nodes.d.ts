import type { CodemodProject } from './codemod-project';
import { type CompositionMetadata } from './composition-editing';
import { type NodeReference } from './node-references';
type PrecomposeOptions<Project extends CodemodProject> = {
    project: Project;
    nodes: NodeReference[];
    compositionFile: string;
    compositionId: string;
    metadata: CompositionMetadata;
    existingCompositionIds: string[];
    name: {
        compositionId: string;
        componentName: string;
    } | null;
};
export declare class PrecomposeNameError extends Error {
    name: string;
}
export declare const precomposeJsxNodes: <Project extends CodemodProject>({ project, nodes, compositionFile, compositionId, metadata, existingCompositionIds, name: requestedName, }: PrecomposeOptions<Project>) => {
    changes: import("./codemod-project").CodemodFileChange[];
    nodePathRemappings: import("./node-references").NodePathRemapping[];
    logLine: number;
    newCompositionId: string;
};
export declare const canPrecomposeJsxNodes: <Project extends CodemodProject>(options: PrecomposeOptions<Project>) => {
    canPrecompose: boolean;
    reason: string | null;
};
export {};
