export declare const TARGET_NUMBER_OF_CHANNELS = 2;
export declare const getTargetSampleRate: () => number;
export declare const resampleAudioData: ({ srcNumberOfChannels, sourceChannels, destination, targetFrames, chunkSize, }: {
    srcNumberOfChannels: number;
    sourceChannels: Int16Array;
    destination: Int16Array;
    targetFrames: number;
    chunkSize: number;
}) => void;
