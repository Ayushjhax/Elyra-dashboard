export declare const configOption: {
    name: string;
    addedIn: string;
    cliFlag: "config";
    description: () => import("react").JSX.Element;
    ssrName: null;
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
    setConfig: () => never;
    type: string | null;
    id: "config";
};
