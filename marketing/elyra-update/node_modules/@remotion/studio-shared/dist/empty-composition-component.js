"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyCompositionComponent = void 0;
const emptyCompositionComponent = (componentName) => {
    return `import React from 'react';

export const ${componentName}: React.FC = () => {
	return null;
};
`;
};
exports.emptyCompositionComponent = emptyCompositionComponent;
