/**
 * src/hooks/useAccentColor.ts
 *
 * Manages the user's accent color preference.
 *
 * Returns the full accent token set for the active preset so that
 * useThemeColors() can inject them into the color scheme.
 *
 * Architecture:
 *   - Mounted ONCE via ThemeProvider in root _layout.tsx.
 *   - Do NOT call directly in screens — consume via useThemeContext().
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
    AccentPreset,
    DEFAULT_ACCENT_ID,
    getAccentPreset,
} from '@/theme/presets';

const STORE_KEY = 'settravo.accent_color';

export type UseAccentColorReturn = {
    /** Full preset object for the active accent */
    preset: AccentPreset;
    /** The ID of the currently active preset */
    accentId: string;
    /** Persist a new accent ID and immediately apply it */
    setAccent: (id: string) => Promise<void>;
    /** True until initial value is read from SecureStore */
    isLoading: boolean;
};

export function useAccentColor(): UseAccentColorReturn {
    const [accentId, setAccentIdState] = useState<string>(DEFAULT_ACCENT_ID);
    const [isLoading, setIsLoading] = useState(true);

    // ── Load persisted accent on mount ─────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const stored = await SecureStore.getItemAsync(STORE_KEY);
                if (!cancelled && stored) {
                    // getAccentPreset falls back to default if ID is unknown — safe
                    setAccentIdState(getAccentPreset(stored).id);
                }
            } catch {
                // Non-fatal — default accent is used
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    // ── Persist accent preference ───────────────────────────────────────────────
    const setAccent = useCallback(async (id: string): Promise<void> => {
        const preset = getAccentPreset(id);
        setAccentIdState(preset.id);
        try {
            await SecureStore.setItemAsync(STORE_KEY, preset.id);
        } catch {
            // Non-fatal
        }
    }, []);

    // getAccentPreset() does an array .find() — the AccentPreset objects it
    // returns ARE stable (ACCENT_PRESETS is a module-level const), but calling
    // .find() fresh on every render plus wrapping it in a new return object
    // literal still breaks ThemeContext's `value` memoization downstream (see
    // useThemeMode.ts FIX comment for the full failure chain). Memoize both.
    const preset = useMemo(() => getAccentPreset(accentId), [accentId]);

    return useMemo<UseAccentColorReturn>(
        () => ({ preset, accentId, setAccent, isLoading }),
        [preset, accentId, setAccent, isLoading],
    );
}