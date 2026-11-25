"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJobError = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const modals_1 = require("../../state/modals");
const item_style_1 = require("./item-style");
const errorStyle = {
    ...item_style_1.renderQueueItemSubtitleStyle,
};
const QueueJobError = ({ error, modalTitle }) => {
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const onClick = (0, react_1.useCallback)((event) => {
        var _a;
        event.stopPropagation();
        setSelectedModal({
            type: 'queue-job-error',
            title: modalTitle,
            error: { message: error.message, stack: (_a = error.stack) !== null && _a !== void 0 ? _a : null },
        });
    }, [error, modalTitle, setSelectedModal]);
    return ((0, jsx_runtime_1.jsx)("button", { onClick: onClick, type: "button", style: errorStyle, "aria-label": error.message, children: error.message }));
};
exports.QueueJobError = QueueJobError;
