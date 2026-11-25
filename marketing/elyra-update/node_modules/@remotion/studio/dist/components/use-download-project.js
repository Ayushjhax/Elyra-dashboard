"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDownloadProject = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const colors_1 = require("../helpers/colors");
const download_blob_1 = require("../helpers/download-blob");
const ConfirmationDialog_1 = require("./ConfirmationDialog");
const LicenseExplanation_1 = require("./LicenseExplanation");
const NotificationCenter_1 = require("./Notifications/NotificationCenter");
const downloadLicenseAgreement = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 0,
    marginTop: 20,
};
const downloadLicenseLink = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: '21px',
};
const useDownloadProject = () => {
    var _a;
    var _b;
    const downloadProject = (_b = (_a = (0, browser_studio_operations_1.getBrowserStudioOperations)()) === null || _a === void 0 ? void 0 : _a.downloadProject) !== null && _b !== void 0 ? _b : null;
    const confirm = (0, ConfirmationDialog_1.useConfirmationDialog)();
    const onDownloadProject = (0, react_1.useCallback)(async () => {
        if (downloadProject === null) {
            return;
        }
        const accepted = await confirm({
            title: 'Download project',
            message: ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(LicenseExplanation_1.LicenseExplanation, {}), (0, jsx_runtime_1.jsxs)("p", { style: downloadLicenseAgreement, children: ["By downloading this project, you agree to comply with the", ' ', (0, jsx_runtime_1.jsx)("a", { href: "https://remotion.dev/license", rel: "noopener noreferrer", style: downloadLicenseLink, target: "_blank", children: "license" }), "."] })] })),
            confirmLabel: 'Accept and download',
            cancelLabel: 'Cancel',
        });
        if (!accepted) {
            return;
        }
        try {
            const { data, fileName } = await downloadProject();
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            (0, download_blob_1.downloadBlob)(new Blob([arrayBuffer], { type: 'application/zip' }), fileName);
        }
        catch (error) {
            (0, NotificationCenter_1.showNotification)(`Could not download project: ${error instanceof Error ? error.message : String(error)}`, 2000);
        }
    }, [confirm, downloadProject]);
    return downloadProject === null ? null : onDownloadProject;
};
exports.useDownloadProject = useDownloadProject;
