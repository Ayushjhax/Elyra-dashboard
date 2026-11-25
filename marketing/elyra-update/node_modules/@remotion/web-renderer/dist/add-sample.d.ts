import type { AudioSampleSource, VideoSampleSource } from 'mediabunny';
export declare const addVideoSampleAndCloseFrame: (frameToEncode: VideoFrame, videoSampleSource: VideoSampleSource, durationInSeconds: number) => Promise<void>;
export declare const addAudioSample: (audio: AudioData, audioSampleSource: AudioSampleSource) => Promise<void>;
