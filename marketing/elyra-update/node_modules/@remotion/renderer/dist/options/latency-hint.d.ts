export declare const audioLatencyHintOption: {
    name: string;
    addedIn: string;
    cliFlag: "audio-latency-hint";
    description: () => import("react").JSX.Element;
    ssrName: 'audioLatencyHint';
    docLink: string;
    type: AudioContextLatencyCategory;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: AudioContextLatencyCategory;
        source: string;
    } | {
        value: null;
        source: string;
    };
    setConfig: (profile: AudioContextLatencyCategory | null) => void;
    getConfigValue: () => AudioContextLatencyCategory | null;
    reset: () => void;
    id: "audio-latency-hint";
};
