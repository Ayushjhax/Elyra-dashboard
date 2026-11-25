export declare const outDirOption: {
    name: string;
    addedIn: string;
    cliFlag: "out-dir";
    description: () => import("react").JSX.Element;
    ssrName: 'outDir';
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string;
    } | {
        source: string;
        value: null;
    };
    setConfig: (value: string | null) => void;
    type: string | null;
    id: "out-dir";
};
