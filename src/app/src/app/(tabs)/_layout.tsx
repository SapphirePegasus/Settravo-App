/**
 * app/(tabs)/_layout.tsx
 *
 * Bottom tab navigator — 5 items with center FAB.
 *
 * Tab structure (per spec):
 *   Home | Groups | [+] | Activity | Statistics
 *
 * Center [+] tab:
 *   - Does NOT navigate to a screen.
 *   - Intercepts tabPress and shows FABSheet instead.
 *   - FABSheet is rendered here so it persists across tab changes.
 *
 * Feature flags:
 *   - TAB_GROUPS, TAB_ACTIVITY, TAB_STATISTICS gate their tabs.
 *   - Home tab is always present.
 *
 * Icon set: expo-symbols (SF Symbols on iOS, Material on Android).
 * Already part of Expo SDK 55 — no new package needed.
 *
 * Tab bar styling:
 *   - background: colors.surface
 *   - active tint: colors.accent
 *   - inactive tint: colors.icon
 *   - border-top: 1px colors.separator
 */

import { Tabs, useRouter, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURES } from '@/config/features';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FABSheet } from '@/components/modals/FABSheet';
import { spacing, radii, shadows } from '@/theme';

// ─── Tab icon renderer ────────────────────────────────────────────────────────
// Using text emoji + label as a zero-dep icon approach.
// Replace with SymbolView from expo-symbols in Phase E if desired.

type TabIconProps = {
    emoji: string;
    label: string;
    focused: boolean;
    color: string;
};

function TabIcon({ emoji, label, focused, color }: TabIconProps) {
    return (
        <View style={styles.tabIconContainer}>
            <Text style={styles.tabEmoji}>{emoji}</Text>
            <Text style={[styles.tabLabel, { color }]}>
                {label}
            </Text>
        </View>
    );
}

// ─── Center FAB button ────────────────────────────────────────────────────────

type FABButtonProps = {
    onPress: () => void;
    accentColor: string;
};

function FABButton({ onPress, accentColor }: FABButtonProps) {
    return (
        <Pressable
            style={({ pressed }) => [
                styles.fab,
                { backgroundColor: accentColor },
                pressed && styles.fabPressed,
            ]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Create new group or expense"
        >
            <Text style={styles.fabIcon}>+</Text>
        </Pressable>
    );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pathname = usePathname();

    const [fabVisible, setFabVisible] = useState(false);

    const handleFabPress = useCallback(() => {
        setFabVisible(true);
    }, []);

    const handleFabDismiss = useCallback(() => {
        setFabVisible(false);
    }, []);

    const handleCreateGroup = useCallback(() => {
        setFabVisible(false);
        router.push('/(trip)/create');
    }, [router]);

    const handleCreateExpense = useCallback((tripId: string) => {
        setFabVisible(false);
        router.push(`/(trip)/${tripId}/add-expense`);
    }, [router]);

    // Determine if we're inside a trip — FAB can bypass group picker
    // (pathname pattern: /(trip)/[tripId]/*)
    const tripIdMatch = pathname.match(/\/\(trip\)\/([^/]+)/);
    const currentTripId = tripIdMatch?.[1] ?? null;

    return (
        <>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: colors.accent,
                    tabBarInactiveTintColor: colors.icon,
                    tabBarStyle: {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.separator,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        height: 56 + insets.bottom,
                        paddingBottom: insets.bottom,
                    },
                    tabBarShowLabel: false,
                }}
            >
                {/* ── Home ──────────────────────────────────────────────── */}
                <Tabs.Screen
                    name="index"
                    options={{
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon emoji="🏠" label="Home" focused={focused} color={color} />
                        ),
                        tabBarAccessibilityLabel: 'Home tab',
                    }}
                />

                {/* ── Groups ────────────────────────────────────────────── */}
                {FEATURES.TAB_GROUPS && (
                    <Tabs.Screen
                        name="groups"
                        options={{
                            tabBarIcon: ({ focused, color }) => (
                                <TabIcon emoji="👥" label="Groups" focused={focused} color={color} />
                            ),
                            tabBarAccessibilityLabel: 'Groups tab',
                        }}
                    />
                )}

                {/* ── Center FAB placeholder ────────────────────────────── */}
                {/* This tab screen never renders a real page — tabPress is
                    intercepted below to show FABSheet instead. */}
                <Tabs.Screen
                    name="_fab"
                    listeners={{
                        tabPress: (e) => {
                            e.preventDefault();
                            // If inside a trip, skip group picker and go direct
                            if (currentTripId) {
                                router.push(`/(trip)/${currentTripId}/add-expense`);
                            } else {
                                handleFabPress();
                            }
                        },
                    }}
                    options={{
                        tabBarButton: () => (
                            <FABButton
                                onPress={handleFabPress}
                                accentColor={colors.accent}
                            />
                        ),
                        tabBarAccessibilityLabel: 'Create new',
                    }}
                />

                {/* ── Activity ──────────────────────────────────────────── */}
                {FEATURES.TAB_ACTIVITY && (
                    <Tabs.Screen
                        name="activity"
                        options={{
                            tabBarIcon: ({ focused, color }) => (
                                <TabIcon emoji="📋" label="Activity" focused={focused} color={color} />
                            ),
                            tabBarAccessibilityLabel: 'Activity tab',
                        }}
                    />
                )}

                {/* ── Statistics ────────────────────────────────────────── */}
                {FEATURES.TAB_STATISTICS && (
                    <Tabs.Screen
                        name="statistics"
                        options={{
                            tabBarIcon: ({ focused, color }) => (
                                <TabIcon emoji="📊" label="Stats" focused={focused} color={color} />
                            ),
                            tabBarAccessibilityLabel: 'Statistics tab',
                        }}
                    />
                )}

                {/* ── Profile — hidden from tab bar, accessible via header ── */}
                <Tabs.Screen
                    name="profile"
                    options={{ href: null }} // removes from tab bar; navigated to via router
                />
            </Tabs>

            {/* FAB sheet — rendered outside Tabs so it overlays all tabs */}
            <FABSheet
                visible={fabVisible}
                onDismiss={handleFabDismiss}
                onCreateGroup={handleCreateGroup}
                onCreateExpense={handleCreateExpense}
            />
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    tabIconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: spacing.xs,
        gap: 2,
    },
    tabEmoji: {
        fontSize: 20,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '500',
    },
    fab: {
        width: 52,
        height: 52,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xs,
        ...shadows.high,
    },
    fabPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.95 }],
    },
    fabIcon: {
        fontSize: 28,
        fontWeight: '300',
        color: '#FFFFFF',
        lineHeight: 32,
    },
});