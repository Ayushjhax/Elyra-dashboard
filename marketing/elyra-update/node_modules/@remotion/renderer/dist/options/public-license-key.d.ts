export declare const publicLicenseKeyOption: {
    name: string;
    addedIn: string;
    cliFlag: "public-license-key";
    description: () => import("react").JSX.Element;
    ssrName: 'publicLicenseKey';
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string | null;
    };
    setConfig: (value: string | null) => void;
    type: string | null;
    id: "public-license-key";
};
