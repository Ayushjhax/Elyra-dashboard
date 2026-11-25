export declare const preferLosslessAudioOption: {
    name: string;
    addedIn: string;
    cliFlag: "prefer-lossless";
    description: () => import("react").JSX.Element;
    docLink: string;
    type: boolean;
    ssrName: 'preferLossless';
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: true;
        source: string;
    } | {
        value: false;
        source: string;
    };
    setConfig: (val: boolean) => void;
    id: "prefer-lossless";
};
