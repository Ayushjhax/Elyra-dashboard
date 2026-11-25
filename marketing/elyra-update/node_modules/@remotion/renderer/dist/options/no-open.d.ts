export declare const noOpenOption: {
    name: string;
    addedIn: string;
    cliFlag: "no-open";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: true;
        source: string;
    } | {
        value: false;
        source: string;
    };
    setConfig: (shouldOpen: boolean) => void;
    reset: () => void;
    id: "no-open";
};
