export declare const benchmarkConcurrenciesOption: {
    name: string;
    addedIn: string;
    cliFlag: "concurrencies";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: string;
        source: string;
    } | {
        value: null;
        source: string;
    };
    setConfig: (value: string | null) => void;
    id: "concurrencies";
};
