"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequenceAnnotationMetadata = void 0;
const format_file_location_1 = require("./format-file-location");
const getSequenceAnnotationMetadata = ({ sequence, location, }) => {
    var _a;
    const metadata = {
        layer: (sequence.displayName ||
            ((_a = sequence.controls) === null || _a === void 0 ? void 0 : _a.componentName) ||
            'Layer').slice(0, 128),
        ...(Number.isFinite(sequence.from) ? { from: sequence.from } : {}),
        ...(Number.isFinite(sequence.duration)
            ? { duration: sequence.duration }
            : {}),
    };
    const relativeLocation = (0, format_file_location_1.getRelativeFileLocation)({
        location,
        root: window.remotion_cwd,
    });
    if (relativeLocation && relativeLocation.filename.length <= 256) {
        const withSource = {
            ...metadata,
            source: relativeLocation.filename,
            line: relativeLocation.line,
        };
        // The browser accepts at most six keys and 2,048 UTF-8 bytes. Omit
        // oversized source context instead of truncating the filename.
        if (new TextEncoder().encode(JSON.stringify(withSource)).length <= 2048) {
            return withSource;
        }
    }
    return metadata;
};
exports.getSequenceAnnotationMetadata = getSequenceAnnotationMetadata;
