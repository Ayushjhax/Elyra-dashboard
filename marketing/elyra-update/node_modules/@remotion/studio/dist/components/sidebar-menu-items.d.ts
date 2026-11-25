import type { SidebarCollapsedState } from '../state/sidebar';
import type { ComboboxValue } from './NewComposition/ComboBox';
export declare const getSidebarMenuItems: ({ side, state, onStateChange, }: {
    side: 'left' | 'right';
    state: SidebarCollapsedState;
    onStateChange: (state: SidebarCollapsedState) => void;
}) => ComboboxValue[];
