export declare const overrideWidthOption: {
    name: string;
    addedIn: string;
    cliFlag: "width";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    } | {
        source: string;
        value: null;
    };
    setConfig: (width: number | null) => void;
    reset: () => void;
    id: "width";
};
