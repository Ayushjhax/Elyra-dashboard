export declare const publicDirOption: {
    name: string;
    addedIn: string;
    cliFlag: "public-dir";
    description: () => import("react").JSX.Element;
    ssrName: 'publicDir';
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
    id: "public-dir";
};
