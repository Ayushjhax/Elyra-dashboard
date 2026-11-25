import type { Guide } from '../state/editor-guides';
export type GuidePointerDownPosition = {
    readonly guideId: string;
    readonly clientX: number;
    readonly clientY: number;
};
export type RulerGuideHighlight = {
    readonly guide: Guide;
    readonly color: string;
};
type SelectedTimelineItem = {
    readonly type: string;
    readonly guideId?: string;
};
export declare const isGuidePointerUpAClick: ({ pointerDownPosition, guideId, clientX, clientY, }: {
    readonly pointerDownPosition: GuidePointerDownPosition | null;
    readonly guideId: string;
    readonly clientX: number;
    readonly clientY: number;
}) => boolean;
export declare const getEditorGuideColor: ({ selected, active, }: {
    readonly selected: boolean;
    readonly active: boolean;
}) => "var(--remotion-studio-blue)" | "var(--remotion-studio-selected-guide)" | "var(--remotion-studio-unselected-guide)";
export declare const getRulerGuideHighlight: ({ guidesList, selectedItems, hoveredGuideId, draggingGuideId, }: {
    readonly guidesList: readonly Guide[];
    readonly selectedItems: readonly SelectedTimelineItem[];
    readonly hoveredGuideId: string | null;
    readonly draggingGuideId: string | null;
}) => RulerGuideHighlight | null;
export {};
