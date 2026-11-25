import type { CodemodProject } from './codemod-project';
import { type NodeReference } from './node-references';
export type ReorderNodesOptions<Project extends CodemodProject> = {
    project: Project;
    nodes: readonly NodeReference[];
    target: NodeReference;
    position: 'before' | 'after';
};
export declare const reorderNodes: <Project extends CodemodProject>({ project, nodes, target, position, }: ReorderNodesOptions<Project>) => Promise<{
    changes: import("./codemod-project").CodemodFileChange[];
    nodePathRemappings: import("./node-references").NodePathRemapping[];
    editDetails: {
        filePath: string;
        formatted: boolean;
        sequenceLabel: string;
        logLine: number;
    }[];
    updatedNodes: NodeReference[];
}>;
