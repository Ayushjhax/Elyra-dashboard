import type { CodemodProject } from './codemod-project';
import { type CompositionTarget, type CompositionMetadata } from './composition-editing';
import type { CodemodInsertionResult } from './node-references';
export type DuplicateCompositionOptions<Project extends CodemodProject> = CompositionTarget & {
    project: Project;
    newId: string;
    tag?: 'Composition' | 'Still';
    metadata?: Partial<CompositionMetadata>;
};
export declare const duplicateComposition: <Project extends CodemodProject>({ project, compositionFile, compositionId, newId, tag, metadata, }: DuplicateCompositionOptions<Project>) => CodemodInsertionResult;
