export declare const allowHtmlInCanvasOption: {
    name: string;
    addedIn: string;
    cliFlag: "allow-html-in-canvas";
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
    id: "allow-html-in-canvas";
};
