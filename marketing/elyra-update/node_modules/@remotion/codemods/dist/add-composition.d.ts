import type { CodemodProject } from './codemod-project';
import { type CompositionTarget, type CompositionMetadata, type FolderReference } from './composition-editing';
import type { CodemodInsertionResult } from './node-references';
export type AddCompositionOptions<Project extends CodemodProject> = CompositionTarget & {
    project: Project;
    component: {
        importName: string;
        importPath: string | null;
    };
    metadata: CompositionMetadata;
    folder?: FolderReference;
};
export declare const componentNameRegex: RegExp;
export declare const addComposition: <Project extends CodemodProject>({ project, compositionFile, compositionId, component, metadata, folder, }: AddCompositionOptions<Project>) => CodemodInsertionResult;
