// metro.config.js
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Force Hermes-compatible transform profile on all files including node_modules.
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