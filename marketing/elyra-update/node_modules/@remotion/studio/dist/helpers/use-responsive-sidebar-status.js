"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useResponsiveSidebarStatus = exports.SIDEBAR_RESPONSIVE_BREAKPOINTS = void 0;
const react_1 = require("react");
const sidebar_1 = require("../state/sidebar");
const mobile_layout_1 = require("./mobile-layout");
const use_breakpoint_1 = require("./use-breakpoint");
exports.SIDEBAR_RESPONSIVE_BREAKPOINTS = {
    left: 1000,
    right: 800,
};
const useResponsiveSidebarStatus = (side) => {
    const { rightSidebarTemporaryExpansion, sidebarCollapsedStateLeft, sidebarCollapsedStateRight, } = (0, react_1.useContext)(sidebar_1.SidebarContext);
    const isMobileLayout = (0, mobile_layout_1.useMobileLayout)();
    const responsiveStatus = (0, use_breakpoint_1.useBreakpoint)(exports.SIDEBAR_RESPONSIVE_BREAKPOINTS[side])
        ? 'collapsed'
        : 'expanded';
    const collapsedState = side === 'left' ? sidebarCollapsedStateLeft : sidebarCollapsedStateRight;
    return (0, react_1.useMemo)(() => {
        if (side === 'left' && isMobileLayout) {
            return 'collapsed';
        }
        if (collapsedState === 'collapsed') {
            return 'collapsed';
        }
        if (collapsedState === 'expanded') {
            return 'expanded';
        }
        if (side === 'right' && rightSidebarTemporaryExpansion) {
            return 'expanded';
        }
        if (isMobileLayout) {
            return 'collapsed';
        }
        return responsiveStatus;
    }, [
        collapsedState,
        isMobileLayout,
        responsiveStatus,
        rightSidebarTemporaryExpansion,
        side,
    ]);
};
exports.useResponsiveSidebarStatus = useResponsiveSidebarStatus;
