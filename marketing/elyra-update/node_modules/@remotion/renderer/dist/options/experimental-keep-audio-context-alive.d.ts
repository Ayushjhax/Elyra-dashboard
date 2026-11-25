export declare const experimentalKeepAudioContextAliveOption: {
    name: string;
    addedIn: string;
    cliFlag: "experimental-keep-audio-context-alive";
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
    id: "experimental-keep-audio-context-alive";
};
