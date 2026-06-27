/**
 * AppErrorBoundary.tsx
 *
 * Class-based React error boundary wrapping the entire app.
 * Catches render-phase errors that escape try/catch (pure component throws,
 * null dereferences, etc.) and renders a recoverable error screen instead
 * of a blank white screen.
 *
 * Place this as the outermost wrapper in _layout.tsx.
 *
 * Sentry integration: componentDidCatch forwards the error and component
 * stack to Sentry automatically via the wrapped export.
 */

import * as Sentry from '@sentry/react-native';
import React from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class AppErrorBoundaryInner extends React.Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        Sentry.captureException(error, {
            extra: { componentStack: info.componentStack },
        });
    }

    private handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        {this.state.error?.message ?? 'An unexpected error occurred.'}
                    </Text>
                    <Pressable
                        style={styles.retryButton}
                        onPress={this.handleReset}
                        accessibilityRole="button"
                        accessibilityLabel="Tap to restart"
                    >
                        <Text style={styles.retryText}>Tap to restart</Text>
                    </Pressable>
                </View>
            );
        }
        return this.props.children;
    }
}

export { AppErrorBoundaryInner as AppErrorBoundary };

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#000',
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        color: '#8e8e93',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 20,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#1c1c1e',
        borderRadius: 10,
    },
    retryText: {
        color: '#0a84ff',
        fontSize: 16,
        fontWeight: '500',
    },
});