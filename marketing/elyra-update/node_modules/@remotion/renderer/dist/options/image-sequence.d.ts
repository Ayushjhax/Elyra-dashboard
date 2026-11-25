export declare const imageSequenceOption: {
    name: string;
    addedIn: string;
    cliFlag: "sequence";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    type: boolean;
    id: "sequence";
};
