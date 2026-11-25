import React from 'react';
export type SidebarCollapsedState = 'collapsed' | 'expanded' | 'responsive';
type Context = {
    leftSidebarOverlayOpen: boolean;
    setLeftSidebarOverlayOpen: React.Dispatch<React.SetStateAction<boolean>>;
    rightSidebarTemporaryExpansion: boolean;
    setRightSidebarTemporaryExpansion: React.Dispatch<React.SetStateAction<boolean>>;
    sidebarCollapsedDuringDrag: Sidebars | null;
    setSidebarCollapsedDuringDrag: (side: Sidebars | null) => void;
    sidebarCollapsedStateLeft: SidebarCollapsedState;
    setSidebarCollapsedState: (options: {
        left: null | React.SetStateAction<SidebarCollapsedState>;
        right: null | React.SetStateAction<SidebarCollapsedState>;
    }) => void;
    sidebarCollapsedStateRight: SidebarCollapsedState;
};
type Sidebars = 'left' | 'right';
export declare const SidebarContext: React.Context<Context>;
export declare const SidebarContextProvider: React.FC<{
    readonly children: React.ReactNode;
}>;
export {};
