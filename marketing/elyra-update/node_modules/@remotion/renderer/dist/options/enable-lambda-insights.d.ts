export declare const enableLambdaInsights: {
    name: string;
    addedIn: string;
    cliFlag: "enable-lambda-insights";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: boolean;
    setConfig: (value: boolean) => void;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: boolean;
        source: string;
    };
    id: "enable-lambda-insights";
};
