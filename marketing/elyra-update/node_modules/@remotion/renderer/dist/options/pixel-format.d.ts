import type { PixelFormat } from '../pixel-format';
export declare const pixelFormatOption: {
    name: string;
    addedIn: string;
    cliFlag: "pixel-format";
    description: () => import("react").JSX.Element;
    ssrName: 'pixelFormat';
    docLink: string;
    type: PixelFormat;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, options?: {
        uiPixelFormat: PixelFormat | null;
        compositionDefaultPixelFormat: PixelFormat | null;
    }) => {
        source: string;
        value: "yuv420p" | "yuv420p10le" | "yuv422p" | "yuv422p10le" | "yuv444p" | "yuv444p10le" | "yuva420p" | "yuva444p10le";
    };
    setConfig: (value: "yuv420p" | "yuv420p10le" | "yuv422p" | "yuv422p10le" | "yuv444p" | "yuv444p10le" | "yuva420p" | "yuva444p10le") => void;
    id: "pixel-format";
};
