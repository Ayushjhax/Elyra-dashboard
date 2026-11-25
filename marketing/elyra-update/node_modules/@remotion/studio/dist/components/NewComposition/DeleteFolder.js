"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteFolder = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const get_folder_id_1 = require("../../helpers/get-folder-id");
const styles_1 = require("../Menu/styles");
const ModalFooter_1 = require("../ModalFooter");
const ModalHeader_1 = require("../ModalHeader");
const actions_1 = require("../RenderQueue/actions");
const CompositionEditFooter_1 = require("./CompositionEditFooter");
const DismissableModal_1 = require("./DismissableModal");
const content = {
    padding: 16,
    fontSize: 14,
    flex: 1,
    minWidth: 500,
};
const DeleteFolder = ({ folderName, parentName, stack }) => {
    const onSubmit = (0, react_1.useCallback)((e) => {
        e.preventDefault();
    }, []);
    const folderId = (0, get_folder_id_1.getFolderId)({ folderName, parentName });
    return ((0, jsx_runtime_1.jsxs)(DismissableModal_1.DismissableModal, { children: [(0, jsx_runtime_1.jsx)(ModalHeader_1.ModalHeader, { title: 'Delete folder' }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: onSubmit, children: [(0, jsx_runtime_1.jsxs)("div", { style: content, children: ["Do you want to delete the", ' ', (0, jsx_runtime_1.jsx)("code", { style: styles_1.inlineCodeSnippet, children: "Folder" }), " with ID ", '"', folderId, '"', "?", (0, jsx_runtime_1.jsx)("br", {}), "The compositions and nested folders inside it will stay in your code."] }), (0, jsx_runtime_1.jsx)(ModalFooter_1.ModalFooterContainer, { children: (0, jsx_runtime_1.jsx)(CompositionEditFooter_1.CompositionEditFooter, { errorNotification: `Could not delete folder`, loadingNotification: 'Deleting folder', genericSubmitLabel: `Delete`, submitLabel: ({ relativeRootPath }) => `Delete from ${relativeRootPath}`, stack: stack, valid: true, onSuccess: null, applyEdit: ({ signal, symbolicatedStack }) => (0, actions_1.unwrapFolder)({
                                folderName,
                                parentName,
                                symbolicatedStack,
                                undoRedoNavigation: null,
                            }, signal) }) })] })] }));
};
exports.DeleteFolder = DeleteFolder;
