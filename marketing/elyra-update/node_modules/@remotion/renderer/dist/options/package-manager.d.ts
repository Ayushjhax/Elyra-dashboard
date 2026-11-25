export declare const packageManagerOption: {
    name: string;
    addedIn: string;
    cliFlag: "package-manager";
    description: () => import("react").JSX.Element;
    ssrName: 'packageManager';
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
    id: "package-manager";
};
