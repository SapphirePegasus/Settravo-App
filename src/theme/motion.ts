/**
 * src/theme/motion.ts
 *
 * Animation duration and easing constants.
 * Compatible with react-native-reanimated (already installed in Expo SDK 55).
 *
 * Usage:
 *   import { motion } from '@/theme';
 *   withTiming(1, { duration: motion.duration.normal, easing: motion.easing.standard })
 */

import { Easing } from 'react-native-reanimated';

export const motion = {
    duration: {
        /** 150ms — micro-interactions: button press state, toggle */
        fast: 150,
        /** 250ms — element transitions: card expand, sheet open start */
        normal: 250,
        /** 400ms — screen-level transitions, hero entrances */
        slow: 400,
    },

    easing: {
        /**
         * Standard — general-purpose curve.
         * Accelerates at start, decelerates at end. Natural feel.
         */
        standard: Easing.bezier(0.4, 0.0, 0.2, 1),

        /**
         * Decelerate — elements entering the screen.
         * Starts fast (already in motion), slows to rest.
         */
        decelerate: Easing.bezier(0.0, 0.0, 0.2, 1),

        /**
         * Accelerate — elements leaving the screen.
         * Starts slow, builds to full speed before exit.
         */
        accelerate: Easing.bezier(0.4, 0.0, 1.0, 1),
    },
} as const;