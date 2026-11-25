export declare const overrideFpsOption: {
    name: string;
    addedIn: string;
    cliFlag: "fps";
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
    setConfig: (fps: number | null) => void;
    reset: () => void;
    id: "fps";
};
