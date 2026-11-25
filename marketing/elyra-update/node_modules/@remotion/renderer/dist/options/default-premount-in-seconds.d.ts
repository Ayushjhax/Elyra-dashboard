export declare const defaultPremountInSecondsOption: {
    name: string;
    addedIn: string;
    cliFlag: "default-premount-in-seconds";
    id: "default-premount-in-seconds";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: number;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: number;
        source: string;
    };
    setConfig(value: number): void;
    getConfigValue: () => number | null;
    reset: () => void;
};
