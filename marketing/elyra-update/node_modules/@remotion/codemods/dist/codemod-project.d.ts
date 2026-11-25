export type CodemodProject = {
    files: Record<string, string>;
    rootDir: string;
};
export type CodemodFileChange = {
    filePath: string;
    previousContents: string | null;
    nextContents: string | null;
};
export type CodemodResult = {
    changes: CodemodFileChange[];
};
export declare const getCodemodResult: ({ project, edits, }: {
    project: CodemodProject;
    edits: {
        filePath: string;
        nextContents: string | null;
    }[];
}) => CodemodResult;
export declare const applyCodemodChanges: <Project extends CodemodProject>(project: Project, changes: readonly CodemodFileChange[]) => Project;
