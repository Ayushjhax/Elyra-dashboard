"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionExplainer = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../../helpers/colors");
const layout_1 = require("../layout");
const MenuDivider_1 = require("../Menu/MenuDivider");
const CliCopyButton_1 = require("./CliCopyButton");
const InfoTooltip_1 = require("./InfoTooltip");
const container = {
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors_1.INPUT_BACKGROUND,
    color: colors_1.WHITE,
};
const padding = {
    paddingLeft: 20,
    paddingRight: 20,
};
const title = {
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
};
const description = {
    color: colors_1.LIGHT_TEXT,
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
    lineHeight: 1.5,
    maxWidth: 400,
};
const link = {
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
    maxWidth: 200,
    color: colors_1.BLUE,
    wordWrap: 'break-word',
    textDecoration: 'none',
};
const infoRow = {
    ...padding,
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
};
const infoRowLabel = {
    width: 150,
    fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
    color: colors_1.WHITE,
};
const flexSpacer = {
    display: 'flex',
    flex: 1,
};
const copyWrapper = {
    display: 'flex',
    justifyContent: 'flex-end',
};
const OptionExplainer = ({ option, extraInfoRows = [], showApiOption = true, showCliFlag = true, }) => {
    const shouldShowApiOption = showApiOption && option.ssrName !== null;
    const shouldShowCliFlag = showCliFlag && option.cliFlag !== undefined;
    const hasInfoRows = extraInfoRows.length > 0 || shouldShowCliFlag || shouldShowApiOption;
    return ((0, jsx_runtime_1.jsxs)("div", { style: container, className: "__remotion-info-button-container", children: [(0, jsx_runtime_1.jsxs)("div", { style: padding, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("strong", { style: title, children: option.name }), option.docLink ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(layout_1.Spacing, { x: 1 }), (0, jsx_runtime_1.jsx)("a", { style: link, href: option.docLink, target: "_blank", children: "Docs" })] })) : null] }), (0, jsx_runtime_1.jsxs)("div", { style: description, children: [(0, jsx_runtime_1.jsx)("style", { children: `
							.__remotion-option-explainer-description,
							.__remotion-option-explainer-description * {
								color: inherit;
								font-size: ${InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE}px;
								line-height: inherit;
							}

							.__remotion-option-explainer-description a {
								color: ${colors_1.BLUE};
								text-decoration: none;
							}

							.__remotion-option-explainer-description code {
								color: ${colors_1.BLUE};
								font-family: monospace;
							}
						` }), (0, jsx_runtime_1.jsx)("div", { className: "__remotion-option-explainer-description", children: option.description('ssr') })] })] }), hasInfoRows ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(layout_1.Spacing, { y: 0.5, block: true }), (0, jsx_runtime_1.jsx)(MenuDivider_1.MenuDivider, {}), (0, jsx_runtime_1.jsx)(layout_1.Spacing, { y: 0.5, block: true }), (0, jsx_runtime_1.jsxs)("div", { children: [extraInfoRows.map((row) => ((0, jsx_runtime_1.jsxs)("div", { style: infoRow, children: [(0, jsx_runtime_1.jsx)("div", { style: infoRowLabel, children: row.label }), (0, jsx_runtime_1.jsx)("div", { style: flexSpacer }), (0, jsx_runtime_1.jsx)("code", { children: row.value }), (0, jsx_runtime_1.jsx)("div", { style: copyWrapper, children: (0, jsx_runtime_1.jsx)(CliCopyButton_1.CliCopyButton, { valueToCopy: row.value }) })] }, row.label))), shouldShowCliFlag ? ((0, jsx_runtime_1.jsxs)("div", { style: infoRow, children: [(0, jsx_runtime_1.jsx)("div", { style: infoRowLabel, children: "CLI flag" }), (0, jsx_runtime_1.jsx)("div", { style: flexSpacer }), (0, jsx_runtime_1.jsxs)("code", { children: ["--", option.cliFlag] }), (0, jsx_runtime_1.jsx)("div", { style: copyWrapper, children: (0, jsx_runtime_1.jsx)(CliCopyButton_1.CliCopyButton, { valueToCopy: option.cliFlag }) })] })) : null, shouldShowApiOption ? ((0, jsx_runtime_1.jsxs)("div", { style: infoRow, children: [(0, jsx_runtime_1.jsx)("div", { style: infoRowLabel, children: "API option" }), (0, jsx_runtime_1.jsx)("div", { style: flexSpacer }), (0, jsx_runtime_1.jsx)("code", { children: option.ssrName }), (0, jsx_runtime_1.jsx)(layout_1.Spacing, { x: 3.75 })] })) : null, (0, jsx_runtime_1.jsx)("div", { style: infoRow })] })] })) : null] }));
};
exports.OptionExplainer = OptionExplainer;
