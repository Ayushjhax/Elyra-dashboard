"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderQueueRepeatItem = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../../helpers/colors");
const modals_1 = require("../../state/modals");
const ActionTooltip_1 = require("../ActionTooltip");
const InlineAction_1 = require("../InlineAction");
const render_retry_1 = require("./render-retry");
const RenderQueueRepeatItem = ({ job }) => {
    var _a;
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const { getRetryState, openRenderJobSettings } = (0, render_retry_1.useRenderJobRetry)();
    const retryState = job.type === 'caption' || job.type === 'video-matting'
        ? { canRetry: true, reason: null }
        : getRetryState(job.id);
    const onClick = (0, react_1.useCallback)((e) => {
        e.stopPropagation();
        if (job.type === 'caption') {
            setSelectedModal({
                type: 'transcribe',
                captionStyle: job.captionStyle,
                src: job.src,
                displayName: job.displayName,
                audioStreamIndex: job.audioStreamIndex,
                requestInit: job.requestInit,
                target: job.target,
            });
        }
        else if (job.type === 'video-matting') {
            setSelectedModal({
                type: 'video-matting',
                src: job.src,
                displayName: job.displayName,
                target: job.target,
            });
        }
        else {
            openRenderJobSettings(job.id);
        }
    }, [job, openRenderJobSettings, setSelectedModal]);
    const icon = (0, react_1.useMemo)(() => {
        return {
            height: 12,
            color: colors_1.CURRENT_COLOR,
        };
    }, []);
    const renderAction = (0, react_1.useCallback)((color) => {
        return ((0, jsx_runtime_1.jsx)("svg", { style: icon, viewBox: "0 0 512 512", children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M386.3 160H336c-17.7 0-32 14.3-32 32s14.3 32 32 32H464c17.7 0 32-14.3 32-32V64c0-17.7-14.3-32-32-32s-32 14.3-32 32v51.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0s-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3s163.8-62.5 226.3 0L386.3 160z" }) }));
    }, [icon]);
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: (_a = retryState.reason) !== null && _a !== void 0 ? _a : 'Retry', shortcut: null, delay: 800, dismissOnClick: true, children: (0, jsx_runtime_1.jsx)(InlineAction_1.InlineAction, { "aria-label": "Retry", disabled: !retryState.canRetry, onClick: onClick, renderAction: renderAction, variant: null }) }));
};
exports.RenderQueueRepeatItem = RenderQueueRepeatItem;
