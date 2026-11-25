export declare const bundleCacheOption: {
    name: string;
    addedIn: string;
    cliFlag: "bundle-cache";
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
    id: "bundle-cache";
};
