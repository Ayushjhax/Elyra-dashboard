type OnDuration = (src: string, durationInSeconds: number) => void;
export declare const useMediaDuration: (mediaRef: React.RefObject<HTMLMediaElement | null>, onDuration: OnDuration, src: string, useCurrentSrc: boolean) => void;
export declare const scheduleMediaSourceCleanup: (cleanup: (() => void) | null) => void;
export {};
