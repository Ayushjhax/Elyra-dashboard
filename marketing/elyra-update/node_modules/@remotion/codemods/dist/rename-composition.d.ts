import type { CodemodProject } from './codemod-project';
import { type CompositionTarget } from './composition-editing';
import { type CodemodNodeResult, type NodeReference } from './node-references';
export type RenameCompositionOptions<Project extends CodemodProject> = CompositionTarget & {
    project: Project;
    newId: string;
};
export declare const renameComposition: <Project extends CodemodProject>({ project, compositionFile, compositionId, newId, }: RenameCompositionOptions<Project>) => CodemodNodeResult & {
    updatedNode: NodeReference;
};
