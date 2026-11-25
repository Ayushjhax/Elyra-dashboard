export declare const audioBitrateOption: {
    name: string;
    addedIn: string;
    cliFlag: "audio-bitrate";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: string;
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
    id: "audio-bitrate";
};
