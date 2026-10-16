import chokidar from 'chokidar';

import {
  absoluteClientDataRoot,
  absoluteClientHooksRoot,
  absoluteFarcasterAnalyticsRoot,
  absoluteFarcasterCryptographyReactNativeRoot,
  absoluteFarcasterCryptographyRoot,
  absoluteFarcasterCryptographyWebRoot,
  absoluteFarcasterExpoRoot,
} from './config';
import {
  publishClientData,
  publishClientHooks,
  publishFarcasterAnalytics,
  publishFarcasterCryptography,
  publishFarcasterCryptographyReactNative,
  publishFarcasterCryptographyWeb,
  publishFarcasterExpo,
} from './helpers';

// Web imports these packages from their compiled `dist` (or `lib`) output.
// Analytics and cryptography have to exist before client-hooks typechecks,
// and cryptography-web has to exist before Vite can resolve it.
publishFarcasterAnalytics();
publishFarcasterCryptography();
publishFarcasterCryptographyWeb();
publishClientData();
publishClientHooks();
publishFarcasterCryptographyReactNative();
publishFarcasterExpo();

chokidar
  .watch(`${absoluteFarcasterAnalyticsRoot}/src/**/*`)
  .on('change', () => {
    publishFarcasterAnalytics();
  });

chokidar
  .watch(`${absoluteFarcasterCryptographyWebRoot}/src/**/*`)
  .on('change', () => {
    publishFarcasterCryptographyWeb();
  });

chokidar.watch(`${absoluteClientDataRoot}/src/**/*`).on('change', () => {
  publishClientData();
});

chokidar.watch(`${absoluteClientHooksRoot}/src/**/*`).on('change', () => {
  publishClientHooks();
});

chokidar
  .watch(`${absoluteFarcasterCryptographyRoot}/src/**/*`)
  .on('change', () => {
    publishFarcasterCryptography();
  });

chokidar
  .watch(`${absoluteFarcasterCryptographyReactNativeRoot}/src/**/*`)
  .on('change', () => {
    publishFarcasterCryptographyReactNative();
  });

chokidar.watch(`${absoluteFarcasterExpoRoot}/src/**/*`).on('change', () => {
  publishFarcasterExpo();
});
