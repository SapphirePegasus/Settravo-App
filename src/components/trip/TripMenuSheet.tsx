/**
 * TripMenuSheet.tsx
 *
 * Bottom-sheet action menu accessible via the ⋯ header button on the
 * trip detail screen. Groups all secondary trip-level actions:
 *  - Share expense list   (all members)
 *  - Edit trip            (creator only)
 *  - Leave trip           (non-creator members)
 *
 * Uses Modal + Animated (no new dependency).
 */

import { useEffect, useRef } from 'react';
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
import { useThemeColors } from '../../hooks/useThemeColors';

interface Action {
    label: string;
    icon: string;
    variant?: 'default' | 'destructive';
    onPress: () => void;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    actions: Action[];
}

export function TripMenuSheet({ visible, onClose, actions }: Props) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(300)).current;
    const scrimOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0, useNativeDriver: true,
                    bounciness: 2, speed: 16,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 1, duration: 180, useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 300, duration: 220,
                    easing: Easing.in(Easing.ease), useNativeDriver: true,
                }),
                Animated.timing(scrimOpacity, {
                    toValue: 0, duration: 180, useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, translateY, scrimOpacity]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            <Animated.View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: colors.card,
                        paddingBottom: insets.bottom + 8,
                        transform: [{ translateY }],
                    },
                ]}
            >
                <View style={[styles.handle, { backgroundColor: colors.handleBar }]} />

                {actions.map((action, i) => (
                    <Pressable
                        key={i}
                        style={({ pressed }) => [
                            styles.actionRow,
                            { borderTopColor: colors.separator },
                            i > 0 && styles.divider,
                            pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => {
                            onClose();
                            // Small delay so sheet closes before the action fires
                            setTimeout(action.onPress, 160);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                    >
                        <Text style={styles.actionIcon}>{action.icon}</Text>
                        <Text
                            style={[
                                styles.actionLabel,
                                {
                                    color:
                                        action.variant === 'destructive'
                                            ? colors.accentDestructive
                                            : colors.text,
                                },
                            ]}
                        >
                            {action.label}
                        </Text>
                    </Pressable>
                ))}
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 8,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
            },
            android: { elevation: 10 },
        }),
    },
    handle: {
        width: 36, height: 4, borderRadius: 2,
        alignSelf: 'center', marginBottom: 8,
    },
    actionRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: 14, paddingVertical: 16, paddingHorizontal: 20,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth },
    actionIcon: { fontSize: 20, width: 28, textAlign: 'center' },
    actionLabel: { fontSize: 17 },
});