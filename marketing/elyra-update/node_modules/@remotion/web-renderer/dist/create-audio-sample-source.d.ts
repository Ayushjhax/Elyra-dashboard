import { AudioSampleSource, type AudioCodec, type Quality } from 'mediabunny';
export declare const createAudioSampleSource: ({ muted, codec, bitrate, }: {
    muted: boolean;
    codec: AudioCodec | null;
    bitrate: number | Quality;
}) => {
    audioSampleSource: AudioSampleSource;
    [Symbol.dispose]: () => void;
} | null;
