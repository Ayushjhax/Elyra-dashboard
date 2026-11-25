"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnnotateWithChatGPTMenuItems = void 0;
const get_codex_annotation_1 = require("../helpers/get-codex-annotation");
const request_codex_annotation_1 = require("../helpers/request-codex-annotation");
const getAnnotateWithChatGPTMenuItems = ({ id, getTarget, initialComment, getMetadata, }) => {
    if (window.remotion_isReadOnlyStudio || (0, get_codex_annotation_1.getCodexAnnotation)() === null) {
        return [];
    }
    return [
        {
            type: 'item',
            id,
            keyHint: null,
            label: 'Annotate with ChatGPT',
            leftItem: null,
            disabled: false,
            onClick: () => {
                (0, request_codex_annotation_1.requestCodexAnnotation)({
                    target: getTarget(),
                    initialComment,
                    metadata: getMetadata(),
                });
            },
            quickSwitcherLabel: null,
            subMenu: null,
            value: id,
        },
    ];
};
exports.getAnnotateWithChatGPTMenuItems = getAnnotateWithChatGPTMenuItems;
