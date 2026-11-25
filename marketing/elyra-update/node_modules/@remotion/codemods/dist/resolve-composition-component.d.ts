import type { CodemodProject } from './codemod-project';
import type { CompositionTarget } from './composition-editing';
export type ResolveCompositionComponentOptions = CompositionTarget & {
    project: CodemodProject;
};
export declare const resolveCompositionComponent: ({ project, compositionFile, compositionId, }: ResolveCompositionComponentOptions) => {
    filePath: string;
    exportName: string;
    location: {
        line: number;
        column: number;
    };
    canAddContent: boolean;
};
