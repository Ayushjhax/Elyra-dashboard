export declare const overrideDurationOption: {
    name: string;
    addedIn: string;
    cliFlag: "duration";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    } | {
        source: string;
        value: null;
    };
    setConfig: (duration: number | null) => void;
    reset: () => void;
    id: "duration";
};
