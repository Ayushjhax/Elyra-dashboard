export declare const apiKeyOption: {
    name: string;
    addedIn: string;
    cliFlag: "api-key";
    description: () => import("react").JSX.Element;
    ssrName: 'apiKey';
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string | null;
    };
    setConfig: (value: string | null) => void;
    id: "api-key";
};
