"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSidebarMenuItems = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const Checkmark_1 = require("../icons/Checkmark");
const getSidebarMenuItems = ({ side, state, onStateChange, }) => {
    return [
        {
            id: `${side}-sidebar-responsive`,
            keyHint: null,
            label: 'Responsive',
            leftItem: state === 'responsive' ? (0, jsx_runtime_1.jsx)(Checkmark_1.Checkmark, {}) : null,
            onClick: () => {
                onStateChange('responsive');
            },
            subMenu: null,
            type: 'item',
            value: 'responsive',
            quickSwitcherLabel: null,
        },
        {
            id: side === 'left' ? 'left-sidebar-expanded' : 'sidebar-expanded',
            keyHint: null,
            label: 'Expanded',
            leftItem: state === 'expanded' ? (0, jsx_runtime_1.jsx)(Checkmark_1.Checkmark, {}) : null,
            onClick: () => {
                onStateChange('expanded');
            },
            subMenu: null,
            type: 'item',
            value: 'expanded',
            quickSwitcherLabel: 'Expand',
        },
        {
            id: `${side}-sidebar-collapsed`,
            keyHint: null,
            label: 'Collapsed',
            leftItem: state === 'collapsed' ? (0, jsx_runtime_1.jsx)(Checkmark_1.Checkmark, {}) : null,
            onClick: () => {
                onStateChange('collapsed');
            },
            subMenu: null,
            type: 'item',
            value: 'collapsed',
            quickSwitcherLabel: 'Collapse',
        },
    ];
};
exports.getSidebarMenuItems = getSidebarMenuItems;
