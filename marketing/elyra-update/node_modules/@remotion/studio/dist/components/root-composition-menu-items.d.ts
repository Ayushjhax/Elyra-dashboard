import type { SetStateAction } from 'react';
import type { PreviewServerConnectionState } from '../helpers/preview-server-events';
import type { CompositionSortOrder } from '../state/folders';
import type { ModalState } from '../state/modals';
import type { ComboboxValue } from './NewComposition/ComboBox';
export declare const getRootCompositionMenuItems: ({ connectionStatus, readOnlyStudio, setSelectedModal, compositionSortOrder, setCompositionSortOrder, }: {
    connectionStatus: PreviewServerConnectionState['type'];
    readOnlyStudio: boolean;
    setSelectedModal: (value: SetStateAction<ModalState | null>) => void;
    compositionSortOrder: CompositionSortOrder;
    setCompositionSortOrder: (sortOrder: CompositionSortOrder) => void;
}) => ComboboxValue[];
