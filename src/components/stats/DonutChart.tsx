/**
 * DonutChart.tsx
 *
 * Animated SVG donut for the Statistics screen (mockup D.12: donut with
 * center total + category legend).
 *
 * Implementation notes:
 *  - Each segment is a Circle with strokeDasharray = [segmentLength, gap]
 *    rotated into place via strokeDashoffset. Sweep is animated with
 *    Reanimated's useAnimatedProps on strokeDashoffset — the same
 *    AnimatedComponent-at-module-scope rule as elsewhere in the app.
 *  - Pure integer paise in, formatting handled by the caller.
 *  - Zero-value segments are dropped; a single-segment donut renders as a
 *    full ring. Empty data renders a muted track ring only.
 *  - No external chart library: react-native-svg + reanimated are already
 *    dependencies. A charting package would be ~300KB for one donut.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, {
    Easing,
    useAnimatedProps,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '../../hooks/useThemeColors';
import { typography } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutSegment {
    key: string;
    /** Integer paise. Non-positive segments are dropped. */
    value: number;
    color: string;
}

interface DonutChartProps {
    segments: DonutSegment[];
    /** Outer diameter in px. */
    size?: number;
    strokeWidth?: number;
    /** Center label lines (e.g. formatted total + caption). */
    centerPrimary: string;
    centerSecondary?: string;
}

interface SegmentArcProps {
    circumference: number;
    radius: number;
    strokeWidth: number;
    color: string;
    /** Fraction of the circle this segment covers (0–1). */
    fraction: number;
    /** Fraction of the circle before this segment starts (0–1). */
    startFraction: number;
    index: number;
}

function SegmentArc({
    circumference,
    radius,
    strokeWidth,
    color,
    fraction,
    startFraction,
    index,
}: SegmentArcProps) {
    // Animate the sweep from 0 to its final arc length.
    const sweep = useSharedValue(0);

    useEffect(() => {
        sweep.value = withDelay(
            120 + index * 90,
            withTiming(fraction, { duration: 650, easing: Easing.out(Easing.cubic) }),
        );
    }, [fraction, index, sweep]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDasharray: [
            Math.max(sweep.value * circumference, 0.001),
            circumference,
        ] as unknown as string,
    }));

    return (
        <AnimatedCircle
            cx={0}
            cy={0}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            fill="none"
            animatedProps={animatedProps}
            // Rotate the segment to its start position. SVG dash starts at
            // 3 o'clock; the parent <G> rotates -90° so 0 = 12 o'clock.
            transform={`rotate(${startFraction * 360})`}
        />
    );
}

export function DonutChart({
    segments,
    size = 190,
    strokeWidth = 26,
    centerPrimary,
    centerSecondary,
}: DonutChartProps) {
    const colors = useThemeColors();

    const visible = segments.filter((s) => s.value > 0);
    const total = visible.reduce((sum, s) => sum + s.value, 0);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    let acc = 0;
    const arcs = visible.map((s, i) => {
        const fraction = s.value / total;
        const arc = (
            <SegmentArc
                key={s.key}
                circumference={circumference}
                radius={radius}
                strokeWidth={strokeWidth}
                color={s.color}
                fraction={fraction}
                startFraction={acc}
                index={i}
            />
        );
        acc += fraction;
        return arc;
    });

    return (
        <View
            style={[styles.wrap, { width: size, height: size }]}
            accessibilityRole="image"
            accessibilityLabel={`Spending donut chart. ${centerPrimary}${centerSecondary ? `, ${centerSecondary}` : ''}`}
        >
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G x={size / 2} y={size / 2} rotation={-90}>
                    {/* Muted full-track ring (also the empty state) */}
                    <Circle
                        cx={0}
                        cy={0}
                        r={radius}
                        stroke={colors.separator}
                        strokeWidth={strokeWidth}
                        fill="none"
                    />
                    {total > 0 && arcs}
                </G>
            </Svg>
            <View style={styles.center} pointerEvents="none">
                <Text
                    style={[typography.title, { color: colors.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                >
                    {centerPrimary}
                </Text>
                {centerSecondary ? (
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        {centerSecondary}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
});