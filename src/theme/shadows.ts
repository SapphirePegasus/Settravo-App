/**
 * src/theme/shadows.ts
 *
 * Elevation tokens split by platform.
 * iOS uses shadow* props. Android uses elevation.
 * Never mix — always spread the full token object.
 *
 * Usage:
 *   import { shadows } from '@/theme';
 *   <View style={[styles.card, shadows.mid]} />
 */

import { Platform, ViewStyle } from 'react-native';

type ShadowToken = Pick<
    ViewStyle,
    | 'shadowColor'
    | 'shadowOffset'
    | 'shadowOpacity'
    | 'shadowRadius'
    | 'elevation'
>;

const buildShadow = (
    iosConfig: { offsetY: number; opacity: number; radius: number },
    androidElevation: number,
): ShadowToken =>
    Platform.select({
        ios: {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: iosConfig.offsetY },
            shadowOpacity: iosConfig.opacity,
            shadowRadius: iosConfig.radius,
        },
        android: {
            elevation: androidElevation,
        },
        default: {},
    }) as ShadowToken;

export const shadows = {
    /** Subtle lift — list items, inline cards */
    low: buildShadow({ offsetY: 1, opacity: 0.05, radius: 3 }, 2),

    /** Standard card elevation */
    mid: buildShadow({ offsetY: 2, opacity: 0.08, radius: 8 }, 4),

    /** Modal sheets, FAB, bottom sheets */
    high: buildShadow({ offsetY: 4, opacity: 0.12, radius: 16 }, 8),
} as const;