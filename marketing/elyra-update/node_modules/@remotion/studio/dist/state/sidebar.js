"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarContextProvider = exports.SidebarContext = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const storageKey = (sidebar) => {
    if (sidebar === 'right') {
        return 'remotion.sidebarRightCollapsing.v2';
    }
    return 'remotion.sidebarCollapsing.v2';
};
const getSavedCollapsedStateLeft = () => {
    const state = window.localStorage.getItem(storageKey('left'));
    if (state === 'collapsed') {
        return 'collapsed';
    }
    if (state === 'expanded') {
        return 'expanded';
    }
    return 'responsive';
};
const getSavedCollapsedStateRight = () => {
    const state = window.localStorage.getItem(storageKey('right'));
    if (state === 'expanded') {
        return 'expanded';
    }
    if (state === 'collapsed') {
        return 'collapsed';
    }
    return 'responsive';
};
const saveCollapsedState = (type, sidebar) => {
    window.localStorage.setItem(storageKey(sidebar), type);
};
exports.SidebarContext = (0, react_1.createContext)({
    leftSidebarOverlayOpen: false,
    setLeftSidebarOverlayOpen: () => undefined,
    rightSidebarTemporaryExpansion: false,
    setRightSidebarTemporaryExpansion: () => undefined,
    sidebarCollapsedDuringDrag: null,
    setSidebarCollapsedDuringDrag: () => undefined,
    sidebarCollapsedStateLeft: 'responsive',
    setSidebarCollapsedState: () => {
        throw new Error('sidebar collapsed state');
    },
    sidebarCollapsedStateRight: 'responsive',
});
const SidebarContextProvider = ({ children }) => {
    const [sidebarCollapsedState, setSidebarCollapsedState] = (0, react_1.useState)(() => ({
        left: getSavedCollapsedStateLeft(),
        right: getSavedCollapsedStateRight(),
    }));
    const [leftSidebarOverlayOpen, setLeftSidebarOverlayOpen] = (0, react_1.useState)(false);
    const [sidebarCollapsedDuringDrag, setSidebarCollapsedDuringDrag] = (0, react_1.useState)(null);
    const [rightSidebarTemporaryExpansion, setRightSidebarTemporaryExpansion] = (0, react_1.useState)(false);
    const value = (0, react_1.useMemo)(() => {
        return {
            leftSidebarOverlayOpen,
            setLeftSidebarOverlayOpen,
            rightSidebarTemporaryExpansion,
            setRightSidebarTemporaryExpansion,
            sidebarCollapsedDuringDrag,
            setSidebarCollapsedDuringDrag,
            sidebarCollapsedStateLeft: sidebarCollapsedState.left,
            sidebarCollapsedStateRight: sidebarCollapsedState.right,
            setSidebarCollapsedState: (options) => {
                const { left, right } = options;
                if (right !== null) {
                    setRightSidebarTemporaryExpansion(false);
                }
                setSidebarCollapsedState((f) => {
                    const copied = { ...f };
                    if (left) {
                        const updatedLeft = typeof left === 'function' ? left(f.left) : left;
                        saveCollapsedState(updatedLeft, 'left');
                        copied.left = updatedLeft;
                    }
                    if (right) {
                        const updatedRight = typeof right === 'function' ? right(f.right) : right;
                        saveCollapsedState(updatedRight, 'right');
                        copied.right = updatedRight;
                    }
                    return copied;
                });
            },
        };
    }, [
        leftSidebarOverlayOpen,
        rightSidebarTemporaryExpansion,
        sidebarCollapsedState,
        sidebarCollapsedDuringDrag,
    ]);
    return ((0, jsx_runtime_1.jsx)(exports.SidebarContext.Provider, { value: value, children: children }));
};
exports.SidebarContextProvider = SidebarContextProvider;
