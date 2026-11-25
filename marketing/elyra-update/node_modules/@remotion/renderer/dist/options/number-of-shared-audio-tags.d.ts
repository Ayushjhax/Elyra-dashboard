export declare const numberOfSharedAudioTagsOption: {
    name: string;
    addedIn: string;
    cliFlag: "number-of-shared-audio-tags";
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
    id: "number-of-shared-audio-tags";
};
