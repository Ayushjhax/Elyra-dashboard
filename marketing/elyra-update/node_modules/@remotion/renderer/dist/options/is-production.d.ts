export declare const isProductionOption: {
    name: string;
    addedIn: string;
    cliFlag: "is-production";
    description: () => import("react").JSX.Element;
    ssrName: 'isProduction';
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean | null;
    };
    setConfig: (value: boolean | null) => void;
    type: boolean | null;
    id: "is-production";
};
