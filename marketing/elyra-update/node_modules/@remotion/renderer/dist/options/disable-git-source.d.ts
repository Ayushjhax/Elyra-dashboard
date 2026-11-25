export declare const disableGitSourceOption: {
    cliFlag: "disable-git-source";
    description: () => string;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    name: string;
    addedIn: string;
    setConfig: () => never;
    ssrName: string;
    type: boolean;
    id: "disable-git-source";
};
