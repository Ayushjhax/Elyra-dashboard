"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderQueueCancelButton = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const client_id_1 = require("../../helpers/client-id");
const colors_1 = require("../../helpers/colors");
const ActionTooltip_1 = require("../ActionTooltip");
const InlineAction_1 = require("../InlineAction");
const context_1 = require("./context");
const use_is_render_job_cancelling_1 = require("./use-is-render-job-cancelling");
const RenderQueueCancelButton = ({ job }) => {
    const { cancelClientJob } = (0, react_1.useContext)(context_1.RenderQueueContext);
    const { cancelJob, canCancelJob } = (0, react_1.useContext)(context_1.RenderQueueActionsContext);
    const { previewServerState } = (0, react_1.useContext)(client_id_1.StudioServerConnectionCtx);
    const cancelling = (0, use_is_render_job_cancelling_1.useIsRenderJobCancelling)(job.id);
    const isRender = job.type !== 'caption' && job.type !== 'video-matting';
    const isServerRender = isRender && job.type !== 'client-still' && job.type !== 'client-video';
    const disabled = isRender &&
        (cancelling ||
            !canCancelJob(job.id) ||
            (isServerRender && previewServerState.type !== 'connected'));
    const onClick = (0, react_1.useCallback)((e) => {
        e.stopPropagation();
        if (job.type === 'caption' || job.type === 'video-matting') {
            cancelClientJob(job.id);
            return;
        }
        cancelJob(job.id);
    }, [job, cancelClientJob, cancelJob]);
    const icon = (0, react_1.useMemo)(() => {
        return {
            height: 14,
            color: colors_1.CURRENT_COLOR,
        };
    }, []);
    const renderAction = (0, react_1.useCallback)((color) => {
        return ((0, jsx_runtime_1.jsx)("svg", { style: icon, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 512 512", children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM512 256c0 141.4-114.6 256-256 256S0 397.4 0 256S114.6 0 256 0S512 114.6 512 256z" }) }));
    }, [icon]);
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: cancelling ? 'Cancelling…' : 'Cancel', shortcut: null, delay: 800, dismissOnClick: true, children: (0, jsx_runtime_1.jsx)(InlineAction_1.InlineAction, { disabled: disabled, "aria-label": cancelling
                ? 'Cancelling render'
                : job.type === 'caption'
                    ? 'Cancel transcription'
                    : job.type === 'video-matting'
                        ? 'outName' in job
                            ? 'Cancel background removal'
                            : 'Cancel video matting'
                        : 'Cancel render', renderAction: renderAction, onClick: onClick, variant: null }) }));
};
exports.RenderQueueCancelButton = RenderQueueCancelButton;
