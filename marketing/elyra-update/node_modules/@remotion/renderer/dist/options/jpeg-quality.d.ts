export declare const setJpegQuality: (q: number | undefined) => void;
export declare const getJpegQuality: () => number;
export declare const jpegQualityOption: {
    name: string;
    addedIn: string;
    cliFlag: "jpeg-quality";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: number;
    setConfig: typeof setJpegQuality;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    };
    id: "jpeg-quality";
};
