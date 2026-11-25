"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCopyContextForAgentsMenuItem = void 0;
const copy_text_1 = require("../../helpers/copy-text");
const NotificationCenter_1 = require("../Notifications/NotificationCenter");
const getCopyContextForAgentsMenuItem = ({ contextForAgents, }) => {
    return {
        type: 'item',
        id: 'copy-context-for-agents',
        keyHint: null,
        label: 'Copy context for agents',
        leftItem: null,
        disabled: !contextForAgents,
        onClick: () => {
            if (!contextForAgents) {
                return;
            }
            (0, copy_text_1.copyText)(typeof contextForAgents === 'string'
                ? contextForAgents
                : contextForAgents().then((context) => {
                    if (!context) {
                        throw new Error('No source location found');
                    }
                    return context;
                })).catch((err) => {
                (0, NotificationCenter_1.showNotification)(`Could not copy to clipboard: ${err.message}`, 2000);
            });
        },
        quickSwitcherLabel: null,
        subMenu: null,
        value: 'copy-context-for-agents',
    };
};
exports.getCopyContextForAgentsMenuItem = getCopyContextForAgentsMenuItem;
