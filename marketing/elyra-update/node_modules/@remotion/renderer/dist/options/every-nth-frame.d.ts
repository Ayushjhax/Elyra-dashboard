export declare const everyNthFrameOption: {
    name: string;
    addedIn: string;
    cliFlag: "every-nth-frame";
    description: () => import("react").JSX.Element;
    ssrName: 'everyNthFrame';
    docLink: string;
    type: number;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    };
    setConfig: (value: number) => void;
    id: "every-nth-frame";
};
