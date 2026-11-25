export declare const enableMultiprocessOnLinuxOption: {
    name: string;
    addedIn: string;
    cliFlag: "enable-multiprocess-on-linux";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    id: "enable-multiprocess-on-linux";
};
