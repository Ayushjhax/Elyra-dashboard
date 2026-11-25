"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorRecord = void 0;
exports.listenToRuntimeErrors = listenToRuntimeErrors;
const url_state_1 = require("../../helpers/url-state");
const error_origin_1 = require("../error-origin");
const runtime_error_store_1 = require("../runtime-error-store");
const format_warning_1 = require("./effects/format-warning");
const proxy_console_1 = require("./effects/proxy-console");
const stack_trace_limit_1 = require("./effects/stack-trace-limit");
const unhandled_error_1 = require("./effects/unhandled-error");
const unhandled_rejection_1 = require("./effects/unhandled-rejection");
const get_stack_frames_1 = require("./utils/get-stack-frames");
const CONTEXT_SIZE = 3;
const getErrorRecord = async (error) => {
    const stackFrames = await (0, get_stack_frames_1.getStackFrames)(error, CONTEXT_SIZE);
    if (stackFrames === null || stackFrames === undefined) {
        return null;
    }
    return {
        error,
        contextSize: CONTEXT_SIZE,
        stackFrames,
    };
};
exports.getErrorRecord = getErrorRecord;
const handleRuntimeError = (error) => {
    const didHookOrderChange = error.message.startsWith('Rendered fewer hooks') ||
        error.message.startsWith('Rendered more hooks') ||
        error.message.startsWith('Should have a queue');
    const key = 'remotion.lastCrashBecauseOfHooks';
    const previousCrashWasBecauseOfHooks = window.localStorage.getItem(key);
    // When rendering conditional hooks, refreshing does not help.
    // So we only refresh once.
    const justRefreshedBecauseOfHooks = previousCrashWasBecauseOfHooks
        ? Date.now() - Number(previousCrashWasBecauseOfHooks) < 5000
        : false;
    window.localStorage.setItem('remotion.lastCrashBecauseOfHooks', String(Date.now()));
    if (didHookOrderChange && !justRefreshedBecauseOfHooks) {
        // eslint-disable-next-line no-console
        console.log('Hook order changed. Reloading app...');
        (0, url_state_1.reloadUrl)();
    }
    else {
        (0, runtime_error_store_1.addErrorToOverlay)(error, null);
    }
};
function listenToRuntimeErrors() {
    (0, unhandled_error_1.register)(window, (error) => {
        return handleRuntimeError(error);
    });
    (0, unhandled_rejection_1.register)(window, (error) => {
        return handleRuntimeError(error);
    });
    (0, stack_trace_limit_1.register)();
    (0, proxy_console_1.registerReactStack)();
    (0, proxy_console_1.permanentRegister)('error', (d) => {
        if (d.type === 'webpack-error') {
            const { message, frames } = d;
            const data = (0, format_warning_1.massageWarning)(message, frames);
            const error = {
                message: data.message,
                stack: data.stack,
                name: '',
            };
            (0, error_origin_1.markErrorAsLoggedByServer)(error);
            handleRuntimeError(error);
        }
        if (d.type === 'build-error') {
            (0, error_origin_1.markErrorAsLoggedByServer)(d.error);
            handleRuntimeError(d.error);
        }
    });
    return function () {
        (0, stack_trace_limit_1.unregister)();
        (0, unhandled_rejection_1.unregister)(window);
        (0, unhandled_error_1.unregister)(window);
        (0, proxy_console_1.unregisterReactStack)();
    };
}
