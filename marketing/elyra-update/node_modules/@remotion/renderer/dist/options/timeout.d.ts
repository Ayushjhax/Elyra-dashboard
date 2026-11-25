export declare const delayRenderTimeoutInMillisecondsOption: {
    name: string;
    addedIn: string;
    cliFlag: "timeout";
    description: () => import("react").JSX.Element;
    ssrName: 'timeoutInMilliseconds';
    docLink: string;
    type: number;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    };
    setConfig: (value: number) => void;
    id: "timeout";
};
