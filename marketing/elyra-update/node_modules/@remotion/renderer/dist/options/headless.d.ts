export declare const headlessOption: {
    name: string;
    addedIn: string;
    cliFlag: "disable-headless";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    id: "disable-headless";
};
