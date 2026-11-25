export declare const ipv4Option: {
    name: string;
    addedIn: string;
    cliFlag: "ipv4";
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
    id: "ipv4";
};
