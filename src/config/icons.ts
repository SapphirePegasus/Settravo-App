/**
 * src/config/icons.ts
 *
 * Single source of truth for every icon glyph used in the app.
 *
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Icons are never hardcoded inline as raw `<Ionicons name="..." />` calls
 * and never as emoji characters. Every icon is requested by a SEMANTIC KEY
 * (e.g. `nav.home`, `category.food`) through the `<Icon />` component
 * (src/components/ui/Icon.tsx), which looks up the real glyph name here.
 *
 * This means:
 *   1. To try a different glyph while testing, change ONE line in this file.
 *      No component or screen code needs to be touched.
 *   2. Every icon has both an `active` and `inactive` variant. Ionicons ships
 *      matched outline/filled pairs (e.g. "home-outline" / "home") which is
 *      the standard cross-platform pattern for selected vs. unselected state.
 *      Icons with no meaningful "selected" state repeat the same name.
 *   3. Swapping icon LIBRARIES later only touches this file + Icon.tsx.
 *
 * ICON SET
 * ---------------------------------------------------------------------------
 * Uses Ionicons from `@expo/vector-icons`, bundled inside `expo` (no new dep).
 * Reference: https://docs.expo.dev/versions/v55.0.0/sdk/vector-icons/
 */

import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type IconFamily = 'ionicons';

export type IconDefinition = {
    family: IconFamily;
    active: IoniconName;
    inactive: IoniconName;
};

function def(active: IoniconName, inactive: IoniconName = active): IconDefinition {
    return { family: 'ionicons', active, inactive };
}

export const ICONS = {
    // ── Bottom tab bar ───────────────────────────────────────────────────
    nav: {
        home: def('home', 'home-outline'),
        groups: def('people', 'people-outline'),
        activity: def('time', 'time-outline'),
        statistics: def('stats-chart', 'stats-chart-outline'),
        profile: def('person-circle', 'person-circle-outline'),
        // Contextual nav helpers
        place: def('location-outline'),
        calendar: def('calendar-outline'),
    },

    // ── Header / chrome ─────────────────────────────────────────────────
    header: {
        menu: def('menu-outline'),
        notifications: def('notifications', 'notifications-outline'),
        back: def('chevron-back'),
        forward: def('chevron-forward'),
        close: def('close'),
        more: def('ellipsis-horizontal'),
        search: def('search-outline'),
    },

    // ── Expense categories (screens 6 + 11 chips / bars) ────────────────
    // Keys match ExpenseCategory domain type values.
    // 'misc' maps to the 'others' key intentionally — "Others" is the
    // display label in the mockup (screen 6), while the domain stores 'misc'.
    category: {
        food: def('fast-food', 'fast-food-outline'),
        transport: def('car', 'car-outline'),
        stay: def('bed', 'bed-outline'),
        others: def('ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'),
    },

    // ── Trip tile illustrations (fallback when no cover photo) ───────────
    // 8-element pool; TripCard hashes the trip ID mod 8 to pick one.
    // Change any glyph here to try different looks without touching TripCard.
    tripTile: {
        adventure: def('compass-outline'),
        nature: def('leaf-outline'),
        beach: def('umbrella-outline'),
        mountain: def('snow-outline'),
        city: def('business-outline'),
        food: def('cafe-outline'),
        flight: def('airplane-outline'),
        map: def('map-outline'),
    },

    // ── Generic actions ──────────────────────────────────────────────────
    action: {
        add: def('add-circle', 'add-circle-outline'),
        edit: def('create-outline'),
        delete: def('trash-outline'),
        share: def('share-social-outline'),
        send: def('send-outline'),
        camera: def('camera-outline'),
        image: def('image-outline'),
        qrCode: def('qr-code-outline'),
        refresh: def('refresh-outline'),
        check: def('checkmark-outline'),
        checkCircle: def('checkmark-circle', 'checkmark-circle-outline'),
        copy: def('copy-outline'),
        logOut: def('log-out-outline'),
        chooseEmoji: def('happy-outline'),
        close: def('close'),
        leave: def('exit-outline'),
        markPaid: def('checkmark-done-outline'),
    },

    // ── Money / settlement semantics ─────────────────────────────────────
    money: {
        wallet: def('wallet-outline'),
        cash: def('cash-outline'),
        card: def('card-outline'),
        pieChart: def('pie-chart-outline'),
        receipt: def('receipt-outline'),
        settle: def('swap-horizontal-outline'),
    },

    // ── Theme / preference rows (profile screen) ─────────────────────────
    theme: {
        day: def('sunny-outline'),
        night: def('moon-outline'),
        auto: def('contrast-outline'),
        device: def('phone-portrait-outline'),
    },

    // ── Status / feedback ─────────────────────────────────────────────────
    status: {
        warning: def('warning-outline'),
        info: def('information-circle-outline'),
        empty: def('file-tray-outline'),
        syncing: def('hourglass-outline'),
        celebration: def('sparkles-outline'),
        offline: def('cloud-offline-outline'),
        guest: def('person-outline'),
    },
} as const;

type IconGroups = typeof ICONS;
export type IconKey = {
    [G in keyof IconGroups]: `${G & string}.${keyof IconGroups[G] & string}`;
}[keyof IconGroups];

/**
 * Resolves a dotted key (e.g. "nav.home") to its IconDefinition.
 * Throws in development if the key doesn't resolve.
 */
export function resolveIcon(key: IconKey): IconDefinition {
    const [group, name] = key.split('.') as [keyof IconGroups, string];
    const groupObj = ICONS[group] as Record<string, IconDefinition> | undefined;
    const found = groupObj?.[name];

    if (!found) {
        if (__DEV__) {
            throw new Error(`[icons] Unknown icon key "${key}". Check src/config/icons.ts.`);
        }
        return { family: 'ionicons', active: 'help-circle-outline', inactive: 'help-circle-outline' };
    }
    return found;
}

/**
 * Trip tile icon pool — ordered list of tripTile keys used by TripCard
 * to deterministically pick a fallback illustration from the trip ID hash.
 * Change order or swap keys here to try different tile looks.
 */
export const TRIP_TILE_POOL: IconKey[] = [
    'tripTile.adventure',
    'tripTile.beach',
    'tripTile.nature',
    'tripTile.city',
    'tripTile.mountain',
    'tripTile.flight',
    'tripTile.food',
    'tripTile.map',
];

/** Picks a tile icon deterministically from a trip ID string. */
export function getTripTileIcon(tripId: string): IconKey {
    let hash = 0;
    for (let i = 0; i < tripId.length; i++) {
        hash = tripId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TRIP_TILE_POOL[Math.abs(hash) % TRIP_TILE_POOL.length];
}

/**
 * Maps ExpenseCategory domain values to their icon registry key.
 * 'misc' → 'category.others' because the design labels this chip "Others".
 */
export const CATEGORY_ICON_MAP: Record<string, IconKey> = {
    food: 'category.food',
    transport: 'category.transport',
    stay: 'category.stay',
    misc: 'category.others',
} as const;