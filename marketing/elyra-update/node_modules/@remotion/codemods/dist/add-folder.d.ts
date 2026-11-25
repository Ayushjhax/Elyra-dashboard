import type { CodemodProject } from './codemod-project';
import type { FolderReference } from './composition-editing';
import type { CodemodInsertionResult } from './node-references';
export type AddFolderOptions<Project extends CodemodProject> = {
    project: Project;
    compositionFile: string;
    folder: FolderReference;
};
export declare const addFolder: <Project extends CodemodProject>({ project, compositionFile, folder, }: AddFolderOptions<Project>) => CodemodInsertionResult;
