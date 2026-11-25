import type { ComponentDimensions } from './component-drag-data';
import { type ElementAsset, type ElementDependency, type ElementDragData, type ElementInitialProps, type ElementInstallationMode } from './element-drag-data';
export type CreateElementPayloadInput = {
    readonly assets?: readonly ElementAsset[];
    readonly displayName: string;
    readonly slug: string;
    readonly sourceCode: string;
    readonly dependencies: readonly ElementDependency[];
    readonly dimensions: ComponentDimensions | null;
    readonly durationInFrames: number;
    readonly initialProps?: ElementInitialProps | null;
    readonly installationMode?: ElementInstallationMode;
    readonly isCaptionStyle?: boolean;
};
export type StudioElementPayload = ElementDragData & {
    readonly durationInFrames: number;
};
export declare const createElementPayload: (input: CreateElementPayloadInput) => StudioElementPayload;
export declare const parseStudioElementPayload: (value: unknown) => StudioElementPayload | null;
