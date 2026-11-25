export declare const licenseKeyOption: {
    name: string;
    addedIn: string;
    cliFlag: "license-key";
    description: () => import("react").JSX.Element;
    ssrName: 'licenseKey';
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string | null;
    };
    setConfig: (value: string | null) => void;
    id: "license-key";
};
