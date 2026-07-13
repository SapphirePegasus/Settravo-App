/**
 * src/components/MenuDrawer.tsx
 *
 * Animated side-drawer that slides in from the left.
 *
 * Triggered by the hamburger (menu) button on the Home screen header.
 * Contains: Profile, Feedback, Help, About — each navigates to its screen.
 *
 * IMPLEMENTATION NOTES
 * ─────────────────────
 * Uses React Native's built-in `Animated` API (zero new packages).
 * Reanimated is in the project but reserved for gesture-driven animations;
 * this drawer is toggle-only (no swipe-to-close), so `Animated` is
 * appropriate and avoids worklet overhead.
 *
 * DESIGN
 * ─────────────────────
 * - Drawer width: DRAWER_WIDTH (280dp) — standard material/iOS drawer width
 * - Animation: spring (natural feel) for open, ease-in timing for close
 * - Scrim: 50% black overlay covering the right side; tapping dismisses
 * - Items rendered in order: Profile (with avatar), Feedback, Help, About
 * - Separator between Profile and the info items
 */

import { useCallback, useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Avatar } from './ui/Avatar';
import { Icon } from './ui/Icon';
import type { IconKey } from '@/config/icons';
import { useAuthStore } from '@/stores/authStore';
import { useThemeColors } from '@/hooks/useThemeColors';
import { spacing, typography, radii } from '@/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 280;

// ─── Menu items ───────────────────────────────────────────────────────────────

interface MenuItem {
    label: string;
    iconKey: IconKey;
    route: string;
    destructive?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
    { label: 'Feedback', iconKey: 'action.edit', route: '/(info)/feedback' },
    { label: 'Help', iconKey: 'status.info', route: '/(info)/help' },
    { label: 'Privacy', iconKey: 'action.copy', route: '/(info)/privacy' },
    { label: 'About', iconKey: 'action.copy', route: '/(info)/about' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface MenuDrawerProps {
    visible: boolean;
    onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MenuDrawer({ visible, onClose }: MenuDrawerProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const deviceUser = useAuthStore((s) => s.deviceUser);

    // Animated values — created once, never recreated.
    const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
    const scrimOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // Open: spring for the drawer (natural deceleration), timing for scrim
            Animated.parallel([
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 0,   // no overshoot — purely decelerative
                    speed: 20,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 0.5,
                    duration: 200,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Close: ease-in for a snappy exit
            Animated.parallel([
                Animated.timing(translateX, {
                    toValue: -DRAWER_WIDTH,
                    duration: 220,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 0,
                    duration: 180,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, translateX, scrimOpacity]);

    const handleNavTo = useCallback((route: string) => {
        onClose();
        // Slight delay so the drawer close animation starts before navigation
        // begins — avoids a visual flash where the new screen appears while
        // the drawer is still mid-animation.
        setTimeout(() => {
            router.push(route as Parameters<typeof router.push>[0]);
        }, 180);
    }, [router, onClose]);

    const handleProfilePress = useCallback(() => {
        onClose();
        setTimeout(() => { router.push('/(tabs)/profile'); }, 180);
    }, [router, onClose]);

    const displayName = deviceUser?.displayName ?? 'You';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"      // we drive the animation ourselves
            statusBarTranslucent      // drawer slides under the status bar
            onRequestClose={onClose}  // Android back button
            accessible={false}
        >
            {/* ── Scrim ──────────────────────────────────────────────── */}
            <Animated.View
                style={[styles.scrim, { opacity: scrimOpacity }]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close menu"
                />
            </Animated.View>

            {/* ── Drawer panel ──────────────────────────────────────── */}
            <Animated.View
                style={[
                    styles.drawer,
                    {
                        backgroundColor: colors.surface,
                        paddingTop: insets.top,
                        paddingBottom: insets.bottom + spacing.lg,
                        transform: [{ translateX }],
                        // Elevation / shadow
                        ...Platform.select({
                            ios: {
                                shadowColor: '#000',
                                shadowOffset: { width: 4, height: 0 },
                                shadowOpacity: 0.18,
                                shadowRadius: 16,
                            },
                            android: { elevation: 16 },
                        }),
                    },
                ]}
                accessibilityViewIsModal
            >
                {/* Profile section */}
                <Pressable
                    style={({ pressed }) => [
                        styles.profileRow,
                        pressed && styles.rowPressed,
                    ]}
                    onPress={handleProfilePress}
                    accessibilityRole="button"
                    accessibilityLabel="Open your profile"
                >
                    <Avatar name={displayName} size="xl" />
                    <View style={styles.profileInfo}>
                        <Text style={[typography.bodyMd, { color: colors.text }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text style={[typography.caption, { color: colors.accent }]}>
                            View Profile
                        </Text>
                    </View>
                    <Icon name="header.forward" size={18} color={colors.icon} />
                </Pressable>

                {/* Separator */}
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />

                {/* Info items */}
                {MENU_ITEMS.map((item) => (
                    <Pressable
                        key={item.label}
                        style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
                        onPress={() => handleNavTo(item.route)}
                        accessibilityRole="menuitem"
                        accessibilityLabel={item.label}
                    >
                        <View style={[styles.iconBox, { backgroundColor: colors.accentLight }]}>
                            <Icon name={item.iconKey} size={20} color={colors.accent} />
                        </View>
                        <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                            {item.label}
                        </Text>
                        <Icon name="header.forward" size={16} color={colors.icon} />
                    </Pressable>
                ))}
            </Animated.View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    drawer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: DRAWER_WIDTH,
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    profileInfo: {
        flex: 1,
        gap: 2,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: spacing.lg,
        marginVertical: spacing.sm,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: radii.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowPressed: { opacity: 0.6 },
});