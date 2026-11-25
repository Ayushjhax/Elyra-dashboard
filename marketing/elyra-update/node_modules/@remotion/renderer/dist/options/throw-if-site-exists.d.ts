export declare const throwIfSiteExistsOption: {
    cliFlag: "throw-if-site-exists";
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
    id: "throw-if-site-exists";
};
