export declare const propsOption: {
    name: string;
    addedIn: string;
    cliFlag: "props";
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
    id: "props";
};
