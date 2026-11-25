import type { Codec, CodecOrUndefined } from '../codec';
declare const setCodec: (newCodec: CodecOrUndefined) => void;
export declare const getOutputCodecOrUndefined: () => CodecOrUndefined;
export declare const videoCodecOption: {
    name: string;
    addedIn: string;
    cliFlag: "codec";
    description: () => import("react").JSX.Element;
    ssrName: string;
    docLink: string;
    type: Codec;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, { compositionCodec, configFile, downloadName, outName, uiCodec, }: {
        outName: string | null;
        downloadName: string | null;
        configFile: Codec | null;
        uiCodec: Codec | null;
        compositionCodec: Codec | null;
    }) => {
        value: Codec;
        source: string;
    };
    setConfig: typeof setCodec;
    reset: () => void;
    id: "codec";
};
export {};
