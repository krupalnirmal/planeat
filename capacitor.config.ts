import type { CapacitorConfig } from '@capacitor/cli';

/**
 * B18 — "PWA first, Play Store second. Capacitor wrap for Play Store only
 * after the PWA is stable in real use. Same codebase produces both."
 *
 * This file is the config half of that wrap; it does not, by itself, produce
 * an APK. `server.url` points the native shell at the deployed PWA rather
 * than bundling a copy of the web build into the app — the whole point of
 * "same codebase" is that a bug fix ships to both surfaces the moment it is
 * deployed, with no separate native release for a text change.
 *
 * `npx cap add android` has deliberately NOT been run yet: it generates a
 * full native Gradle project (hundreds of files), which is only worth
 * committing once there is a real Android Studio + SDK environment to build
 * and sign it, and only after the PWA has been used for real (D-1xx, see
 * DECISIONS.md). Until then this file is the complete, correct starting
 * point — running the command below is the entire remaining step.
 *
 *   npm install --save-exact @capacitor/android@8.5.0
 *   npx cap add android
 *   npx cap sync android
 *   npx cap open android   # requires Android Studio
 */
const config: CapacitorConfig = {
  appId: 'com.planeat.app',
  appName: 'Planeat',
  webDir: 'public',
  server: {
    // Swap for the production URL before a real release build; kept as
    // localhost only for `npx cap run android` against a dev server.
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    cleartext: process.env.NODE_ENV !== 'production',
  },
  android: {
    // The whole app is already built mobile-first at 390px (R10); nothing
    // here needs a native-specific layout.
    allowMixedContent: false,
  },
};

export default config;
