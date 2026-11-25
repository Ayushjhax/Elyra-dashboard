import { codecSupportsMedia } from './codec-supports-media';
import { getFramesToRender } from './get-duration-from-frame-range';
import { getFileExtensionFromCodec } from './get-extension-from-codec';
import { getExtensionOfFilename } from './get-extension-of-filename';
import { isAudioCodec } from './is-audio-codec';
import { validateOutputFilename } from './validate-output-filename';
export declare const NoReactAPIs: {
    getExtensionOfFilename: typeof getExtensionOfFilename;
    getFileExtensionFromCodec: typeof getFileExtensionFromCodec;
    validateOutputFilename: typeof validateOutputFilename;
    getFramesToRender: typeof getFramesToRender;
    codecSupportsMedia: typeof codecSupportsMedia;
    isAudioCodec: typeof isAudioCodec;
};
