// @ts-check
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

/* ---------------------------------------------------------------------------
   Metro, for an app that lives inside the website's repo.

   The app imports the shared pure modules in ../lib through the `@/` alias
   (tsconfig.json). Metro therefore watches ../lib — only lib, never the
   whole repo with its .next and node_modules — and resolves packages from
   this app's own node_modules when a shared module's own lookup finds none
   (an EAS build has no website node_modules).

   resolveRequest carries the package-exports workarounds from Privy's React
   Native installation guide.
--------------------------------------------------------------------------- */

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), path.join(repoRoot, "lib")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];

/** @type {NonNullable<typeof config.resolver.resolveRequest>} */
function resolveRequestWithPackageExports(context, moduleName, platform) {
  /* Package exports in `isows` (a viem dependency) are incompatible. */
  if (moduleName === "isows") {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  /* Package exports in zustand point React Native at a build it cannot run. */
  if (moduleName.startsWith("zustand")) {
    return context.resolveRequest({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  /* jose's package exports are incompatible; its browser build works. */
  if (moduleName === "jose") {
    return context.resolveRequest({ ...context, unstable_conditionNames: ["browser"] }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}

config.resolver.resolveRequest = resolveRequestWithPackageExports;

module.exports = config;
