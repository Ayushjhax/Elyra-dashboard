export declare const mutedOption: {
    name: string;
    addedIn: string;
    cliFlag: "muted";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: () => void;
    reset: () => void;
    id: "muted";
};
