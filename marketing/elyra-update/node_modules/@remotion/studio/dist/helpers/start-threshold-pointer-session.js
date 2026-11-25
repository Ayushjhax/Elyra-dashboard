"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startThresholdPointerSession = void 0;
const escape_cancelable_pointer_session_1 = require("./escape-cancelable-pointer-session");
const pointer_session_1 = require("./pointer-session");
const startThresholdPointerSession = ({ event, captureTarget, minimumMovement, onStart, onCancel, }) => {
    let handlers = minimumMovement === null ? onStart() : null;
    const movedEnough = (move) => Math.abs(move.clientX - event.clientX) >= (minimumMovement !== null && minimumMovement !== void 0 ? minimumMovement : 0);
    return (0, escape_cancelable_pointer_session_1.startEscapeCancelableCapturedPointerSession)({
        event,
        captureTarget,
        onMove: (move) => {
            if (!handlers && movedEnough(move))
                handlers = onStart();
            handlers === null || handlers === void 0 ? void 0 : handlers.onMove(move);
        },
        onEnd: (reason, endEvent) => {
            if (!handlers &&
                (0, pointer_session_1.isPointerSessionRelease)(reason, endEvent) &&
                movedEnough(endEvent)) {
                handlers = onStart();
            }
            if (handlers)
                handlers.onEnd(reason, endEvent);
            else
                onCancel();
        },
    });
};
exports.startThresholdPointerSession = startThresholdPointerSession;
