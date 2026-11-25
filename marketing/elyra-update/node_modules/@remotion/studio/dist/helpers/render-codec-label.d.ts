import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';
export declare const renderHumanReadableAudioCodec: (codec: InputAudioTrack['codec'] | null) => string;
export declare const renderHumanReadableVideoCodec: (codec: InputVideoTrack['codec'] | null) => string;
