"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrecomposeRefactorModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const client_id_1 = require("../helpers/client-id");
const colors_1 = require("../helpers/colors");
const format_file_location_1 = require("../helpers/format-file-location");
const get_codex_annotation_1 = require("../helpers/get-codex-annotation");
const request_codex_annotation_1 = require("../helpers/request-codex-annotation");
const AgentPrompt_1 = require("./AgentPrompt");
const ModalButton_1 = require("./ModalButton");
const ModalContainer_1 = require("./ModalContainer");
const ModalHeader_1 = require("./ModalHeader");
const DismissableModal_1 = require("./NewComposition/DismissableModal");
const SettingsContext_1 = require("./SettingsContext");
const panelStyle = {
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: (0, ModalContainer_1.getMaxModalHeight)(800),
    minWidth: 0,
    overflow: 'hidden',
    width: (0, ModalContainer_1.getMaxModalWidth)(560),
};
const container = {
    minHeight: 0,
    overflowY: 'auto',
    padding: 16,
};
const text = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 16,
};
const PrecomposeRefactorModal = ({ state, }) => {
    const { previewServerState } = (0, react_1.useContext)(client_id_1.StudioServerConnectionCtx);
    const { error, remotionSkillsInfo } = (0, SettingsContext_1.useSettings)();
    const annotationTarget = (0, react_1.useRef)(null);
    const markupSkill = remotionSkillsInfo === null || remotionSkillsInfo === void 0 ? void 0 : remotionSkillsInfo.skills.find(({ name }) => name === 'remotion-markup');
    const markupSkillAvailable = Boolean((markupSkill === null || markupSkill === void 0 ? void 0 : markupSkill.installedInProject) || (markupSkill === null || markupSkill === void 0 ? void 0 : markupSkill.installedGlobally));
    const isBrowserStudio = (0, browser_studio_operations_1.getBrowserStudioOperations)() !== null;
    const canAnnotate = !isBrowserStudio &&
        markupSkillAvailable &&
        !window.remotion_isReadOnlyStudio &&
        (0, get_codex_annotation_1.getCodexAnnotation)() !== null;
    const canSuggestAgent = !isBrowserStudio &&
        !window.remotion_isReadOnlyStudio &&
        previewServerState.type === 'connected' &&
        (remotionSkillsInfo === null || remotionSkillsInfo === void 0 ? void 0 : remotionSkillsInfo.skills.some(({ name }) => name === 'remotion-markup'));
    const targets = [
        ...new Set(state.targets.map(({ fileName, displayName, line }) => {
            var _a;
            const location = (_a = (0, format_file_location_1.formatFileLocation)({
                location: { source: fileName, line },
                root: window.remotion_cwd,
            })) !== null && _a !== void 0 ? _a : fileName;
            return displayName ? `${displayName} (${location})` : location;
        })),
    ];
    const promptDetails = targets.length === 1
        ? ` Pre-compose ${targets[0]}`
        : ` Pre-compose these sequences: ${targets.join('; ')}`;
    const selection = targets.join('; ');
    const onSendToChatGPT = (0, react_1.useCallback)(() => {
        (0, request_codex_annotation_1.requestCodexAnnotation)({
            target: annotationTarget.current,
            initialComment: '$remotion-markup',
            metadata: {
                action: 'Pre-compose',
                sequenceCount: targets.length,
                ...(selection.length <= 256 ? { selection } : {}),
            },
        });
    }, [selection, targets.length]);
    return ((0, jsx_runtime_1.jsxs)(DismissableModal_1.DismissableModal, { panelStyle: panelStyle, children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: "Pre-compose" }), (0, jsx_runtime_1.jsxs)("div", { ref: annotationTarget, style: container, children: [(0, jsx_runtime_1.jsx)("div", { style: text, children: "Move these items into their own composition and re-import them into this composition." }), canSuggestAgent || canAnnotate ? ((0, jsx_runtime_1.jsx)(AgentPrompt_1.AgentPrompt, { action: canAnnotate ? ((0, jsx_runtime_1.jsx)(ModalButton_1.ModalButton, { size: "compact", onClick: onSendToChatGPT, children: "Send to ChatGPT" })) : null, availableText: "You can pre-compose using an agent:", promptDetails: promptDetails, skillId: "remotion-markup" })) : ((0, jsx_runtime_1.jsx)("div", { style: text, children: isBrowserStudio
                            ? 'Agent-assisted refactoring is unavailable in remotion.new.'
                            : remotionSkillsInfo === null && error === null
                                ? 'Checking whether /remotion-markup is available...'
                                : 'The /remotion-markup Agent Skill is unavailable in this Studio.' }))] })] }));
};
exports.PrecomposeRefactorModal = PrecomposeRefactorModal;
