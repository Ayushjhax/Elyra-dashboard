export declare const publicPathOption: {
    name: string;
    addedIn: string;
    cliFlag: "public-path";
    description: () => import("react").JSX.Element;
    ssrName: 'publicPath';
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string;
    } | {
        source: string;
        value: null;
    };
    setConfig: (value: string | null) => void;
    type: string | null;
    id: "public-path";
};
