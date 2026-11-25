// src/studio-entry-points.ts
var getStudioEntryPoints = ({
  fastRefreshRuntime,
  reactScan,
  environmentSetup,
  sequenceStackTraces,
  studioBootstrap,
  userDefinedComponent,
  reactShim,
  studioRenderEntry
}) => [
  fastRefreshRuntime,
  reactScan,
  environmentSetup,
  sequenceStackTraces,
  studioBootstrap,
  userDefinedComponent,
  reactShim,
  studioRenderEntry
].filter(Boolean);
export {
  getStudioEntryPoints
};
