import type { CodemodProject } from './codemod-project';
import { type CompositionTarget } from './composition-editing';
import { type CodemodNodeResult } from './node-references';
export type DeleteCompositionOptions<Project extends CodemodProject> = CompositionTarget & {
    project: Project;
};
export declare const deleteComposition: <Project extends CodemodProject>({ project, compositionFile, compositionId, }: DeleteCompositionOptions<Project>) => CodemodNodeResult;
