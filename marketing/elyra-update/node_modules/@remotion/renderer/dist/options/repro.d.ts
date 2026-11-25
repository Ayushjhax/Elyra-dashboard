declare const setRepro: (should: boolean) => void;
export declare const reproOption: {
    name: string;
    addedIn: string;
    cliFlag: "repro";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    setConfig: typeof setRepro;
    id: "repro";
};
export {};
