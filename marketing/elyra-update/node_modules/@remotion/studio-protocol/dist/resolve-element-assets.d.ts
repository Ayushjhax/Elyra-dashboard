import { type ElementAsset } from './element-drag-data';
export declare const resolveElementAssets: ({ assets, downloadAsset, }: {
    assets: readonly ElementAsset[];
    downloadAsset: (options: {
        url: URL;
        maxSize: number;
    }) => Promise<Uint8Array>;
}) => Promise<{
    path: string;
    contents: Uint8Array;
}[]>;
