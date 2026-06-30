/**
 * app/(tabs)/_layout.tsx
 *
 * Bottom tab navigator — 5 items with center FAB.
 *
 * BUGFIX (infinite render loop):
 *   Root cause: the `_fab` Tabs.Screen received an inline `listeners={{ tabPress: ... }}`
 *   object literal, recreated on every render. React Navigation treats a new
 *   listeners object as a change requiring re-subscription, which triggers
 *   useSyncState's forceStoreRerender → re-renders TabsLayout → new listeners
 *   object again → infinite loop ("Maximum update depth exceeded").
 *   Compounding factor: usePathname() subscribes to navigation state and was
 *   read at the top of the component body purely to compute currentTripId,
 *   causing an extra re-render on every navigation event for no benefit since
 *   that value is only needed inside the tabPress handler itself.
 *
 * Fix:
 *   - tabPress listener is now a stable useCallback, not an inline closure.
 *   - currentTripId is resolved via useSegments() — read once per the
 *     handler's own closure, not subscribed to at the top of the component.
 *   - listeners prop now references the stable function, never a new object
 *     per render (wrapped via useMemo so the object identity itself is stable).
 */

import { Tabs, useRouter, useSegments } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURES } from '@/config/features';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FABSheet } from '@/components/modals/FABSheet';
import { spacing, radii, shadows } from '@/theme';

// ─── Tab icon renderer ────────────────────────────────────────────────────────

type TabIconProps = {
    emoji: string;
    label: string;
    focused: boolean;
    color: string;
};

function TabIcon({ emoji, label, color }: TabIconProps) {
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
    // useSegments() returns a stable array reference per route — does NOT
    // cause the re-subscription churn that usePathname() at top-level did.
    const segments = useSegments();

    const [fabVisible, setFabVisible] = useState(false);

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

    // Stable tabPress handler — resolves currentTripId from segments at call
    // time, not at render time. Never recreated unless `segments` or `router`
    // actually change (and even then, this function itself doesn't subscribe
    // to anything — segments is just read, not watched).
    const handleFabTabPress = useCallback((e: { preventDefault: () => void }) => {
        e.preventDefault();
        const tripGroupIndex = segments.indexOf('(trip)' as never);
        const currentTripId =
            tripGroupIndex >= 0 ? (segments[tripGroupIndex + 1] as string | undefined) : undefined;

        if (currentTripId) {
            router.push(`/(trip)/${currentTripId}/add-expense`);
        } else {
            setFabVisible(true);
        }
    }, [segments, router]);

    // Stable listeners object identity — only changes when the handler itself
    // changes (which is now rare, per the useCallback above). This is the
    // actual fix: React Navigation never sees a "new" listeners object on
    // every render, so it never re-subscribes, so it never re-renders us.
    const fabListeners = useMemo(
        () => ({ tabPress: handleFabTabPress }),
        [handleFabTabPress],
    );

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
                {/* Never renders a real page — tabPress intercepted via the
                    stable `fabListeners` object above. */}
                <Tabs.Screen
                    name="_fab"
                    listeners={fabListeners}
                    options={{
                        tabBarButton: () => (
                            <FABButton
                                onPress={() => setFabVisible(true)}
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
                    options={{ href: null }}
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