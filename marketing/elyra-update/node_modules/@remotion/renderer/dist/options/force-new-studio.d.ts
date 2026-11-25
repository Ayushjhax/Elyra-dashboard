export declare const forceNewStudioOption: {
    name: string;
    addedIn: string;
    cliFlag: "force-new";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    setConfig(value: boolean): void;
    id: "force-new";
};
