import type { ComboboxValue } from './NewComposition/ComboBox';
export declare const getAnnotateWithChatGPTMenuItems: ({ id, getTarget, initialComment, getMetadata, }: {
    readonly id: string;
    readonly getTarget: () => Element | null;
    readonly initialComment: string | null;
    readonly getMetadata: () => Record<string, string | number>;
}) => ComboboxValue[];
