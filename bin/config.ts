import { join, normalize } from 'path';

const absoluteWorkspaceRoot = normalize(`${__dirname}/..`);

const relativeAppsRoot = 'apps';
const relativePackagesRoot = 'packages';

const absoluteAppsRoot = join(absoluteWorkspaceRoot, relativeAppsRoot);
const absolutePackagesRoot = join(absoluteWorkspaceRoot, relativePackagesRoot);

const clientDataPackageName = 'farcaster-client-data';
const relativeClientDataRoot = join(
  relativePackagesRoot,
  clientDataPackageName,
);
const absoluteClientDataRoot = join(
  absoluteWorkspaceRoot,
  relativeClientDataRoot,
);

const clientHooksPackageName = 'farcaster-client-hooks';
const relativeClientHooksRoot = join(
  relativePackagesRoot,
  clientHooksPackageName,
);
const absoluteClientHooksRoot = join(
  absoluteWorkspaceRoot,
  relativeClientHooksRoot,
);

const farcasterAnalyticsPackageName = 'farcaster-analytics';
const relativeFarcasterAnalyticsRoot = join(
  relativePackagesRoot,
  farcasterAnalyticsPackageName,
);
const absoluteFarcasterAnalyticsRoot = join(
  absoluteWorkspaceRoot,
  relativeFarcasterAnalyticsRoot,
);

const farcasterCryptographyPackageName = 'farcaster-cryptography';
const relativeFarcasterCryptographyRoot = join(
  relativePackagesRoot,
  farcasterCryptographyPackageName,
);
const absoluteFarcasterCryptographyRoot = join(
  absoluteWorkspaceRoot,
  relativeFarcasterCryptographyRoot,
);

const farcasterCryptographyWebPackageName = 'farcaster-cryptography-web';
const relativeFarcasterCryptographyWebRoot = join(
  relativePackagesRoot,
  farcasterCryptographyWebPackageName,
);
const absoluteFarcasterCryptographyWebRoot = join(
  absoluteWorkspaceRoot,
  relativeFarcasterCryptographyWebRoot,
);

const farcasterCryptographyReactNativePackageName =
  'farcaster-cryptography-react-native';
const relativeFarcasterCryptographyReactNativeRoot = join(
  relativePackagesRoot,
  farcasterCryptographyReactNativePackageName,
);
const absoluteFarcasterCryptographyReactNativeRoot = join(
  absoluteWorkspaceRoot,
  relativeFarcasterCryptographyReactNativeRoot,
);

const walletPackageName = 'farcaster-wallet';
const relativeWalletRoot = join(relativeAppsRoot, walletPackageName);
const absoluteWalletRoot = join(absoluteWorkspaceRoot, relativeWalletRoot);

const farcasterExpoPackageName = 'farcaster-expo';
const relativeFarcasterExpoRoot = join(
  relativePackagesRoot,
  farcasterExpoPackageName,
);
const absoluteFarcasterExpoRoot = join(
  absoluteWorkspaceRoot,
  relativeFarcasterExpoRoot,
);

const mobileAppName = 'farcaster-mobile';
const relativeMobileRoot = join(relativeAppsRoot, mobileAppName);
const absoluteMobileRoot = join(absoluteWorkspaceRoot, relativeMobileRoot);

export {
  absoluteAppsRoot,
  absoluteClientDataRoot,
  absoluteClientHooksRoot,
  absoluteFarcasterAnalyticsRoot,
  absoluteFarcasterCryptographyReactNativeRoot,
  absoluteFarcasterCryptographyRoot,
  absoluteFarcasterCryptographyWebRoot,
  absoluteFarcasterExpoRoot,
  absoluteMobileRoot,
  absolutePackagesRoot,
  absoluteWalletRoot,
  absoluteWorkspaceRoot,
  clientDataPackageName,
  clientHooksPackageName,
  farcasterAnalyticsPackageName,
  farcasterCryptographyPackageName,
  farcasterCryptographyReactNativePackageName,
  farcasterCryptographyWebPackageName,
  farcasterExpoPackageName,
  relativeClientDataRoot,
  relativeClientHooksRoot,
  relativeFarcasterCryptographyReactNativeRoot,
  relativeFarcasterCryptographyRoot,
  walletPackageName,
};
