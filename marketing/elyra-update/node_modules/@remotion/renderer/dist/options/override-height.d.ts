export declare const overrideHeightOption: {
    name: string;
    addedIn: string;
    cliFlag: "height";
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
    setConfig: (height: number | null) => void;
    reset: () => void;
    id: "height";
};
