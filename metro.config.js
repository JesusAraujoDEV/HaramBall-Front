const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// `src/crypto/sodium.ts` guards `require('libsodium-wrappers-sumo')` behind a
// `Platform.OS === 'web'` check, but Metro bundles both branches statically.
// On native that pulls in `libsodium-sumo`, which references Node core
// modules (`node:fs`, `node:path`, …) via a code path that never executes at
// runtime. Resolve those Node builtins to an empty module so the native
// bundle builds; the web bundle uses the real WASM implementation as before.
const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'crypto',
  'stream',
  'util',
  'os',
  'vm',
]);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const bare = moduleName.startsWith('node:') ? moduleName.slice('node:'.length) : moduleName;
  if (platform !== 'web' && (moduleName.startsWith('node:') || NODE_BUILTINS.has(bare))) {
    return { type: 'empty' };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
