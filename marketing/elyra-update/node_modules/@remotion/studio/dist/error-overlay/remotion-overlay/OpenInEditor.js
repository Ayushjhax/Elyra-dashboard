"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenInEditor = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const AppLaunchButton_1 = require("../../components/AppLaunchButton");
const NotificationCenter_1 = require("../../components/Notifications/NotificationCenter");
const SettingsContext_1 = require("../../components/SettingsContext");
const use_configure_default_apps_1 = require("../../components/use-configure-default-apps");
const colors_1 = require("../../helpers/colors");
const copy_text_1 = require("../../helpers/copy-text");
const open_in_editor_1 = require("../../helpers/open-in-editor");
const use_keybinding_1 = require("../../helpers/use-keybinding");
const clipboard_1 = require("../../icons/clipboard");
const editor_1 = require("../../icons/editor");
const format_location_1 = require("./format-location");
const ShortcutHint_1 = require("./ShortcutHint");
const menuLabel = {
    color: 'inherit',
    fontFamily: 'sans-serif',
    fontSize: 13,
    lineHeight: '16px',
};
const copyIcon = { height: 16, width: 16 };
const OpenInEditor = ({ stack, canHaveKeyboardShortcuts, editorId, editorName, size }) => {
    const { editorInfo } = (0, SettingsContext_1.useSettings)();
    const configureDefaultApps = (0, use_configure_default_apps_1.useConfigureDefaultApps)();
    const { registerKeybinding } = (0, use_keybinding_1.useKeybinding)();
    const sourcePath = stack.originalFileName
        ? (0, format_location_1.formatLocation)(stack.originalFileName)
        : null;
    const openWithEditor = (0, react_1.useCallback)(async (selectedEditorId, selectedEditorName) => {
        try {
            const response = await (0, open_in_editor_1.openInEditor)(stack, selectedEditorId);
            if (!response.success) {
                (0, NotificationCenter_1.showNotification)(`Could not open ${selectedEditorName}`, 2000);
            }
        }
        catch (err) {
            (0, NotificationCenter_1.showNotification)(err.message, 2000);
        }
    }, [stack]);
    const openPreferredEditor = (0, react_1.useCallback)(() => {
        openWithEditor(editorId, editorName).catch(() => undefined);
    }, [editorId, editorName, openWithEditor]);
    const copyPath = (0, react_1.useCallback)(() => {
        if (sourcePath === null) {
            return;
        }
        (0, copy_text_1.copyText)(sourcePath)
            .then(() => (0, NotificationCenter_1.showNotification)('Copied path', 1500))
            .catch((err) => {
            (0, NotificationCenter_1.showNotification)(`Could not copy path: ${err.message}`, 2000);
        });
    }, [sourcePath]);
    (0, react_1.useEffect)(() => {
        if (!canHaveKeyboardShortcuts) {
            return;
        }
        const { unregister } = registerKeybinding({
            event: 'keydown',
            key: 'o',
            callback: openPreferredEditor,
            commandCtrlKey: true,
            preventDefault: true,
            triggerIfInputFieldFocused: false,
            keepRegisteredWhenNotHighestContext: false,
        });
        return () => unregister();
    }, [canHaveKeyboardShortcuts, openPreferredEditor, registerKeybinding]);
    const menuItems = (0, react_1.useMemo)(() => {
        var _a;
        const alternativeEditors = ((_a = editorInfo === null || editorInfo === void 0 ? void 0 : editorInfo.installedEditors) !== null && _a !== void 0 ? _a : []).filter((editor) => editor.id !== editorId);
        const editorItems = alternativeEditors.map((editor) => ({
            id: `open-in-${editor.id}`,
            keyHint: null,
            label: (0, jsx_runtime_1.jsx)("span", { style: menuLabel, children: editor.nameWithType }),
            leftItem: (0, jsx_runtime_1.jsx)(editor_1.EditorIcon, { editorId: editor.id, size: 18 }),
            onClick: () => {
                openWithEditor(editor.id, editor.nameWithType).catch(() => undefined);
            },
            quickSwitcherLabel: null,
            subMenu: null,
            type: 'item',
            value: editor.id,
        }));
        if (sourcePath === null) {
            return editorItems;
        }
        return [
            ...editorItems,
            ...(editorItems.length > 0
                ? [{ type: 'divider', id: 'copy-path-divider' }]
                : []),
            {
                id: 'copy-path',
                keyHint: null,
                label: (0, jsx_runtime_1.jsx)("span", { style: menuLabel, children: "Copy path" }),
                leftItem: (0, jsx_runtime_1.jsx)(clipboard_1.ClipboardIcon, { color: colors_1.LIGHT_TEXT, style: copyIcon }),
                onClick: copyPath,
                quickSwitcherLabel: null,
                subMenu: null,
                type: 'item',
                value: 'copy-path',
            },
        ];
    }, [
        copyPath,
        editorId,
        editorInfo === null || editorInfo === void 0 ? void 0 : editorInfo.installedEditors,
        openWithEditor,
        sourcePath,
    ]);
    return ((0, jsx_runtime_1.jsxs)(AppLaunchButton_1.AppLaunchButton, { actionButtonId: "error-overlay-open-in-editor", ariaLabel: `Open in ${editorName}`, disabled: false, menuAriaLabel: "Open in another app", menuButtonId: "error-overlay-open-in-another-app", menuItems: menuItems, onConfigureApps: configureDefaultApps, onClick: openPreferredEditor, size: size, style: null, children: [(0, jsx_runtime_1.jsx)(editor_1.EditorIcon, { editorId: editorId, size: size === 'default' ? 14 : 18 }), "Open in ", editorName, canHaveKeyboardShortcuts ? ((0, jsx_runtime_1.jsx)(ShortcutHint_1.ShortcutHint, { keyToPress: "o", cmdOrCtrl: true })) : null] }));
};
exports.OpenInEditor = OpenInEditor;
