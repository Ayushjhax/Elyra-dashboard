import type { StudioElementPayload } from './element-payload';
export declare const setStudioDragData: ({ dataTransfer, payload, }: {
    readonly dataTransfer: Pick<DataTransfer, 'effectAllowed' | 'setData'>;
    readonly payload: StudioElementPayload;
}) => void;
