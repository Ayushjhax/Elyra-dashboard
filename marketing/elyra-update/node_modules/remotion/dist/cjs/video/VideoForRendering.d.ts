import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { OnVideoFrame, RemotionVideoProps } from './props';
type VideoForRenderingProps = Omit<RemotionVideoProps, 'onVideoFrame'> & {
    readonly onDuration: (src: string, durationInSeconds: number) => void;
    readonly onVideoFrame: null | OnVideoFrame;
};
export declare const VideoForRendering: ForwardRefExoticComponent<VideoForRenderingProps & RefAttributes<HTMLVideoElement>>;
export {};
