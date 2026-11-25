import type { CodecOrUndefined } from '../codec';
import type { VideoImageFormat } from '../image-format';
export declare const videoImageFormatOption: {
    name: string;
    addedIn: string;
    cliFlag: "image-format";
    description: () => import("react").JSX.Element;
    ssrName: 'imageFormat';
    docLink: string;
    type: VideoImageFormat | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, options?: {
        codec: CodecOrUndefined;
        uiVideoImageFormat: VideoImageFormat | null;
        compositionDefaultVideoImageFormat: VideoImageFormat | null;
    }) => {
        source: string;
        value: "jpeg" | "none" | "png";
    } | {
        source: string;
        value: null;
    };
    setConfig: (value: "jpeg" | "none" | "png" | null) => void;
    id: string;
};
