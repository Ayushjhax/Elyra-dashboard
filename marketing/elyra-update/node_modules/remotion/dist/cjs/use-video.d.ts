import type { ComponentType, LazyExoticComponent } from 'react';
import React from 'react';
import type { VideoConfig } from './video-config.js';
type VideoContextValue = (VideoConfig & {
    component: LazyExoticComponent<ComponentType<Record<string, unknown>>> | ComponentType<Record<string, unknown>>;
}) | null;
export declare const VideoContext: React.Context<VideoContextValue>;
export declare const VideoProvider: React.FC<{
    readonly children: React.ReactNode;
}>;
export declare const useVideo: () => VideoContextValue;
export {};
