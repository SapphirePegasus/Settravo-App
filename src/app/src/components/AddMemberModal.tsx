/**
 * src/components/AddMemberModal.tsx
 *
 * Sheet modal for adding a guest member by name.
 * Creator types a name → guest member row created with device_id=null.
 * When that person installs the app and joins, their row gets claimed.
 *
 * REFACTOR: removed isDark prop + hardcoded light/dark color consts.
 * All colors from useThemeColors(). isDark kept as deprecated no-op.
 */

import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { ZodError } from 'zod';

import { useThemeColors } from '../hooks/useThemeColors';
import { AddGuestMemberSchema } from '../validation/schemas';
import { spacing, typography, radii } from '@/theme';

interface Props {
    onClose: () => void;
    onAdd: (name: string) => Promise<void>;
    /** @deprecated No longer needed. Remove from call sites. */
    isDark?: boolean;
}

export function AddMemberModal({ onClose, onAdd }: Props) {
    const colors = useThemeColors();

    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAdd() {
        setError(null);
        try {
            AddGuestMemberSchema.shape.displayName.parse(name);
        } catch (err) {
            if (err instanceof ZodError) setError(err.issues[0]?.message ?? 'Invalid name');
            return;
        }
        setLoading(true);
        try {
            await onAdd(name.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add member.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={[styles.root, { backgroundColor: colors.surface }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.handleBar}>
                <View style={[styles.handle, { backgroundColor: colors.separator }]} />
            </View>

            <View style={styles.content}>
                <Text style={[typography.heading, { color: colors.text }]}>Add Member</Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg }]}>
                    They don't need the app yet — you can share their personal link later.
                </Text>

                <TextInput
                    style={[
                        styles.input,
                        {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: error ? colors.danger : colors.cardBorder,
                        },
                    ]}
                    placeholder="Their name"
                    placeholderTextColor={colors.placeholder}
                    value={name}
                    onChangeText={(v) => { setName(v); if (error) setError(null); }}
                    autoFocus
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={50}
                    returnKeyType="done"
                    onSubmitEditing={handleAdd}
                    editable={!loading}
                    accessibilityLabel="Member name"
                />

                {error ? (
                    <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.sm }]}>
                        {error}
                    </Text>
                ) : null}

                <View style={styles.buttons}>
                    <Pressable
                        style={[styles.cancelBtn, { backgroundColor: colors.subSurface }]}
                        onPress={onClose}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                    >
                        <Text style={[typography.bodyMd, { color: colors.textSecondary }]}>Cancel</Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.addBtn,
                            { backgroundColor: colors.accent },
                            loading && styles.disabled,
                        ]}
                        onPress={handleAdd}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel="Add member"
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={[typography.bodyMd, { color: colors.textInverse, fontWeight: '600' }]}>
                                Add
                            </Text>
                        )}
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    handleBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
    handle: { width: 36, height: 4, borderRadius: 2 },
    content: { padding: spacing.lg, paddingTop: spacing.md },
    input: {
        height: 48,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
        marginBottom: spacing.sm,
    },
    buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    cancelBtn: {
        flex: 1, height: 52, borderRadius: radii.md,
        alignItems: 'center', justifyContent: 'center',
    },
    addBtn: {
        flex: 1, height: 52, borderRadius: radii.md,
        alignItems: 'center', justifyContent: 'center',
    },
    disabled: { opacity: 0.5 },
});