import type { AudioIteratorManager } from '../audio-iterator-manager';
import type { VideoIteratorManager } from '../video-iterator-manager';
export declare const drawPreviewOverlay: ({ context, audioTime, audioContextState, audioSyncAnchor, playing, audioIteratorManager, videoIteratorManager, playbackRate, }: {
    context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    audioTime: number | null;
    audioContextState: AudioContextState | null;
    audioSyncAnchor: {
        value: number;
    } | null;
    playing: boolean;
    audioIteratorManager: AudioIteratorManager | null;
    videoIteratorManager: VideoIteratorManager | null;
    playbackRate: number;
}) => void;
