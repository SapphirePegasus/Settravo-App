/**
 * SyncStatusBanner.tsx
 *
 * Makes the offline queue VISIBLE. Mounted once in the root layout, floats
 * above the tab bar. Three states:
 *
 *  1. Offline with pending changes  → "3 changes will sync when you're online"
 *  2. Online + replaying            → "Syncing 3 changes…"
 *  3. Dead-lettered items exist     → "1 change failed to sync" + tap to
 *     expand a sheet listing each failed item with Retry / Discard.
 *
 * Before Phase 3 a permanently-failed expense vanished silently — the single
 * worst trust-breaker a money app can have. Now every failure is visible,
 * explainable, and actionable.
 *
 * Rendering rules:
 *  - Nothing to say → renders null (zero layout cost).
 *  - Never overlaps money actions: bottom-anchored, respects safe area.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '../hooks/useThemeColors';
import { useConnectionStore } from '../stores/connectionStore';
import { useTripStore } from '../stores/tripStore';
import type { DeadLetterItem } from '../types/domain';
import { OFFLINE_MAX_RETRIES } from '../types/domain';
import { formatRupees } from '../utils/money';
import { spacing, typography, radii, shadows } from '@/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeItem(item: DeadLetterItem): string {
    switch (item.type) {
        case 'ADD_EXPENSE':
            return `Add "${item.payload.title}" (${formatRupees(item.payload.amountMoney)})`;
        case 'EDIT_EXPENSE':
            return `Edit "${item.payload.title ?? 'expense'}"`;
        case 'DELETE_EXPENSE':
            return 'Delete an expense';
        case 'SETTLE_PAIR':
            return item.payload.settled ? 'Mark a payment as settled' : 'Undo a settlement';
        default:
            return 'Pending change';
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncStatusBanner() {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();

    const networkOnline = useConnectionStore((s) => s.networkOnline);
    const isSyncing = useConnectionStore((s) => s.isSyncing);
    const offlineQueue = useTripStore((s) => s.offlineQueue);
    const deadLetterQueue = useTripStore((s) => s.deadLetterQueue);
    const retryDeadLetterItem = useTripStore((s) => s.retryDeadLetterItem);
    const discardDeadLetterItem = useTripStore((s) => s.discardDeadLetterItem);

    const [sheetOpen, setSheetOpen] = useState(false);

    const banner = useMemo(() => {
        if (deadLetterQueue.length > 0) {
            const n = deadLetterQueue.length;
            return {
                kind: 'failed' as const,
                text: `${n} change${n === 1 ? '' : 's'} failed to sync — tap to review`,
            };
        }
        if (offlineQueue.length > 0 && !networkOnline) {
            const n = offlineQueue.length;
            return {
                kind: 'pending' as const,
                text: `${n} change${n === 1 ? '' : 's'} will sync when you're back online`,
            };
        }
        if (offlineQueue.length > 0 && isSyncing) {
            const n = offlineQueue.length;
            return {
                kind: 'syncing' as const,
                text: `Syncing ${n} change${n === 1 ? '' : 's'}…`,
            };
        }
        return null;
    }, [deadLetterQueue.length, offlineQueue.length, networkOnline, isSyncing]);

    if (!banner) return null;

    const bg =
        banner.kind === 'failed' ? colors.owe :
            banner.kind === 'syncing' ? colors.accent :
                colors.textSecondary;

    return (
        <>
            <Pressable
                onPress={() => banner.kind === 'failed' && setSheetOpen(true)}
                style={[
                    styles.banner,
                    { backgroundColor: bg, bottom: insets.bottom + 64 },
                    shadows.low,
                ]}
                accessibilityRole={banner.kind === 'failed' ? 'button' : 'text'}
                accessibilityLabel={banner.text}
            >
                <Text style={[typography.caption, { color: colors.textInverse, fontWeight: '600' }]}>
                    {banner.text}
                </Text>
            </Pressable>

            {/* ── Failed-items sheet ─────────────────────────────────────── */}
            <Modal
                visible={sheetOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setSheetOpen(false)}
            >
                <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
                <View style={[
                    styles.sheet,
                    { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.lg },
                ]}>
                    <Text style={[typography.bodyMd, { color: colors.text, fontWeight: '600', marginBottom: spacing.xs }]}>
                        Changes that couldn't sync
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                        These were tried {OFFLINE_MAX_RETRIES} times without success. Retry them, or discard
                        if they're no longer needed.
                    </Text>

                    <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                        {deadLetterQueue.map((item) => (
                            <View
                                key={item.localId}
                                style={[styles.failedRow, { borderColor: colors.cardBorder }]}
                            >
                                <View style={styles.failedInfo}>
                                    <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
                                        {describeItem(item)}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                                        {item.failureReason}
                                    </Text>
                                </View>
                                <View style={styles.failedActions}>
                                    <Pressable
                                        onPress={() => retryDeadLetterItem(item.localId)}
                                        style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Retry this change"
                                    >
                                        <Text style={[typography.caption, { color: colors.textInverse, fontWeight: '600' }]}>
                                            Retry
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => {
                                            void discardDeadLetterItem(item.localId);
                                            if (deadLetterQueue.length === 1) setSheetOpen(false);
                                        }}
                                        style={[styles.actionBtn, { backgroundColor: colors.surface }]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Discard this change"
                                    >
                                        <Text style={[typography.caption, { color: colors.owe, fontWeight: '600' }]}>
                                            Discard
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        alignSelf: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.full,
        maxWidth: '90%',
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        borderTopLeftRadius: radii.lg,
        borderTopRightRadius: radii.lg,
        padding: spacing.lg,
        maxHeight: '70%',
    },
    sheetList: { flexGrow: 0 },
    failedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    failedInfo: { flex: 1 },
    failedActions: { flexDirection: 'row', gap: spacing.sm },
    actionBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
    },
});