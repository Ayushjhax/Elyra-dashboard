export declare const getMediaCacheSizeInBytes: () => number | null;
export declare const mediaCacheSizeInBytesOption: {
    name: string;
    addedIn: string;
    cliFlag: "media-cache-size-in-bytes";
    description: () => import("react").JSX.Element;
    ssrName: 'mediaCacheSizeInBytes';
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    } | {
        source: string;
        value: null;
    };
    setConfig: (size: number | null) => void;
    id: "media-cache-size-in-bytes";
};
