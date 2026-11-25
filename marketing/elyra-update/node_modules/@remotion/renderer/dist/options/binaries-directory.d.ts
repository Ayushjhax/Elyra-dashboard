export declare const binariesDirectoryOption: {
    name: string;
    addedIn: string;
    cliFlag: "binaries-directory";
    description: () => import("react").JSX.Element;
    ssrName: 'binariesDirectory';
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: string | null;
    };
    setConfig: (value: string | null) => void;
    id: "binaries-directory";
};
