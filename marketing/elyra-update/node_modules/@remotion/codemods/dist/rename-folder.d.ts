import type { AddFolderOptions } from './add-folder';
import type { CodemodProject } from './codemod-project';
import { type CodemodNodeResult, type NodeReference } from './node-references';
export type RenameFolderOptions<Project extends CodemodProject> = AddFolderOptions<Project> & {
    newName: string;
};
export declare const renameFolder: <Project extends CodemodProject>({ project, compositionFile, folder, newName, }: RenameFolderOptions<Project>) => CodemodNodeResult & {
    updatedNode: NodeReference;
};
