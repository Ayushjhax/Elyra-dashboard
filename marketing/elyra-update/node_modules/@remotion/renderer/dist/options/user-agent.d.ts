export declare const userAgentOption: {
    name: string;
    addedIn: string;
    cliFlag: "user-agent";
    description: () => import("react").JSX.Element;
    ssrName: 'userAgent';
    docLink: string;
    type: string | null;
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
    id: "user-agent";
};
