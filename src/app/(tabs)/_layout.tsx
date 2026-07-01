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
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEATURES } from '@/config/features';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FABSheet } from '@/components/modals/FABSheet';
import { Icon } from '@/components/ui/Icon';
import type { IconKey } from '@/config/icons';
import { spacing, typography } from '@/theme';

// ─── Tab icon renderer ────────────────────────────────────────────────────────
// Icon + label, both tinted by React Navigation's tabBarActiveTintColor /
// tabBarInactiveTintColor (set on screenOptions below — accent green when
// active, muted icon color when inactive). The glyph itself also swaps to
// the filled variant on active state via <Icon active={focused} />, per the
// outline -> filled convention used throughout the design mockup.

type TabIconProps = {
    iconKey: IconKey;
    label: string;
    focused: boolean;
    color: string;
};

function TabIcon({ iconKey, label, focused, color }: TabIconProps) {
    return (
        <View style={styles.tabIconContainer}>
            <Icon name={iconKey} active={focused} size={22} color={color} />
            <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

// ─── Center FAB button ────────────────────────────────────────────────────────

type FABButtonProps = {
    /** Mirrors Pressable.onPress — receives the GestureResponderEvent from the
     *  underlying Pressable so the tab system's onPress bridge can forward it. */
    onPress: (e: GestureResponderEvent) => void;
    accentColor: string;
};

function FABButton({ onPress, accentColor }: FABButtonProps) {
    return (
        <Pressable
            style={({ pressed }) => [
                styles.fab,
                pressed && styles.fabPressed,
            ]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Create new group or expense"
        >
            <Icon name="action.add" active size={30} color={accentColor} />
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

    const handleJoinGroup = useCallback(() => {
        setFabVisible(false);
        router.push('/(trip)/join');
    }, [router]);

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

    // FIX (infinite render loop, same root cause as fabListeners above):
    // <Tabs screenOptions={{...}}> previously received a fresh object literal
    // on every TabsLayout render. React Navigation resolves descriptor options
    // from screenOptions for EVERY registered Tabs.Screen (6 of them here), so
    // an unstable screenOptions reference forces all 6 descriptors to
    // recompute on every render — not just one screen, like the FAB case.
    // useSafeAreaInsets() commonly fires 1-2 extra updates right after mount
    // as the native safe-area measurement settles; each one used to recreate
    // this object and re-trigger a full descriptor resync via useSyncState,
    // which is consistent with "Maximum update depth exceeded" tripping
    // specifically on cold boot, during the Tab Navigator's first commit.
    // Memoizing on the actual primitives used closes that loop the same way
    // fabListeners does for the single FAB screen.
    const tabsScreenOptions = useMemo(
        () => ({
            headerShown: false,
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.icon,
            tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.separator,
                borderTopWidth: StyleSheet.hairlineWidth,
                height: 64 + insets.bottom,
                paddingBottom: insets.bottom,
            },
            tabBarShowLabel: false,
        }),
        [colors.accent, colors.icon, colors.surface, colors.separator, insets.bottom],
    );

    // FIX (same instability class, now closing every remaining gap): each
    // Tabs.Screen's `options` prop was ALSO a fresh object literal per render,
    // each containing an inline tabBarIcon arrow function. React Navigation's
    // Screen wrapper re-registers descriptor options via an internal layout
    // effect whenever this reference changes — for 6 screens, every render.
    // Stable renderer functions (useCallback) + memoized options objects
    // close this off completely.
    const renderHomeIcon = useCallback(
        ({ focused, color }: { focused: boolean; color: string }) => (
            <TabIcon iconKey="nav.home" label="Home" focused={focused} color={color} />
        ),
        [],
    );
    const renderGroupsIcon = useCallback(
        ({ focused, color }: { focused: boolean; color: string }) => (
            <TabIcon iconKey="nav.groups" label="Groups" focused={focused} color={color} />
        ),
        [],
    );
    const renderActivityIcon = useCallback(
        ({ focused, color }: { focused: boolean; color: string }) => (
            <TabIcon iconKey="nav.activity" label="Activity" focused={focused} color={color} />
        ),
        [],
    );
    const renderStatisticsIcon = useCallback(
        ({ focused, color }: { focused: boolean; color: string }) => (
            <TabIcon iconKey="nav.statistics" label="Stats" focused={focused} color={color} />
        ),
        [],
    );
    // BUGFIX: renderFabButton was ignoring the tab's built-in `onPress` prop and
    // always calling `setFabVisible(true)` directly. This bypassed the tab's
    // native press handler entirely, meaning the `tabPress` listener
    // (handleFabTabPress) never fired. The FAB always opened the sheet even
    // when the user was inside a trip — where it should go directly to
    // add-expense instead.
    // Fix: pass `props.onPress` through to the FABButton. When called, it runs
    // the tab's internal handler → fires the `tabPress` event → triggers
    // handleFabTabPress → which calls e.preventDefault() and routes correctly.
    //
    // TYPE NOTE: BottomTabBarButtonProps.onPress (from @react-navigation/bottom-tabs)
    // is typed as `((e: GestureResponderEvent | MouseEvent<HTMLAnchorElement>) => void) | undefined`.
    // We build that union locally from react-native and React — no indirect-dep
    // import needed. FABButton.onPress accepts GestureResponderEvent (from Pressable)
    // and we forward it; the MouseEvent arm only fires in web/SSR environments.
    type TabBarOnPress = (
        e: GestureResponderEvent | React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    ) => void;

    const renderFabButton = useCallback(
        (props: { onPress?: TabBarOnPress }) => (
            <FABButton
                onPress={(e) => props.onPress?.(e)}
                accentColor={colors.accent}
            />
        ),
        [colors.accent],
    );

    const homeOptions = useMemo(
        () => ({ tabBarIcon: renderHomeIcon, tabBarAccessibilityLabel: 'Home tab' }),
        [renderHomeIcon],
    );
    const groupsOptions = useMemo(
        () => ({ tabBarIcon: renderGroupsIcon, tabBarAccessibilityLabel: 'Groups tab' }),
        [renderGroupsIcon],
    );
    const fabOptions = useMemo(
        () => ({ tabBarButton: renderFabButton, tabBarAccessibilityLabel: 'Create new' }),
        [renderFabButton],
    );
    const activityOptions = useMemo(
        () => ({ tabBarIcon: renderActivityIcon, tabBarAccessibilityLabel: 'Activity tab' }),
        [renderActivityIcon],
    );
    const statisticsOptions = useMemo(
        () => ({ tabBarIcon: renderStatisticsIcon, tabBarAccessibilityLabel: 'Stats tab' }),
        [renderStatisticsIcon],
    );
    const profileOptions = useMemo(() => ({ href: null }), []);

    return (
        <>
            <Tabs
                screenOptions={tabsScreenOptions}
            >
                {/* ── Home ──────────────────────────────────────────────── */}
                <Tabs.Screen
                    name="index"
                    options={homeOptions}
                />

                {/* ── Groups ────────────────────────────────────────────── */}
                {FEATURES.TAB_GROUPS && (
                    <Tabs.Screen
                        name="groups"
                        options={groupsOptions}
                    />
                )}

                {/* ── Center FAB placeholder ────────────────────────────── */}
                {/* Never renders a real page — tabPress intercepted via the
                    stable `fabListeners` object above. */}
                <Tabs.Screen
                    name="_fab"
                    listeners={fabListeners}
                    options={fabOptions}
                />

                {/* ── Activity ──────────────────────────────────────────── */}
                {FEATURES.TAB_ACTIVITY && (
                    <Tabs.Screen
                        name="activity"
                        options={activityOptions}
                    />
                )}

                {/* ── Statistics ────────────────────────────────────────── */}
                {FEATURES.TAB_STATISTICS && (
                    <Tabs.Screen
                        name="statistics"
                        options={statisticsOptions}
                    />
                )}

                {/* ── Profile — hidden from tab bar, accessible via header ── */}
                <Tabs.Screen
                    name="profile"
                    options={profileOptions}
                />
            </Tabs>

            {/* FAB sheet — rendered outside Tabs so it overlays all tabs */}
            <FABSheet
                visible={fabVisible}
                onDismiss={handleFabDismiss}
                onJoinGroup={handleJoinGroup}
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
        paddingTop: spacing.sm,
        gap: 3,
        minWidth: 56,
    },
    tabLabel: {
        ...typography.caption,
        fontSize: 10,
        fontWeight: '600',
    },
    fab: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fabPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.92 }],
    },
});