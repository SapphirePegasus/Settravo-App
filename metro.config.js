const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Hermes-compatible transform profile on all files including node_modules.
// This converts dynamic import() calls that Hermes cannot handle at runtime.
config.transformer = {
    ...config.transformer,
    unstable_transformProfile: 'hermes-stable',
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '@opentelemetry/api') {
        return { type: 'empty' };
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;