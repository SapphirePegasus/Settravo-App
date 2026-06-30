/**
 * src/theme/assets.ts
 *
 * Single source of truth for all static asset require() paths.
 * Components NEVER call require() inline — they import from here.
 *
 * Asset placement:
 *   assets/images/onboardbg.png  — onboarding full-bleed background
 *   assets/images/daybg.png      — dashboard day hero (05:00–17:00)
 *   assets/images/nightbg.png    — dashboard night hero (17:00–05:00)
 *   assets/images/logo.png       — existing app logo
 *
 * NOTE: These files must exist at build time.
 * Placeholder images should be committed so the build doesn't fail before
 * final assets are ready. Replace PNGs at any time — no code change needed.
 */

export const AppAssets = {
    onboardBg: require('../../assets/images/onboardbg.png'),
    dayBg: require('../../assets/images/daybg.png'),
    nightBg: require('../../assets/images/nightbg.png'),
    logo: require('../../assets/images/logo.png'),
} as const;