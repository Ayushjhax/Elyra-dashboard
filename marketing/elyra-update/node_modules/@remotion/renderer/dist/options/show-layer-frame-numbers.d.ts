export declare const showLayerFrameNumbersOption: {
    name: string;
    addedIn: string;
    cliFlag: "show-layer-frame-numbers";
    id: "show-layer-frame-numbers";
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
