export declare const getMediaFileName: (src: string, displayName: string) => string;
export declare const getDefaultOutputBaseName: (src: string, displayName: string, fallbackName: string) => string;
export declare const validatePublicOutputName: ({ extension, outName, }: {
    extension: string;
    outName: string;
}) => string | null;
