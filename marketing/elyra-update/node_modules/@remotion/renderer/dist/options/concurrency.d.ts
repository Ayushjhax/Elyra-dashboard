export type Concurrency = number | string | null;
export declare const concurrencyOption: {
    name: string;
    addedIn: string;
    cliFlag: "concurrency";
    description: () => import("react").JSX.Element;
    ssrName: 'concurrency';
    docLink: string;
    type: Concurrency;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: Concurrency;
    };
    setConfig: (value: Concurrency) => void;
    id: "concurrency";
};
