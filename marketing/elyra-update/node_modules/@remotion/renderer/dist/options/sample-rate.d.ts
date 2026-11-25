export declare const sampleRateOption: {
    name: string;
    addedIn: string;
    cliFlag: "sample-rate";
    description: () => import("react").JSX.Element;
    ssrName: 'sampleRate';
    docLink: string;
    type: number;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, compositionSampleRate?: number | null) => {
        value: number;
        source: string;
    };
    setConfig: (value: number) => void;
    id: "sample-rate";
};
