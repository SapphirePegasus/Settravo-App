/**
 * colors.ts
 *
 * Single source of truth for all colour tokens in Settravo.
 * Every screen and component must import from here — never define
 * inline light/dark objects locally.
 *
 * Token naming convention:
 *  bg           → root screen background
 *  bgSecondary  → slightly elevated surface (grouped table bg)
 *  card         → card / list-row surface
 *  cardElevated → card sitting on top of another card
 *  text         → primary label text
 *  textSecondary→ secondary label (slightly dimmed)
 *  subText      → tertiary / caption text
 *  accent       → interactive tint (buttons, links)
 *  accentDestructive → red (delete, leave)
 *  accentSuccess → green (settled, success state)
 *  accentWarning → amber (offline, pending sync)
 *  separator    → hairline dividers
 *  inputBg      → TextInput fill
 *  inputBorder  → TextInput border (resting)
 *  placeholder  → TextInput placeholder text
 *  pendingSync  → isPendingSync badge colour
 *  handleBar    → bottom-sheet drag handle
 *  settled      → "all settled" celebration colour
 *  warningBg    → offline banner background
 *  warningText  → offline banner text
 *  border       → alias for inputBorder (legacy compat)
 *  error        → validation error text / border
 *  buttonBg     → primary filled button background
 *
 * Values follow Apple Human Interface Guidelines system palette so the
 * app looks native on iOS and consistent on Android.
 */

export const Colors = {
    light: {
        bg: '#f2f2f7',
        bgSecondary: '#ffffff',
        card: '#ffffff',
        cardElevated: '#f2f2f7',
        text: '#000000',
        textSecondary: '#3c3c43',
        subText: '#6c6c70',
        accent: '#007aff',
        accentDestructive: '#ff3b30',
        accentSuccess: '#34c759',
        accentWarning: '#ff9500',
        separator: '#c6c6c8',
        inputBg: '#ffffff',
        inputBorder: '#c6c6c8',
        placeholder: '#8e8e93',
        pendingSync: '#ff9500',
        handleBar: '#c6c6c8',
        settled: '#34c759',
        warningBg: '#fff3cd',
        warningText: '#856404',
        // Legacy aliases kept for backward compat during migration
        border: '#c6c6c8',
        error: '#ff3b30',
        buttonBg: '#007aff',
        headerBg: '#e8e8ed',
        emojiBox: '#f2f2f7',
    },
    dark: {
        bg: '#000000',
        bgSecondary: '#1c1c1e',
        card: '#1c1c1e',
        cardElevated: '#2c2c2e',
        text: '#ffffff',
        textSecondary: '#ebebf5',
        subText: '#8e8e93',
        accent: '#0a84ff',
        accentDestructive: '#ff453a',
        accentSuccess: '#30d158',
        accentWarning: '#ff9f0a',
        separator: '#38383a',
        inputBg: '#1c1c1e',
        inputBorder: '#38383a',
        placeholder: '#636366',
        pendingSync: '#ff9f0a',
        handleBar: '#48484a',
        settled: '#30d158',
        warningBg: '#3a2e00',
        warningText: '#ffd60a',
        // Legacy aliases
        border: '#38383a',
        error: '#ff453a',
        buttonBg: '#0a84ff',
        headerBg: '#1c1c1e',
        emojiBox: '#2c2c2e',
    },
} as const;