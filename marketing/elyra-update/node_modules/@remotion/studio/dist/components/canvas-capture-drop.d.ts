import type { SetSelectedModalContextType } from '../state/modals';
export declare const handleCanvasCaptureDrop: ({ files, setSelectedModal, }: {
    readonly files: readonly File[];
    readonly setSelectedModal: SetSelectedModalContextType['setSelectedModal'];
}) => Promise<boolean>;
