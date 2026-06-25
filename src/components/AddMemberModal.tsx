/**
 * AddMemberModal.tsx
 *
 * Sheet modal for adding a guest member by name.
 * The creator types a name; a guest member row with device_id=null is created.
 * When that person installs the app and joins with the code, their row is claimed.
 */
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView, Platform,
    Pressable,
    StyleSheet,
    Text, TextInput,
    View,
} from 'react-native';
import { ZodError } from 'zod';
import { AddGuestMemberSchema } from '../validation/schemas';

interface Props {
    isDark: boolean;
    onClose: () => void;
    onAdd: (name: string) => Promise<void>;
}

export function AddMemberModal({ isDark, onClose, onAdd }: Props) {
    const colors = isDark ? dark : light;
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAdd() {
        setError(null);
        try {
            // Validate just the name field
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
            style={[styles.root, { backgroundColor: colors.bg }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.handleBar}>
                <View style={[styles.handle, { backgroundColor: colors.handle }]} />
            </View>
            <View style={styles.content}>
                <Text style={[styles.heading, { color: colors.text }]}>Add Member</Text>
                <Text style={[styles.sub, { color: colors.subText }]}>
                    They don't need the app yet. You can share their personal link later.
                </Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: error ? colors.error : colors.border }]}
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
                />
                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
                <View style={styles.buttons}>
                    <Pressable style={[styles.cancelButton, { backgroundColor: colors.cardBg }]} onPress={onClose} disabled={loading}>
                        <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.addButton, { backgroundColor: colors.accent, opacity: loading ? 0.7 : 1 }]} onPress={handleAdd} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>Add</Text>}
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
    content: { padding: 24, paddingTop: 16 },
    heading: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
    sub: { fontSize: 14, lineHeight: 20, marginBottom: 24, color: '#8e8e93' },
    input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, marginBottom: 8 },
    errorText: { fontSize: 13, marginBottom: 8 },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    cancelButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 16, fontWeight: '500' },
    addButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    addText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const light = { bg: '#f2f2f7', text: '#000000', subText: '#6c6c70', inputBg: '#ffffff', border: '#c6c6c8', placeholder: '#8e8e93', accent: '#007aff', error: '#ff3b30', handle: '#c6c6c8', cardBg: '#ffffff' };
const dark = { bg: '#1c1c1e', text: '#ffffff', subText: '#8e8e93', inputBg: '#2c2c2e', border: '#38383a', placeholder: '#636366', accent: '#0a84ff', error: '#ff453a', handle: '#48484a', cardBg: '#2c2c2e' };