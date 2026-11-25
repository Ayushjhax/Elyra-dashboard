"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreferredApp = exports.preferredFallbackEditorIds = void 0;
exports.preferredFallbackEditorIds = [
    'zed',
    'vscode',
    'cursor',
];
const getPreferredApp = ({ installedApps, configuredId, runningIds, recentlyUsedIds, fallbackIds, }) => {
    var _a;
    const configuredApp = installedApps.find((app) => app.id === configuredId);
    if (configuredApp) {
        return configuredApp;
    }
    return ((_a = [...installedApps]
        .sort((a, b) => {
        const runningDifference = Number(runningIds.includes(b.id)) - Number(runningIds.includes(a.id));
        if (runningDifference !== 0) {
            return runningDifference;
        }
        for (const ids of [recentlyUsedIds, fallbackIds]) {
            const aIndex = ids.indexOf(a.id);
            const bIndex = ids.indexOf(b.id);
            const difference = (aIndex === -1 ? ids.length : aIndex) -
                (bIndex === -1 ? ids.length : bIndex);
            if (difference !== 0) {
                return difference;
            }
        }
        return a.nameWithType.localeCompare(b.nameWithType);
    })
        .at(0)) !== null && _a !== void 0 ? _a : null);
};
exports.getPreferredApp = getPreferredApp;
