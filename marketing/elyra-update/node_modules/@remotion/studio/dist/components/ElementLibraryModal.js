"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElementLibraryModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const gear_1 = require("../icons/gear");
const modals_1 = require("../state/modals");
const ActionTooltip_1 = require("./ActionTooltip");
const ElementInstallConfirmation_1 = require("./ElementInstallConfirmation");
const ElementLibraryFrame_1 = require("./ElementLibraryFrame");
const InlineAction_1 = require("./InlineAction");
const ModalContainer_1 = require("./ModalContainer");
const ModalHeader_1 = require("./ModalHeader");
const DismissableModal_1 = require("./NewComposition/DismissableModal");
const panelStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: (0, ModalContainer_1.getMaxModalHeight)(1000),
    overflow: 'hidden',
    width: (0, ModalContainer_1.getMaxModalWidth)(1400),
};
const ElementLibraryModal = ({ name, url, installState }) => {
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const openElementSettings = (0, react_1.useCallback)(() => {
        var _a;
        var _b;
        setSelectedModal({
            type: 'settings',
            initialStudioPane: 'elements',
            initialTab: 'studio',
            initialPublicLicenseKey: (_b = (_a = window.remotion_renderDefaults) === null || _a === void 0 ? void 0 : _a.publicLicenseKey) !== null && _b !== void 0 ? _b : null,
        });
    }, [setSelectedModal]);
    const renderGearIcon = (0, react_1.useCallback)((color) => {
        return (0, jsx_runtime_1.jsx)(gear_1.GearIcon, { color: color, height: 16, width: 16 });
    }, []);
    return ((0, jsx_runtime_1.jsxs)(DismissableModal_1.DismissableModal, { panelStyle: panelStyle, children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: name, rightAction: (0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: "Configure Elements", shortcut: null, delay: 800, dismissOnClick: true, children: (0, jsx_runtime_1.jsx)(InlineAction_1.InlineAction, { "aria-label": "Configure Element Libraries", onClick: openElementSettings, renderAction: renderGearIcon, variant: "modal-header" }) }) }), (0, jsx_runtime_1.jsx)(ElementLibraryFrame_1.ElementLibraryFrame, { name: name, url: url, context: null, captionStyleSelection: null }), installState === null ? null : ((0, jsx_runtime_1.jsx)(ElementInstallConfirmation_1.ElementInstallConfirmation, { state: installState }))] }));
};
exports.ElementLibraryModal = ElementLibraryModal;
