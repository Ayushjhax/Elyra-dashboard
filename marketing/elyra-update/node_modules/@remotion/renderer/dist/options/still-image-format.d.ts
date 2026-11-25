import type { StillImageFormat } from '../image-format';
export declare const stillImageFormatOption: {
    name: string;
    addedIn: string;
    cliFlag: "image-format";
    description: () => import("react").JSX.Element;
    ssrName: 'imageFormat';
    docLink: string;
    type: StillImageFormat | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: "jpeg" | "pdf" | "png" | "webp";
    } | {
        source: string;
        value: null;
    };
    setConfig: (value: "jpeg" | "pdf" | "png" | "webp" | null) => void;
    id: string;
};
