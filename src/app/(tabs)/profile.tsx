/**
 * app/(tabs)/profile.tsx — Profile Screen (D.13)
 *
 * Sections:
 *   1. Hero — accent background, large avatar, display name + edit inline
 *   2. Preferences — Theme, Accent Color
 *   3. Account — Invite, Clear Data, Log Out
 *   4. Footer — App version + device ID tail
 *
 * All emoji removed from THEME_OPTIONS labels and settings rows.
 * Chevron ›  replaced with <Icon name="header.forward" />.
 * Check ✓    replaced with <Icon name="action.check" />.
 * Theme option icons replaced with <Icon name="theme.*" />.
 */

import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../../components/ui/Avatar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Divider } from '../../components/ui/Divider';
import { Icon } from '../../components/ui/Icon';
import { useThemeContext } from '@/context/ThemeContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../stores/authStore';
import { ACCENT_PRESETS } from '@/theme/presets';
import type { ThemePreference } from '@/hooks/useThemeMode';
import type { IconKey } from '@/config/icons';
import { spacing, typography, radii } from '@/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string; iconKey: IconKey }[] = [
    { value: 'light', label: 'Light', description: 'Always light', iconKey: 'theme.day' },
    { value: 'dark', label: 'Dark', description: 'Always dark', iconKey: 'theme.night' },
    { value: 'daynight', label: 'Day / Night', description: 'Auto: light 5am–5pm', iconKey: 'theme.auto' },
    { value: 'system', label: 'System', description: 'Follow device setting', iconKey: 'theme.device' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettingsRow({
    label,
    value,
    onPress,
    destructive = false,
}: {
    label: string;
    value?: string;
    onPress: () => void;
    destructive?: boolean;
}) {
    const colors = useThemeColors();
    return (
        <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Text style={[typography.body, { color: destructive ? colors.danger : colors.text }]}>
                {label}
            </Text>
            {value ? (
                <View style={styles.rowRight}>
                    <Text style={[typography.body, { color: colors.textSecondary }]}>{value}</Text>
                    <Icon name="header.forward" size={16} color={colors.icon} />
                </View>
            ) : (
                <Icon name="header.forward" size={16} color={colors.icon} />
            )}
        </Pressable>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
    const colors = useThemeColors();
    const { preference, setPreference, accentId, setAccent } = useThemeContext();

    const deviceUser = useAuthStore((s) => s.deviceUser);
    const setDisplayName = useAuthStore((s) => s.setDisplayName);

    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(deviceUser?.displayName ?? '');
    const [savingName, setSavingName] = useState(false);
    const [themeSheetVisible, setThemeSheetVisible] = useState(false);
    const [colorSheetVisible, setColorSheetVisible] = useState(false);

    const deviceId = deviceUser?.id ?? '';
    const deviceIdTail = deviceId.length > 8 ? deviceId.slice(-8) : deviceId;
    const appVersion = '1.0.0';

    const handleSaveName = useCallback(async () => {
        const trimmed = nameInput.trim();
        if (!trimmed || trimmed === deviceUser?.displayName) {
            setEditingName(false);
            return;
        }
        setSavingName(true);
        try {
            await setDisplayName(trimmed);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
            setNameInput(deviceUser?.displayName ?? '');
        } finally {
            setSavingName(false);
            setEditingName(false);
        }
    }, [nameInput, deviceUser?.displayName, setDisplayName]);

    const handleThemeSelect = useCallback(async (pref: ThemePreference) => {
        await setPreference(pref);
        setThemeSheetVisible(false);
        await Haptics.selectionAsync();
    }, [setPreference]);

    const handleAccentSelect = useCallback(async (id: string) => {
        await setAccent(id);
        setColorSheetVisible(false);
        await Haptics.selectionAsync();
    }, [setAccent]);

    const handleInvite = useCallback(async () => {
        await Share.share({ message: 'Split bills without the awkward "who owes who" — try Settravo!' });
    }, []);

    const handleClearData = useCallback(() => {
        Alert.alert(
            'Clear Local Data?',
            'This removes all cached data from this device. Your data on Supabase is unaffected.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => { /* TODO */ } },
            ],
        );
    }, []);

    const handleLogOut = useCallback(() => {
        Alert.alert(
            'Log Out?',
            'You will need to re-enter your name. All local data will be cleared.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => { /* TODO */ } },
            ],
        );
    }, []);

    const themeLabel = THEME_OPTIONS.find((t) => t.value === preference)?.label ?? '—';
    const accentPreset = ACCENT_PRESETS.find((p) => p.id === accentId);

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>

                {/* ── Hero ─────────────────────────────────────────────── */}
                <View style={[styles.hero, { backgroundColor: colors.accent }]}>
                    <Avatar name={deviceUser?.displayName ?? '?'} size="xl" />

                    {editingName ? (
                        <View style={styles.nameEditRow}>
                            <TextInput
                                style={[styles.nameInput, { color: colors.textInverse, borderBottomColor: colors.textInverse }]}
                                value={nameInput}
                                onChangeText={setNameInput}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={handleSaveName}
                                maxLength={50}
                                accessibilityLabel="Edit your name"
                            />
                            {savingName ? (
                                <ActivityIndicator color={colors.textInverse} />
                            ) : (
                                <Pressable onPress={handleSaveName} hitSlop={8}>
                                    <Text style={[typography.bodyMd, { color: colors.textInverse }]}>Save</Text>
                                </Pressable>
                            )}
                        </View>
                    ) : (
                        <Pressable
                            onPress={() => { setNameInput(deviceUser?.displayName ?? ''); setEditingName(true); }}
                            hitSlop={8}
                        >
                            <Text style={[typography.title, { color: colors.textInverse, marginTop: spacing.sm }]}>
                                {deviceUser?.displayName ?? 'Set your name'}
                            </Text>
                            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.70)', textAlign: 'center' }]}>
                                Tap to edit
                            </Text>
                        </Pressable>
                    )}
                </View>

                {/* ── Preferences ──────────────────────────────────────── */}
                <View style={[styles.section, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PREFERENCES</Text>
                    <SettingsRow label="Theme" value={themeLabel} onPress={() => setThemeSheetVisible(true)} />
                    <Divider inset />
                    <SettingsRow label="Accent Color" value={accentPreset?.label} onPress={() => setColorSheetVisible(true)} />
                </View>

                {/* ── Account ──────────────────────────────────────────── */}
                <View style={[styles.section, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>
                    <SettingsRow label="Invite Friends" onPress={handleInvite} />
                    <Divider inset />
                    <SettingsRow label="Clear Local Data" onPress={handleClearData} />
                    <Divider inset />
                    <SettingsRow label="Log Out" onPress={handleLogOut} destructive />
                </View>

                {/* ── Footer ───────────────────────────────────────────── */}
                <View style={styles.footer}>
                    <Text style={[typography.caption, { color: colors.textDisabled, textAlign: 'center' }]}>
                        Version {appVersion} · Device {deviceIdTail}
                    </Text>
                </View>
            </ScrollView>

            {/* ── Theme sheet ───────────────────────────────────────────── */}
            <BottomSheet visible={themeSheetVisible} onDismiss={() => setThemeSheetVisible(false)}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Theme</Text>
                {THEME_OPTIONS.map((opt, i) => (
                    <View key={opt.value}>
                        <Pressable
                            style={[
                                styles.sheetOption,
                                preference === opt.value && { backgroundColor: colors.accentLight },
                            ]}
                            onPress={() => handleThemeSelect(opt.value)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: preference === opt.value }}
                        >
                            <Icon
                                name={opt.iconKey}
                                size={22}
                                color={preference === opt.value ? colors.accent : colors.icon}
                            />
                            <View style={styles.sheetOptionText}>
                                <Text style={[typography.bodyMd, { color: colors.text }]}>{opt.label}</Text>
                                <Text style={[typography.caption, { color: colors.textSecondary }]}>{opt.description}</Text>
                            </View>
                            {preference === opt.value && (
                                <Icon name="action.checkCircle" active size={20} color={colors.accent} />
                            )}
                        </Pressable>
                        {i < THEME_OPTIONS.length - 1 && <Divider inset />}
                    </View>
                ))}
            </BottomSheet>

            {/* ── Accent color sheet ────────────────────────────────────── */}
            <BottomSheet visible={colorSheetVisible} onDismiss={() => setColorSheetVisible(false)}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Accent Color</Text>
                <View style={styles.colorGrid}>
                    {ACCENT_PRESETS.map((preset) => {
                        const isSelected = accentId === preset.id;
                        return (
                            <Pressable
                                key={preset.id}
                                style={[
                                    styles.colorPill,
                                    { backgroundColor: preset.accent },
                                    isSelected && styles.colorPillSelected,
                                ]}
                                onPress={() => handleAccentSelect(preset.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: isSelected }}
                                accessibilityLabel={`${preset.label} accent color`}
                            >
                                <Text style={[typography.label, { color: preset.contrast }]}>{preset.label}</Text>
                                {isSelected && (
                                    <Icon name="action.check" size={14} color={preset.contrast} />
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            </BottomSheet>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    hero: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
    },
    nameEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    nameInput: {
        ...typography.title,
        color: '#FFFFFF',
        borderBottomWidth: 1,
        paddingBottom: 4,
        minWidth: 120,
        textAlign: 'center',
    },
    section: {
        marginTop: spacing.md,
        borderRadius: radii.lg,
        marginHorizontal: spacing.md,
        overflow: 'hidden',
    },
    sectionTitle: {
        ...typography.label,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    rowPressed: { opacity: 0.6 },
    footer: {
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
    },
    sheetTitle: {
        ...typography.title,
        marginBottom: spacing.md,
        paddingHorizontal: spacing.xs,
    },
    sheetOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.md,
    },
    sheetOptionText: { flex: 1, gap: 2 },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingBottom: spacing.md,
    },
    colorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radii.full,
        minWidth: 80,
    },
    colorPillSelected: {
        borderWidth: 2.5,
        borderColor: '#FFFFFF',
    },
});