export declare const sequenceActivityLimitOption: {
    name: string;
    addedIn: string;
    cliFlag: "sequence-activity-limit";
    id: "sequence-activity-limit";
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
