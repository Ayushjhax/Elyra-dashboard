"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unwrapSequenceFromSource = void 0;
const unwrap_node_api_1 = require("../unwrap-node-api");
const unwrapSequenceFromSource = async ({ compositionId, displayName, nodePath, sourceLocation, setSelectedModal, }) => {
    const request = {
        fileName: nodePath.absolutePath,
        compositionId,
        nodePath: nodePath.nodePath,
    };
    const eligibility = await (0, unwrap_node_api_1.unwrapNode)({ ...request, dryRun: true });
    if (!eligibility.success) {
        throw new Error(eligibility.reason);
    }
    if (!eligibility.canUnwrap) {
        setSelectedModal({
            type: 'unwrap-refactor',
            displayName,
            location: sourceLocation,
        });
        return;
    }
    const result = await (0, unwrap_node_api_1.unwrapNode)({ ...request, dryRun: false });
    if (!result.success) {
        throw new Error(result.reason);
    }
};
exports.unwrapSequenceFromSource = unwrapSequenceFromSource;
