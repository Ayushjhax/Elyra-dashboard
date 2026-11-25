import React from 'react';
import { orderOutlinesForRendering } from './selected-outline-order';
export { orderOutlinesForRendering };
export { applySelectedOutlineTransformOriginAxisLock, compensateTranslateForTransformOrigin, getSelectedOutline3DRotationDragValues, getSelectedOutlineActiveSchema, getSelectedOutlineCropDragChanges, getSelectedOutlineCropDragValues, getSelectedOutlineCropFollowingTransformOrigin, getSelectedOutlineRotationDragChanges, getSelectedOutlineRotationDragStates, getSelectedOutlineRotationDragValues, getSelectedOutlineScaleDragChanges, getSelectedOutlineScaleDragStates, getSelectedOutlineScaleDragValues, getSelectedOutlineScaleEdgeInfo, getSelectedOutlineTransformOriginDragChanges, getSelectedOutlineTransformOriginLockedAxis, selectedOutlineTransformOriginSnapThresholdPx, selectedOutlineUvSnapThresholdPx, snapSelectedOutlineRotationDeltaDegrees, snapSelectedOutlineTransformOriginUv, snapSelectedOutlineUv, } from './selected-outline-drag';
export { getOutlineSelectionInteraction, getSelectedCropInfo, getSelectedEffectFieldsBySequenceKey, getSelectedOutlineRotationCornerInfo, getSelectedOutlineRotationDeltaDegrees, getSelectedOutlineRotationPivot, getSelectedSequenceKeys, getTransformedSvgViewportPoints, } from './selected-outline-measurement';
export type { SelectedOutlineDragState, SelectedOutlineRotationDragState, SelectedOutlineScaleDragState, } from './selected-outline-types';
type SelectedOutlineOverlayProps = {
    readonly canvasHovered: boolean;
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly scale: number;
};
export declare const SelectedOutlineOverlay: React.NamedExoticComponent<SelectedOutlineOverlayProps>;
