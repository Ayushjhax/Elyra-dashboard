export declare const beepOnFinishOption: {
    name: string;
    addedIn: string;
    cliFlag: "beep-on-finish";
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
    id: "beep-on-finish";
};
