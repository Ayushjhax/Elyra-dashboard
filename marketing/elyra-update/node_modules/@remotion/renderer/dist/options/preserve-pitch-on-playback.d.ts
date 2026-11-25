export declare const preservePitchOnPlaybackOption: {
    name: string;
    addedIn: string;
    cliFlag: "preserve-pitch-on-playback";
    id: "preserve-pitch-on-playback";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    setConfig(value: boolean): void;
    getConfigValue: () => boolean | null;
    reset: () => void;
};
