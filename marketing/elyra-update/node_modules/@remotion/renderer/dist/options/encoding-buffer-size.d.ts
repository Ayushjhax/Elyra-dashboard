declare const setEncodingBufferSize: (bitrate: string | null) => void;
export declare const encodingBufferSizeOption: {
    name: string;
    addedIn: string;
    cliFlag: "buffer-size";
    description: () => import("react").JSX.Element;
    ssrName: 'encodingBufferSize';
    docLink: string;
    type: string | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: string;
        source: string;
    } | {
        value: null;
        source: string;
    };
    setConfig: typeof setEncodingBufferSize;
    id: "buffer-size";
};
export {};
