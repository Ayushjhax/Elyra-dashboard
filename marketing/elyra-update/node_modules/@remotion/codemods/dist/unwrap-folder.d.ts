import type { AddFolderOptions } from './add-folder';
import type { CodemodProject } from './codemod-project';
import { type CodemodNodeResult } from './node-references';
export type UnwrapFolderOptions<Project extends CodemodProject> = AddFolderOptions<Project>;
export declare const unwrapFolder: <Project extends CodemodProject>({ project, compositionFile, folder, }: UnwrapFolderOptions<Project>) => CodemodNodeResult;
