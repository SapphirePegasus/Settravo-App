/**
 * src/hooks/useThemeMode.ts
 *
 * 4-mode theme system:
 *   'light'    — always light
 *   'dark'     — always dark
 *   'daynight' — auto: light 05:00–17:00, dark 17:00–05:00 (local time)
 *   'system'   — follows device OS setting
 *
 * Architecture:
 *   - This hook is mounted ONCE in root _layout.tsx via ThemeProvider.
 *   - Result is consumed via useThemeContext() — never call this hook in screens.
 *   - The daynight tick runs every 60 seconds and is cleaned up on unmount.
 *   - Preference is persisted to SecureStore encrypted storage.
 *
 * SecureStore note (SDK 55):
 *   setItemAsync / getItemAsync — async, returns Promise<void> / Promise<string|null>
 *   Key chars: alphanumeric, '.', '-', '_' only.
 */

import { useCallback, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── Constants ───────────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'daynight' | 'system';
export type ResolvedMode = 'light' | 'dark';

const STORE_KEY = 'settravo.theme_preference';
const DAY_START_HOUR = 5;   // 05:00 local
const DAY_END_HOUR = 17;  // 17:00 local
const TICK_INTERVAL_MS = 60_000; // re-evaluate every 60 seconds

const DEFAULT_PREFERENCE: ThemePreference = 'daynight'; // per spec: new user default

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDaytime(): boolean {
    const hour = new Date().getHours();
    return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

function isValidPreference(value: unknown): value is ThemePreference {
    return (
        value === 'light' ||
        value === 'dark' ||
        value === 'daynight' ||
        value === 'system'
    );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export type UseThemeModeReturn = {
    /** The resolved display mode (always 'light' or 'dark') */
    mode: ResolvedMode;
    /** The raw user preference (what is stored) */
    preference: ThemePreference;
    /** Persist a new preference and immediately re-resolve mode */
    setPreference: (pref: ThemePreference) => Promise<void>;
    /** True until the stored preference has been read from SecureStore */
    isLoading: boolean;
};

export function useThemeMode(): UseThemeModeReturn {
    const systemColorScheme = useColorScheme(); // 'light' | 'dark' | null | undefined
    const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
    const [isLoading, setIsLoading] = useState(true);
    const [tick, setTick] = useState(0); // used to re-trigger mode resolution on timer

    // ── Load persisted preference on mount ─────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const stored = await SecureStore.getItemAsync(STORE_KEY);
                if (!cancelled && isValidPreference(stored)) {
                    setPreferenceState(stored);
                }
            } catch {
                // SecureStore unavailable (e.g. simulator with no keychain) — use default
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    // ── Day/night 60-second tick ────────────────────────────────────────────────
    useEffect(() => {
        if (preference !== 'daynight') return;

        const id = setInterval(() => {
            setTick((n) => n + 1);
        }, TICK_INTERVAL_MS);

        return () => clearInterval(id);
    }, [preference]);

    // ── Resolve the actual mode ─────────────────────────────────────────────────
    // tick is a dependency so daynight re-evaluates every 60s
    const mode: ResolvedMode = (() => {
        void tick; // register tick as dependency

        switch (preference) {
            case 'light':
                return 'light';
            case 'dark':
                return 'dark';
            case 'daynight':
                return isDaytime() ? 'light' : 'dark';
            case 'system':
                return systemColorScheme === 'dark' ? 'dark' : 'light';
        }
    })();

    // ── Persist preference ──────────────────────────────────────────────────────
    const setPreference = useCallback(async (pref: ThemePreference): Promise<void> => {
        setPreferenceState(pref);
        try {
            await SecureStore.setItemAsync(STORE_KEY, pref);
        } catch {
            // Storage failure is non-fatal — preference is still applied in memory
        }
    }, []);

    return { mode, preference, setPreference, isLoading };
}