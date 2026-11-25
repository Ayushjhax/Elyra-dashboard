export type SfxDragData = {
    type: 'remotion-sfx';
    version: 1;
    sfx: {
        name: string;
        url: string;
    };
};
export declare const makeSfxDragData: ({ name, url, }: SfxDragData['sfx']) => SfxDragData;
export declare const parseSfxDragData: (value: string) => SfxDragData | null;
