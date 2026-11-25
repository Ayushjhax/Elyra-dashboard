import React from 'react';
import type { CanvasOutline } from './outline-geometry';
export type CanvasOutlinePolygonProps = Omit<React.SVGProps<SVGPolygonElement>, 'ref' | 'children' | 'points' | 'fill' | 'stroke' | 'strokeOpacity' | 'strokeWidth' | 'vectorEffect' | 'pointerEvents' | 'onPointerEnter' | 'onPointerLeave'> & {
    readonly outline: CanvasOutline;
    readonly directlySelected: boolean;
    readonly dragging: boolean;
    readonly visible: boolean;
    readonly interactive: boolean;
    readonly fill: string;
    readonly stroke: string;
    readonly onHoverChange: (key: string | null) => void;
};
/** Shared outline geometry and hover behavior, with editing handlers supplied by the host. */
export declare const CanvasOutlinePolygon: React.NamedExoticComponent<Omit<React.SVGProps<SVGPolygonElement>, "children" | "fill" | "onPointerEnter" | "onPointerLeave" | "pointerEvents" | "points" | "ref" | "stroke" | "strokeOpacity" | "strokeWidth" | "vectorEffect"> & {
    readonly outline: CanvasOutline;
    readonly directlySelected: boolean;
    readonly dragging: boolean;
    readonly visible: boolean;
    readonly interactive: boolean;
    readonly fill: string;
    readonly stroke: string;
    readonly onHoverChange: (key: string | null) => void;
} & React.RefAttributes<SVGPolygonElement>>;
