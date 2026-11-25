export declare const makeSharedElementSourceNode: ({ audioContext, ref, }: {
    audioContext: AudioContext | null;
    ref: React.RefObject<HTMLAudioElement | null>;
}) => {
    setAudioContext: (newAudioContext: AudioContext | null) => void;
    attemptToConnect: () => void;
    get: () => MediaElementAudioSourceNode;
    cleanup: () => void;
};
export type SharedElementSourceNode = ReturnType<typeof makeSharedElementSourceNode>;
