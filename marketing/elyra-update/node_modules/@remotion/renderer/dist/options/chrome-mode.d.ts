export declare const validChromeModeOptions: readonly ['headless-shell', 'chrome-for-testing'];
export type ChromeMode = (typeof validChromeModeOptions)[number];
export declare const chromeModeOption: {
    cliFlag: "chrome-mode";
    name: string;
    addedIn: string;
    ssrName: string;
    description: () => import("react").JSX.Element;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: ChromeMode;
        source: string;
    };
    setConfig: (newChromeMode: ChromeMode) => void;
    type: ChromeMode;
    id: "chrome-mode";
};
