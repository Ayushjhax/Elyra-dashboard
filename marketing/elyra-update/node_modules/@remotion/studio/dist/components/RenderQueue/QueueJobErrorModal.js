"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJobErrorModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const CopyStackTrace_1 = require("../../error-overlay/remotion-overlay/CopyStackTrace");
const colors_1 = require("../../helpers/colors");
const modals_1 = require("../../state/modals");
const Button_1 = require("../Button");
const layout_1 = require("../layout");
const is_menu_item_1 = require("../Menu/is-menu-item");
const ModalContainer_1 = require("../ModalContainer");
const ModalHeader_1 = require("../ModalHeader");
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
const description = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
    marginBottom: 12,
    marginTop: 16,
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
const QueueJobErrorModal = ({ title, error }) => {
    var _a;
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const onClose = (0, react_1.useCallback)(() => {
        setSelectedModal(null);
    }, [setSelectedModal]);
    const errorDetails = ((_a = error.stack) === null || _a === void 0 ? void 0 : _a.split('\n')[0].includes(error.message))
        ? error.stack
        : [error.message, error.stack].filter(Boolean).join('\n');
    return ((0, jsx_runtime_1.jsxs)(ModalContainer_1.ModalContainer, { ariaLabel: title, onOutsideClick: onClose, onEscape: onClose, children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: title }), (0, jsx_runtime_1.jsxs)("div", { style: container, children: [(0, jsx_runtime_1.jsx)("p", { style: description, children: "The job failed because of the following error:" }), (0, jsx_runtime_1.jsx)("div", { className: is_menu_item_1.HORIZONTAL_SCROLLBAR_CLASSNAME, style: codeBlock, children: errorDetails }), (0, jsx_runtime_1.jsx)("div", { style: spacer }), (0, jsx_runtime_1.jsxs)("div", { style: buttonRow, children: [(0, jsx_runtime_1.jsx)(CopyStackTrace_1.CopyStackTrace, { errorText: errorDetails }), (0, jsx_runtime_1.jsx)(layout_1.Flex, {}), (0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: onClose, children: "Close" })] })] })] }));
};
exports.QueueJobErrorModal = QueueJobErrorModal;
