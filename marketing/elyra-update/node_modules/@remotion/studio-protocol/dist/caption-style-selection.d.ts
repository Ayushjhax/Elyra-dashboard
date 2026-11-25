import * as z from 'zod/mini';
declare const captionStyleSelectionSchema: z.ZodMiniNullable<z.ZodMiniObject<{
    slug: z.ZodMiniString<string>;
    origin: z.ZodMiniString<string>;
}, z.core.$strip>>;
export type StudioCaptionStyleSelection = z.infer<typeof captionStyleSelectionSchema>;
export declare const isStudioProtocolCaptionStyleSubscription: (value: unknown) => boolean;
export declare const parseStudioProtocolCaptionStyleSelection: (value: unknown) => {
    operation: "caption-style-selection";
    protocol: "remotion-studio-protocol";
    protocolVersion: 1;
    selection: {
        slug: string;
        origin: string;
    } | null;
} | null;
export {};
