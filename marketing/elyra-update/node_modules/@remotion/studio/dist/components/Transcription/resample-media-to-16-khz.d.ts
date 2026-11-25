export declare const resampleMediaTo16Khz: ({ src, audioStreamIndex, requestInit, onProgress, signal, }: {
    readonly src: string;
    readonly audioStreamIndex: number | null;
    readonly requestInit: Omit<RequestInit, 'signal'> | null;
    readonly onProgress: (progress: number) => void;
    readonly signal: AbortSignal;
}) => Promise<Float32Array>;
