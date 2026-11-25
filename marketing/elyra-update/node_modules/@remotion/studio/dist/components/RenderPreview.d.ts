import React from 'react';
import type { AssetMetadata } from '../helpers/get-asset-metadata';
import type { RenderOutputPlaybackContent } from '../helpers/render-output-playback';
export declare const RenderPreview: React.FC<{
    readonly path: string;
    readonly assetMetadata: AssetMetadata | null;
    readonly getBlob?: () => Promise<Blob>;
    readonly outputPlaybackContent: RenderOutputPlaybackContent;
}>;
