export declare const nextFrameToRenderState: ({ allFramesAndExtraFrames, }: {
    allFramesAndExtraFrames: number[];
}) => {
    getNextFrame: () => number;
    returnFrame: (frame: number) => void;
};
export type NextFrameToRender = ReturnType<typeof nextFrameToRenderState>;
