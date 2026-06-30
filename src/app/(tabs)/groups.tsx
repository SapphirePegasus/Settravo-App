/**
 * app/(tabs)/groups.tsx — Groups Tab — Phase D.3
 *
 * Full flat list of all trips with search filter.
 * No hero. Same TripCard as Dashboard.
 */

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripCard } from '../../components/TripCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTrips } from '../../hooks/useTrips';
import { useTripStore } from '../../stores/tripStore';
import { spacing, typography, radii } from '@/theme';

export default function GroupsScreen() {
    const router = useRouter();
    const colors = useThemeColors();
    const offlineQueue = useTripStore((s) => s.offlineQueue);

    const { trips, isLoading, refresh } = useTrips();
    const [query, setQuery] = useState('');

    const pendingSyncByTrip = useMemo(() => {
        const map: Record<string, number> = {};
        for (const item of offlineQueue) {
            const id =
                item.type === 'ADD_EXPENSE' ? item.payload.tripId :
                    item.type === 'DELETE_EXPENSE' ? item.payload.tripId :
                        item.type === 'EDIT_EXPENSE' ? (item.payload as { tripId?: string }).tripId ?? '' : '';
            if (id) map[id] = (map[id] ?? 0) + 1;
        }
        return map;
    }, [offlineQueue]);

    const filtered = useMemo(() => {
        if (!query.trim()) return trips;
        const lower = query.toLowerCase();
        return trips.filter(
            (t) =>
                t.name.toLowerCase().includes(lower) ||
                (t.destination ?? '').toLowerCase().includes(lower),
        );
    }, [trips, query]);

    const handlePress = useCallback(async (tripId: string) => {
        await Haptics.selectionAsync();
        router.push(`/(trip)/${tripId}`);
    }, [router]);

    const renderItem = useCallback(
        ({ item }: { item: typeof trips[number] }) => (
            <TripCard
                trip={item}
                pendingSyncCount={pendingSyncByTrip[item.id] ?? 0}
                onPress={() => handlePress(item.id)}
            />
        ),
        [pendingSyncByTrip, handlePress],
    );

    return (
        <SafeAreaView
            style={[styles.root, { backgroundColor: colors.bg }]}
            edges={['top', 'left', 'right']}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={[typography.heading, { color: colors.text }]}>Groups</Text>
            </View>

            {/* Search */}
            <View style={[styles.searchRow, { backgroundColor: colors.surface }]}>
                <TextInput
                    style={[
                        styles.searchInput,
                        {
                            backgroundColor: colors.subSurface,
                            color: colors.text,
                            borderColor: colors.cardBorder,
                        },
                    ]}
                    placeholder="Search groups..."
                    placeholderTextColor={colors.placeholder}
                    value={query}
                    onChangeText={setQuery}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search groups"
                />
            </View>

            {/* List */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={[
                    styles.listContent,
                    filtered.length === 0 && styles.listEmpty,
                ]}
                ListEmptyComponent={
                    isLoading ? null : (
                        <EmptyState
                            illustration={query ? '🔍' : '🏕️'}
                            title={query ? 'No groups match' : 'No groups yet'}
                            subtitle={query ? 'Try a different search term.' : 'Create or join a group to get started.'}
                        />
                    )
                }
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={refresh}
                        tintColor={colors.accent}
                        colors={[colors.accent]}
                    />
                }
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
    searchRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    searchInput: {
        height: 44,
        borderRadius: radii.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        ...typography.body,
    },
    listContent: { padding: spacing.md, paddingTop: spacing.sm },
    listEmpty: { flex: 1 },
});