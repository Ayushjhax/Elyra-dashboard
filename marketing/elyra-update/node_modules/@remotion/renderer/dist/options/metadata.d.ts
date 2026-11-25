export type Metadata = Record<string, string>;
export declare const metadataOption: {
    name: string;
    addedIn: string;
    cliFlag: "metadata";
    description: (mode: "cli" | "ssr") => import("react").JSX.Element;
    docLink: string;
    type: Metadata;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: {
            [k: string]: string;
        };
    };
    setConfig: (newMetadata: Metadata) => void;
    ssrName: string;
    id: "metadata";
};
