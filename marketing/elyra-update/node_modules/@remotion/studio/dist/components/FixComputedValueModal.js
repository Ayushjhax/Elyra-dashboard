"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixComputedValueModal = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const resolve_file_source_1 = require("../error-overlay/react-overlay/effects/resolve-file-source");
const OpenInEditor_1 = require("../error-overlay/remotion-overlay/OpenInEditor");
const StackFrame_1 = require("../error-overlay/remotion-overlay/StackFrame");
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const client_id_1 = require("../helpers/client-id");
const colors_1 = require("../helpers/colors");
const get_codex_annotation_1 = require("../helpers/get-codex-annotation");
const open_in_editor_1 = require("../helpers/open-in-editor");
const request_codex_annotation_1 = require("../helpers/request-codex-annotation");
const AgentPrompt_1 = require("./AgentPrompt");
const ModalButton_1 = require("./ModalButton");
const ModalContainer_1 = require("./ModalContainer");
const ModalHeader_1 = require("./ModalHeader");
const DismissableModal_1 = require("./NewComposition/DismissableModal");
const SettingsContext_1 = require("./SettingsContext");
const use_default_editor_info_1 = require("./use-default-editor-info");
const use_download_project_1 = require("./use-download-project");
const panelStyle = {
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    width: (0, ModalContainer_1.getMaxModalWidth)(560),
    maxHeight: (0, ModalContainer_1.getMaxModalHeight)(800),
    minWidth: 0,
    overflow: 'hidden',
};
const container = {
    padding: 16,
    minHeight: 0,
    overflowY: 'auto',
};
const text = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
};
const sourcePreviewContainer = {
    marginBottom: 16,
    marginTop: 4,
};
const sourcePreviewStatus = {
    ...text,
    marginBottom: 16,
    marginTop: 10,
};
const FixComputedValueModal = ({ state }) => {
    var _a;
    const { previewServerState } = (0, react_1.useContext)(client_id_1.StudioServerConnectionCtx);
    const { remotionSkillsInfo } = (0, SettingsContext_1.useSettings)();
    const annotationTarget = (0, react_1.useRef)(null);
    const interactivitySkill = remotionSkillsInfo === null || remotionSkillsInfo === void 0 ? void 0 : remotionSkillsInfo.skills.find(({ name }) => name === 'remotion-interactivity');
    const interactivitySkillAvailable = Boolean((interactivitySkill === null || interactivitySkill === void 0 ? void 0 : interactivitySkill.installedInProject) ||
        (interactivitySkill === null || interactivitySkill === void 0 ? void 0 : interactivitySkill.installedGlobally));
    const { canOpenInEditor, defaultEditorId, defaultEditorName } = (0, use_default_editor_info_1.useEditorOpening)(previewServerState.type === 'connected');
    const [sourcePreview, setSourcePreview] = (0, react_1.useState)({
        type: 'loading',
    });
    const promptLocation = sourcePreview.type === 'loaded'
        ? `${sourcePreview.stack.originalFileName}:${sourcePreview.stack.originalLineNumber}:${sourcePreview.stack.originalColumnNumber}`
        : `${state.location.source}:${state.location.line}:${state.location.column}`;
    const promptDetails = ` ${promptLocation} make "${state.prop}" interactive`;
    const isBrowserStudio = (0, browser_studio_operations_1.getBrowserStudioOperations)() !== null;
    const downloadProject = (0, use_download_project_1.useDownloadProject)();
    const canAnnotate = !isBrowserStudio &&
        sourcePreview.type === 'loaded' &&
        !window.remotion_isReadOnlyStudio &&
        (0, get_codex_annotation_1.getCodexAnnotation)() !== null;
    const onSendToChatGPT = (0, react_1.useCallback)(() => {
        (0, request_codex_annotation_1.requestCodexAnnotation)({
            target: annotationTarget.current,
            initialComment: interactivitySkillAvailable
                ? '$remotion-interactivity Make this computed value interactive.'
                : 'Make this computed value interactive.',
            metadata: { property: state.prop, source: promptLocation },
        });
    }, [interactivitySkillAvailable, promptLocation, state.prop]);
    const canOpenSourceInEditor = sourcePreview.type === 'loaded' &&
        canOpenInEditor &&
        defaultEditorId !== null &&
        defaultEditorName !== null;
    (0, react_1.useEffect)(() => {
        var _a;
        let cancelled = false;
        setSourcePreview({ type: 'loading' });
        (0, open_in_editor_1.findOriginalPositionInFileAtProperty)({
            originalPosition: state.location,
            property: (_a = state.prop.split('.').at(-1)) !== null && _a !== void 0 ? _a : state.prop,
        })
            .then((position) => {
            return (0, resolve_file_source_1.resolveFileSource)({
                columnNumber: position.column,
                fileName: position.source,
                lineNumber: position.line,
                message: `Computed value "${state.prop}"`,
            }, 1);
        })
            .then((stack) => {
            if (!cancelled) {
                setSourcePreview({ type: 'loaded', stack });
            }
        })
            .catch((err) => {
            if (!cancelled) {
                setSourcePreview({
                    type: 'error',
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [state.location, state.prop]);
    return ((0, jsx_runtime_1.jsxs)(DismissableModal_1.DismissableModal, { panelStyle: panelStyle, children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: "Fix computed value" }), (0, jsx_runtime_1.jsxs)("div", { style: container, children: [(0, jsx_runtime_1.jsx)("div", { style: text, children: "This value cannot be interactively edited because it is computed:" }), sourcePreview.type === 'loaded' ? ((0, jsx_runtime_1.jsx)("div", { ref: annotationTarget, style: sourcePreviewContainer, children: (0, jsx_runtime_1.jsx)(StackFrame_1.StackElement, { collapsible: false, defaultFunctionName: null, editorId: canOpenInEditor ? defaultEditorId : null, fontSize: 13, headerAction: canOpenSourceInEditor ? ((0, jsx_runtime_1.jsx)(OpenInEditor_1.OpenInEditor, { canHaveKeyboardShortcuts: false, editorId: defaultEditorId, editorName: defaultEditorName, size: "compact", stack: sourcePreview.stack })) : null, horizontalSpacing: 0, isFirst: true, lineNumberWidth: String(Math.max(0, ...((_a = sourcePreview.stack.originalScriptCode) !== null && _a !== void 0 ? _a : []).map((line) => line.lineNumber))).length, s: sourcePreview.stack }) })) : ((0, jsx_runtime_1.jsx)("div", { style: sourcePreviewStatus, children: sourcePreview.type === 'loading'
                            ? 'Loading code preview...'
                            : `Could not load code preview: ${sourcePreview.message}` })), isBrowserStudio ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: text, children: "This value requires a code change to become editable. Code editing and agent-assisted refactoring are unavailable in remotion.new. Download the project to continue locally." }), downloadProject ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 16 }, children: (0, jsx_runtime_1.jsx)(ModalButton_1.ModalButton, { onClick: downloadProject, children: "Download project" }) })) : null] })) : ((0, jsx_runtime_1.jsx)(AgentPrompt_1.AgentPrompt, { action: canAnnotate ? ((0, jsx_runtime_1.jsx)(ModalButton_1.ModalButton, { size: "compact", onClick: onSendToChatGPT, children: "Send to ChatGPT" })) : null, availableText: "Use this prompt to make this value editable:", promptDetails: promptDetails, skillId: "remotion-interactivity" }))] })] }));
};
exports.FixComputedValueModal = FixComputedValueModal;
