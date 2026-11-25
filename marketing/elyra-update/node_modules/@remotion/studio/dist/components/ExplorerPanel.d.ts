import { type ExplorerSidebarPanel } from './ExplorerPanelRef';
export declare const ExplorerPanel: React.FC<{
    readOnlyStudio: boolean;
    initialPanel: ExplorerSidebarPanel | null;
    onCompositionSelected: (() => void) | null;
}>;
