export declare const scaleOption: {
    name: string;
    addedIn: string;
    cliFlag: "scale";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: number;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    };
    setConfig: (scale: number) => void;
    id: "scale";
};
