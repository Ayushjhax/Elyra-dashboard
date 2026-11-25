import type { BrowserMediaControlsBehavior } from './browser-mediasession.js';
import { type UsePlayerMethods } from './use-player-methods.js';
export declare const usePlayback: ({ loop, playbackRate, moveToBeginningWhenEnded, inFrame, outFrame, browserMediaControlsBehavior, getCurrentFrame, muted, }: {
    loop: boolean;
    playbackRate: number;
    moveToBeginningWhenEnded: boolean;
    inFrame: number | null;
    outFrame: number | null;
    browserMediaControlsBehavior: BrowserMediaControlsBehavior;
    getCurrentFrame: UsePlayerMethods['getCurrentFrame'];
    muted: boolean;
}) => void;
