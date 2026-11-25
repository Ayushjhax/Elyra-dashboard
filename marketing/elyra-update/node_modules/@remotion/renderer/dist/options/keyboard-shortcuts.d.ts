export declare const keyboardShortcutsOption: {
    name: string;
    addedIn: string;
    cliFlag: "disable-keyboard-shortcuts";
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
    id: "disable-keyboard-shortcuts";
};
