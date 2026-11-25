import React from 'react';
import { MenuItem } from './Menu/MenuItem';
type ToolbarMenuItemProps = Omit<React.ComponentProps<typeof MenuItem>, 'menu' | 'label' | 'id' | 'leaveLeftPadding'> & {
    readonly closeMenu: () => void;
    readonly readOnlyStudio: boolean;
};
export declare const FileToolbarMenuItem: React.FC<ToolbarMenuItemProps>;
export declare const CompositionToolbarMenuItem: React.FC<ToolbarMenuItemProps>;
export declare const MobileToolbarMenuItem: React.FC<ToolbarMenuItemProps>;
export {};
