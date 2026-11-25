export declare const webpackPollOption: {
    name: string;
    addedIn: string;
    cliFlag: "webpack-poll";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    } | {
        source: string;
        value: null;
    };
    setConfig: (value: number | null) => void;
    type: number | null;
    id: "webpack-poll";
};
