export declare const ignoreCertificateErrorsOption: {
    name: string;
    addedIn: string;
    cliFlag: "ignore-certificate-errors";
    description: () => import("react").JSX.Element;
    ssrName: 'ignoreCertificateErrors';
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    id: "ignore-certificate-errors";
};
