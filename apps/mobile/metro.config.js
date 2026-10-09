const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Always resolve these from the mobile app's own node_modules so shared workspace packages
// (api-client etc.) never bring a second copy of React / React Query into the bundle.
const PINNED = ['react', 'react-native', '@tanstack/react-query'];
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (PINNED.some((p) => moduleName === p || moduleName.startsWith(`${p}/`))) {
    return (upstream ?? context.resolveRequest)(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform,
    );
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
