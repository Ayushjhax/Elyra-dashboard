export declare const previewSampleRateOption: {
    name: string;
    addedIn: string;
    cliFlag: "preview-sample-rate";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: number;
        source: string;
    } | {
        value: null;
        source: string;
    };
    setConfig: (value: number | null) => void;
    id: "preview-sample-rate";
};
