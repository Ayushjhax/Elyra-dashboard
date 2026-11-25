"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModalsProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const modals_1 = require("../state/modals");
const BrowserStudioExperimentingNotice_1 = require("./BrowserStudioExperimentingNotice");
const ModalsProvider = ({ children }) => {
    const [selectedModal, setSelectedModal] = (0, react_1.useState)(() => {
        if ((0, browser_studio_operations_1.getBrowserStudioOperations)() === null ||
            !window.remotion_showBrowserStudioExperimentalNotice) {
            return null;
        }
        try {
            if (window.localStorage.getItem(BrowserStudioExperimentingNotice_1.experimentalNoticeStorageKey) === 'true') {
                return null;
            }
        }
        catch (_a) {
            // Show the notice even when browser storage is unavailable.
        }
        return { type: 'browser-studio-experimental-notice' };
    });
    const setSelectedModalContext = (0, react_1.useMemo)(() => {
        return {
            setSelectedModal,
        };
    }, []);
    return ((0, jsx_runtime_1.jsx)(modals_1.SetSelectedModalContext.Provider, { value: setSelectedModalContext, children: (0, jsx_runtime_1.jsx)(modals_1.SelectedModalContext.Provider, { value: selectedModal, children: children }) }));
};
exports.ModalsProvider = ModalsProvider;
