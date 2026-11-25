"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Folder = exports.FolderContext = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const committed_metadata_js_1 = require("./committed-metadata.js");
const composition_registry_fallback_js_1 = require("./composition-registry-fallback.js");
const truthy_js_1 = require("./truthy.js");
const validate_folder_name_js_1 = require("./validation/validate-folder-name.js");
exports.FolderContext = (0, react_1.createContext)({
    folderName: null,
    parentName: null,
});
const FolderContextProvider = (0, committed_metadata_js_1.withCommittedMetadata)(exports.FolderContext.Provider);
/*
 * @description By wrapping a <Composition /> inside a <Folder />, you can visually categorize it in your sidebar, should you have many compositions.
 * @see [Documentation](https://remotion.dev/docs/folder)
 */
const Folder = (props) => {
    var _a;
    const { name, children } = props;
    const parent = (0, react_1.useContext)(exports.FolderContext);
    const stack = (_a = props
        ._remotionInternalStack) !== null && _a !== void 0 ? _a : null;
    (0, validate_folder_name_js_1.validateFolderName)(name);
    const parentNameArr = [parent.parentName, parent.folderName].filter(truthy_js_1.truthy);
    const parentName = parentNameArr.length === 0 ? null : parentNameArr.join('/');
    const value = (0, react_1.useMemo)(() => {
        return {
            folderName: name,
            parentName,
        };
    }, [name, parentName]);
    const registration = (0, react_1.useMemo)(() => ({ name, parent: parentName, order: null, stack }), [name, parentName, stack]);
    const metadata = (0, react_1.useMemo)(() => ({
        type: 'folder',
        id: (0, committed_metadata_js_1.getFolderOrderId)({ name, parent: parentName }),
        value: registration,
    }), [name, parentName, registration]);
    (0, composition_registry_fallback_js_1.useCommittedCompositionEntry)(metadata);
    return ((0, jsx_runtime_1.jsx)(FolderContextProvider, { value: value, _remotionCommitMetadata: metadata, children: children }));
};
exports.Folder = Folder;
