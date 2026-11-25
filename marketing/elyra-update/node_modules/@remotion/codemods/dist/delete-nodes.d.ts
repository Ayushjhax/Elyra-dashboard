import type { CodemodProject } from './codemod-project';
import { type CodemodNodeResult, type NodeReference } from './node-references';
export type DeleteNodesOptions<Project extends CodemodProject> = {
    project: Project;
    nodes: NodeReference[];
};
export declare const deleteNodes: <Project extends CodemodProject>({ project, nodes, }: DeleteNodesOptions<Project>) => Promise<CodemodNodeResult & {
    editDetails: {
        filePath: string;
        formatted: boolean;
        nodeLabels: string[];
        logLines: number[];
    }[];
}>;
