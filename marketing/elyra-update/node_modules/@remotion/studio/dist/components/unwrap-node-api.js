"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unwrapNode = void 0;
const browser_studio_operations_1 = require("../helpers/browser-studio-operations");
const call_api_1 = require("./call-api");
const unwrapNode = (request) => {
    const browserStudioOperations = (0, browser_studio_operations_1.getBrowserStudioOperations)();
    if (browserStudioOperations) {
        return browserStudioOperations.unwrapNode(request);
    }
    return (0, call_api_1.callApi)('/api/unwrap-node', request);
};
exports.unwrapNode = unwrapNode;
