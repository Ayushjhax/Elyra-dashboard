import type { CodemodProject } from './codemod-project';
import { type CodemodNodeResult, type NodeReference } from './node-references';
export type DuplicateNodesOptions<Project extends CodemodProject> = {
    project: Project;
    nodes: NodeReference[];
};
export type DuplicateNodesResult = CodemodNodeResult & {
    insertedNodes: NodeReference[];
    duplicatedNodes: NodeReference[];
    editDetails: {
        filePath: string;
        nodeLabels: string[];
        logLines: number[];
    }[];
};
export declare const duplicateNodes: <Project extends CodemodProject>({ project, nodes, }: DuplicateNodesOptions<Project>) => Promise<DuplicateNodesResult>;
