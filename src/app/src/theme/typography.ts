/**
 * src/theme/typography.ts
 *
 * Typography scale using system fonts only.
 * No external font package — avoids font loading complexity and asset size.
 *
 * Usage in components:
 *   import { typography } from '@/theme';
 *   <Text style={[typography.heading, { color: colors.text }]}>Hello</Text>
 */

import { Platform, TextStyle } from 'react-native';

// Platform-aware system font family
const systemFont = Platform.select({
    ios: { fontFamily: 'System' },
    android: { fontFamily: 'Roboto' },
    default: {},
});

/**
 * All entries return a partial TextStyle — only font properties.
 * Color is always supplied by the component to respect theming.
 */
export const typography = {
    /** 40/48 weight 800 — hero balance numbers, large display figures */
    display: {
        ...systemFont,
        fontSize: 40,
        fontWeight: '800' as TextStyle['fontWeight'],
        lineHeight: 48,
        letterSpacing: -1,
    },

    /** 24/32 weight 700 — screen headings */
    heading: {
        ...systemFont,
        fontSize: 24,
        fontWeight: '700' as TextStyle['fontWeight'],
        lineHeight: 32,
        letterSpacing: -0.5,
    },

    /** 18/24 weight 600 — section titles, card headings */
    title: {
        ...systemFont,
        fontSize: 18,
        fontWeight: '600' as TextStyle['fontWeight'],
        lineHeight: 24,
        letterSpacing: -0.3,
    },

    /** 15/22 weight 400 — default body copy */
    body: {
        ...systemFont,
        fontSize: 15,
        fontWeight: '400' as TextStyle['fontWeight'],
        lineHeight: 22,
        letterSpacing: 0,
    },

    /** 15/22 weight 500 — medium-weight body (names, labels inside cards) */
    bodyMd: {
        ...systemFont,
        fontSize: 15,
        fontWeight: '500' as TextStyle['fontWeight'],
        lineHeight: 22,
        letterSpacing: 0,
    },

    /** 13/18 weight 400 — secondary text, timestamps, captions */
    caption: {
        ...systemFont,
        fontSize: 13,
        fontWeight: '400' as TextStyle['fontWeight'],
        lineHeight: 18,
        letterSpacing: 0,
    },

    /** 11/16 weight 600 — ALL CAPS section labels, overline text */
    label: {
        ...systemFont,
        fontSize: 11,
        fontWeight: '600' as TextStyle['fontWeight'],
        lineHeight: 16,
        letterSpacing: 0.8,
        textTransform: 'uppercase' as TextStyle['textTransform'],
    },

    /** 15/22 weight 500 — monetary amounts, join codes (tabular numerals) */
    mono: {
        ...systemFont,
        fontSize: 15,
        fontWeight: '500' as TextStyle['fontWeight'],
        lineHeight: 22,
        letterSpacing: 0,
        fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },

    /** 22/28 weight 700 — large monetary amounts on cards */
    monoLg: {
        ...systemFont,
        fontSize: 22,
        fontWeight: '700' as TextStyle['fontWeight'],
        lineHeight: 28,
        letterSpacing: -0.3,
        fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },
} as const;