"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precomposeJsxNodes = void 0;
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const call_api_1 = require("./call-api");
const precomposeJsxNodes = (request) => {
    const browserStudioOperations = (0, browser_studio_operations_1.getBrowserStudioOperations)();
    if (browserStudioOperations) {
        return browserStudioOperations.precomposeJsxNodes(request);
    }
    return (0, call_api_1.callApi)('/api/precompose-jsx-nodes', request);
};
exports.precomposeJsxNodes = precomposeJsxNodes;
