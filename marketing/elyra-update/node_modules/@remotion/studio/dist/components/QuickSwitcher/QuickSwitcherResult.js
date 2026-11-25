"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickSwitcherResult = exports.isQuickSwitcherResultSelectable = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../../helpers/colors");
const hoverable_1 = require("../../helpers/hoverable");
const noop_1 = require("../../helpers/noop");
const use_keybinding_1 = require("../../helpers/use-keybinding");
const folder_1 = require("../../icons/folder");
const still_1 = require("../../icons/still");
const upload_1 = require("../../icons/upload");
const video_1 = require("../../icons/video");
const modals_1 = require("../../state/modals");
const AssetFileIcon_1 = require("../AssetFileIcon");
const composition_menu_items_1 = require("../composition-menu-items");
const ContextMenu_1 = require("../ContextMenu");
const layout_1 = require("../layout");
const use_resolved_stack_1 = require("../Timeline/use-resolved-stack");
const use_open_in_menu_apps_1 = require("../use-open-in-menu-apps");
const shared_1 = require("./shared");
const isQuickSwitcherResultSelectable = (result) => {
    return result.type !== 'folder';
};
exports.isQuickSwitcherResultSelectable = isQuickSwitcherResultSelectable;
const container = {
    paddingLeft: 16,
    paddingRight: 16,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'default',
    marginBottom: 1,
    marginLeft: 4,
    marginRight: 4,
    borderRadius: 4,
};
const label = {
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
};
const searchLabel = {
    ...label,
    lineHeight: 1.25,
};
const iconStyle = {
    width: 18,
    height: 18,
    flexShrink: 0,
};
const selectFileIconStyle = {
    ...iconStyle,
    width: 20,
    height: 20,
};
const labelContainer = {
    overflow: 'hidden',
    flex: 1,
    paddingTop: 5,
    paddingBottom: 5,
};
const QuickSwitcherResult = ({ result, selected }) => {
    var _a;
    const ref = (0, react_1.useRef)(null);
    const keybindings = (0, use_keybinding_1.useKeybinding)();
    const onSelected = result.type === 'folder' ? null : result.onSelected;
    const composition = result.type === 'composition' ? result.composition : null;
    const { setSelectedModal } = (0, react_1.useContext)(modals_1.SetSelectedModalContext);
    const { connectionStatus, openInApps } = (0, use_open_in_menu_apps_1.useOpenInMenuApps)();
    const resolvedLocation = (0, use_resolved_stack_1.useResolvedStack)((_a = composition === null || composition === void 0 ? void 0 : composition.stack) !== null && _a !== void 0 ? _a : null);
    const getContextMenuItems = (0, react_1.useCallback)(() => {
        if (composition === null) {
            return [];
        }
        return (0, composition_menu_items_1.getCompositionContextMenuItems)({
            closeMenu: noop_1.noop,
            composition,
            connectionStatus,
            includeCompositionManagementItems: true,
            openInApps,
            resolvedLocation,
            setSelectedModal,
            readOnlyStudio: window.remotion_isReadOnlyStudio,
        });
    }, [
        composition,
        connectionStatus,
        openInApps,
        resolvedLocation,
        setSelectedModal,
    ]);
    (0, react_1.useEffect)(() => {
        if (!selected || onSelected === null) {
            return;
        }
        const binding = keybindings.registerKeybinding({
            key: 'Enter',
            callback: onSelected,
            commandCtrlKey: false,
            event: 'keydown',
            preventDefault: true,
            // Input will be focused while selection
            triggerIfInputFieldFocused: true,
            keepRegisteredWhenNotHighestContext: false,
        });
        return () => {
            binding.unregister();
        };
    }, [keybindings, onSelected, selected]);
    (0, shared_1.useScrollIntoViewOnSelected)(ref, selected);
    const style = (0, react_1.useMemo)(() => {
        return {
            ...container,
            paddingLeft: result.type === 'folder' || result.type === 'composition'
                ? 16 + result.level * 8
                : container.paddingLeft,
            ...(0, hoverable_1.hoverableStyle)({
                idleBackground: result.type !== 'folder' && selected ? colors_1.WHITE_ALPHA_06 : colors_1.TRANSPARENT,
                hoverBackground: result.type === 'folder' ? colors_1.TRANSPARENT : colors_1.WHITE_ALPHA_06,
                idleColor: selected &&
                    result.type !== 'folder' &&
                    result.type !== 'search-result'
                    ? colors_1.WHITE
                    : colors_1.LIGHT_TEXT,
                hoverColor: result.type === 'folder' || result.type === 'search-result'
                    ? colors_1.LIGHT_TEXT
                    : colors_1.WHITE,
            }),
        };
    }, [result, selected]);
    const labelStyle = (0, react_1.useMemo)(() => {
        return {
            ...(result.type === 'search-result' ? searchLabel : label),
            fontSize: shared_1.QUICK_SWITCHER_RESULT_LABEL_FONT_SIZE,
        };
    }, [result.type]);
    const row = ((0, jsx_runtime_1.jsxs)("div", { ref: ref, "data-annotation-composition-id": composition === null || composition === void 0 ? void 0 : composition.id, style: style, className: hoverable_1.HOVERABLE_CLASS_NAME, onClick: onSelected !== null && onSelected !== void 0 ? onSelected : undefined, children: [result.type === 'composition' ? (result.compositionType === 'still' ? ((0, jsx_runtime_1.jsx)(still_1.StillIcon, { color: colors_1.CURRENT_COLOR, style: iconStyle })) : ((0, jsx_runtime_1.jsx)(video_1.FilmIcon, { color: colors_1.CURRENT_COLOR, style: iconStyle }))) : result.type === 'folder' ? ((0, jsx_runtime_1.jsx)(folder_1.ExpandedFolderIcon, { color: colors_1.CURRENT_COLOR, style: iconStyle })) : result.type === 'asset' ? ((0, jsx_runtime_1.jsx)(AssetFileIcon_1.AssetFileIcon, { fileType: result.fileType, color: colors_1.CURRENT_COLOR, style: iconStyle })) : result.type === 'select-file' ? ((0, jsx_runtime_1.jsx)(upload_1.UploadIcon, { color: colors_1.CURRENT_COLOR, style: selectFileIconStyle })) : null, (0, jsx_runtime_1.jsx)(layout_1.Spacing, { x: 1 }), (0, jsx_runtime_1.jsx)("div", { style: labelContainer, children: result.type === 'search-result' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { 
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML: {
                                __html: result.titleLine,
                            }, style: labelStyle }), (0, jsx_runtime_1.jsx)("div", { 
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML: {
                                __html: result.subtitleLine,
                            }, style: labelStyle })] })) : ((0, jsx_runtime_1.jsx)("div", { style: labelStyle, children: result.title })) })] }, result.id));
    if (composition === null) {
        return row;
    }
    return (0, jsx_runtime_1.jsx)(ContextMenu_1.ContextMenu, { getItems: getContextMenuItems, children: row });
};
exports.QuickSwitcherResult = QuickSwitcherResult;
