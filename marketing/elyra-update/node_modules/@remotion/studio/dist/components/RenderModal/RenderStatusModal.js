"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderStatusModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const client_id_1 = require("../../helpers/client-id");
const colors_1 = require("../../helpers/colors");
const modals_1 = require("../../state/modals");
const ActionTooltip_1 = require("../ActionTooltip");
const Button_1 = require("../Button");
const layout_1 = require("../layout");
const is_menu_item_1 = require("../Menu/is-menu-item");
const ModalContainer_1 = require("../ModalContainer");
const ModalHeader_1 = require("../ModalHeader");
const NotificationCenter_1 = require("../Notifications/NotificationCenter");
const actions_1 = require("../RenderQueue/actions");
const context_1 = require("../RenderQueue/context");
const render_retry_1 = require("../RenderQueue/render-retry");
const use_is_render_job_cancelling_1 = require("../RenderQueue/use-is-render-job-cancelling");
const ClientRenderProgress_1 = require("./ClientRenderProgress");
const GuiRenderStatus_1 = require("./GuiRenderStatus");
const container = {
    padding: 20,
    maxWidth: 900,
    paddingTop: 0,
};
const codeBlock = {
    backgroundColor: colors_1.RENDER_STATUS_BACKGROUND,
    whiteSpace: 'pre',
    padding: 12,
    borderRadius: 4,
    fontFamily: 'monospace',
    overflow: 'auto',
    maxHeight: 300,
};
const spacer = {
    height: layout_1.SPACING_UNIT,
    width: layout_1.SPACING_UNIT,
};
const buttonRow = {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
};
const RenderStatusModal = ({ jobId, }) => {
    var _a;
    var _b;
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const { jobs, removeClientJob } = (0, react_1.useContext)(context_1.RenderQueueContext);
    const { cancelJob, canCancelJob } = (0, react_1.useContext)(context_1.RenderQueueActionsContext);
    const { previewServerState } = (0, react_1.useContext)(client_id_1.StudioServerConnectionCtx);
    const cancelling = (0, use_is_render_job_cancelling_1.useIsRenderJobCancelling)(jobId);
    const { getRetryState, openRenderJobSettings } = (0, render_retry_1.useRenderJobRetry)();
    const retryState = getRetryState(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
        throw new Error('job not found');
    }
    const isClientJob = (0, context_1.isClientRenderJob)(job);
    const onQuit = (0, react_1.useCallback)(() => {
        setSelectedModal(null);
    }, [setSelectedModal]);
    const onRetry = (0, react_1.useCallback)(() => {
        openRenderJobSettings(jobId);
    }, [jobId, openRenderJobSettings]);
    const onClickOnRemove = (0, react_1.useCallback)(() => {
        setSelectedModal(null);
        if (isClientJob) {
            removeClientJob(job.id);
        }
        else {
            (0, actions_1.removeRenderJob)(job).catch((err) => {
                (0, NotificationCenter_1.showNotification)(`Could not remove job: ${err.message}`, 2000);
            });
        }
    }, [job, isClientJob, removeClientJob, setSelectedModal]);
    const onClickOnCancel = (0, react_1.useCallback)(() => {
        cancelJob(jobId);
    }, [cancelJob, jobId]);
    const errorDetails = job.status === 'failed'
        ? ((_a = job.error.stack) === null || _a === void 0 ? void 0 : _a.split('\n')[0].includes(job.error.message))
            ? job.error.stack
            : [job.error.message, job.error.stack].filter(Boolean).join('\n')
        : null;
    return ((0, jsx_runtime_1.jsxs)(ModalContainer_1.ModalContainer, { onOutsideClick: onQuit, onEscape: onQuit, children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: `Render ${job.compositionId}` }), (0, jsx_runtime_1.jsxs)("div", { style: container, children: [job.status === 'cancelled' ? ((0, jsx_runtime_1.jsx)("p", { role: "status", style: { fontSize: 14 }, children: "Render cancelled." })) : job.status === 'idle' ? ((0, jsx_runtime_1.jsx)("p", { role: "status", style: { fontSize: 14 }, children: "Queued for rendering." })) : null, job.status === 'failed' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("p", { children: "The render failed because of the following error:" }), (0, jsx_runtime_1.jsx)("div", { className: is_menu_item_1.HORIZONTAL_SCROLLBAR_CLASSNAME, style: codeBlock, children: errorDetails })] })) : null, (job.status === 'done' || job.status === 'running') &&
                        (isClientJob ? ((0, jsx_runtime_1.jsx)(ClientRenderProgress_1.ClientRenderProgress, { job: job })) : ((0, jsx_runtime_1.jsx)(GuiRenderStatus_1.GuiRenderStatus, { job: job }))), (0, jsx_runtime_1.jsx)("div", { style: spacer }), (0, jsx_runtime_1.jsxs)("div", { style: buttonRow, children: [job.status === 'running' || job.status === 'idle' ? ((0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: onClickOnCancel, disabled: cancelling ||
                                    !canCancelJob(jobId) ||
                                    (!isClientJob && previewServerState.type !== 'connected'), children: cancelling ? 'Cancelling…' : 'Cancel render' })) : ((0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: onClickOnRemove, children: "Remove render" })), (0, jsx_runtime_1.jsx)(layout_1.Flex, {}), job.status === 'done' ||
                                job.status === 'failed' ||
                                job.status === 'cancelled' ? ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: (_b = retryState.reason) !== null && _b !== void 0 ? _b : 'Reopen render settings', shortcut: null, delay: 800, dismissOnClick: true, children: (0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: onRetry, disabled: !retryState.canRetry, children: "Retry" }) })) : null, (0, jsx_runtime_1.jsx)("div", { style: spacer }), (0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: onQuit, children: "Close" })] })] })] }));
};
exports.RenderStatusModal = RenderStatusModal;
