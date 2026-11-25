export declare const stillFrameOption: {
    name: string;
    addedIn: string;
    cliFlag: "frame";
    description: () => import("react").JSX.Element;
    ssrName: 'frame';
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
    id: "frame";
};
