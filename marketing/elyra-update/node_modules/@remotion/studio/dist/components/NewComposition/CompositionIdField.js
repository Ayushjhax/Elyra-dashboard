"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositionIdField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const layout_1 = require("../layout");
const layout_2 = require("../RenderModal/layout");
const InputAndValidationContainer_1 = require("./InputAndValidationContainer");
const RemInput_1 = require("./RemInput");
const SlugPreview_1 = require("./SlugPreview");
const ValidationMessage_1 = require("./ValidationMessage");
const CompositionIdField = ({ compositionId, inputRef, onChange, validationMessage, value }) => {
    return ((0, jsx_runtime_1.jsxs)("div", { style: layout_2.optionRow, children: [(0, jsx_runtime_1.jsx)("div", { style: layout_2.label, children: "ID" }), (0, jsx_runtime_1.jsx)("div", { style: layout_2.rightRow, children: (0, jsx_runtime_1.jsxs)(InputAndValidationContainer_1.InputAndValidationContainer, { children: [(0, jsx_runtime_1.jsx)(RemInput_1.RemotionInput, { ref: inputRef, value: value, onChange: onChange, type: "text", autoFocus: true, placeholder: "Composition ID", status: "ok", rightAlign: true }), (0, jsx_runtime_1.jsx)(SlugPreview_1.SlugPreview, { action: "create", currentName: null, input: value, slug: compositionId }), validationMessage ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(layout_1.Spacing, { y: 1, block: true }), (0, jsx_runtime_1.jsx)(ValidationMessage_1.ValidationMessage, { align: "flex-start", message: validationMessage, type: "error" })] })) : null] }) })] }));
};
exports.CompositionIdField = CompositionIdField;
