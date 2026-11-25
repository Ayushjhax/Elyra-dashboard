export declare const folderExpiryOption: {
    name: string;
    addedIn: string;
    cliFlag: "enable-folder-expiry";
    description: () => import("react").JSX.Element;
    ssrName: 'enableFolderExpiry';
    docLink: string;
    type: boolean | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean | null;
    };
    setConfig: (value: boolean | null) => void;
    id: "enable-folder-expiry";
};
