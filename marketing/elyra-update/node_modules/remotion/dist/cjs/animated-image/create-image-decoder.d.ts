export declare const createImageDecoder: ({ resolvedSrc, signal, requestInit, contentType, }: {
    resolvedSrc: string;
    signal: AbortSignal;
    requestInit?: RequestInit;
    contentType: string | null;
}) => Promise<{
    decoder: ImageDecoder;
    selectedTrack: ImageTrack;
}>;
