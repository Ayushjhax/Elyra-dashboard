"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextFrameToRenderState = void 0;
const nextFrameToRenderState = ({ allFramesAndExtraFrames, }) => {
    const rendered = new Map();
    return {
        getNextFrame: () => {
            const nextFrame = allFramesAndExtraFrames.find((frame) => {
                return !rendered.has(frame);
            });
            if (nextFrame === undefined) {
                throw new Error('No more frames to render');
            }
            rendered.set(nextFrame, true);
            return nextFrame;
        },
        returnFrame: (frame) => {
            rendered.delete(frame);
        },
    };
};
exports.nextFrameToRenderState = nextFrameToRenderState;
