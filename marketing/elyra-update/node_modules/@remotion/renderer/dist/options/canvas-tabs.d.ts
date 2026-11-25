export declare const canvasTabsOption: {
    name: string;
    addedIn: string;
    cliFlag: "disable-canvas-tabs";
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
    id: "disable-canvas-tabs";
};
