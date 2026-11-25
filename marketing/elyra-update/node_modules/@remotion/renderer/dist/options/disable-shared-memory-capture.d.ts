export declare const disableSharedMemoryCaptureOption: {
    name: string;
    addedIn: string;
    cliFlag: "disable-shared-memory-capture";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    setConfig(value: boolean): void;
    id: "disable-shared-memory-capture";
};
