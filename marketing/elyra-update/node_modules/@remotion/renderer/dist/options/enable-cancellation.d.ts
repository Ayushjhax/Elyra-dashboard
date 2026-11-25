export declare const enableCancellationOption: {
    name: string;
    addedIn: string;
    cliFlag: "enable-cancellation";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: boolean;
    setConfig: (value: boolean) => void;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    id: "enable-cancellation";
};
