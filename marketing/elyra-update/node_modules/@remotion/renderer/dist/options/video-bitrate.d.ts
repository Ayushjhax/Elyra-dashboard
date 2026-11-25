export declare const videoBitrateOption: {
    name: string;
    addedIn: string;
    cliFlag: "video-bitrate";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string | null;
    };
    setConfig: (bitrate: string | null) => void;
    id: "video-bitrate";
};
