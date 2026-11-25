export declare const overwriteOption: {
    name: string;
    addedIn: string;
    cliFlag: "overwrite";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, defaultValue: boolean) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    reset: () => void;
    id: "overwrite";
};
