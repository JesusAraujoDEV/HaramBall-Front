import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { logger } from '../utils/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level render-error boundary: catches render errors and shows a safe
 * fallback without leaking component state or stack traces (Requirement
 * 14.3). Logged output goes through the scrubbing `logger`.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    logger.error('Unhandled render error', error);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-white p-6">
          <Text className="text-lg font-semibold text-gray-900">Something went wrong</Text>
          <Text className="mt-2 text-center text-gray-600">
            An unexpected error occurred. Your vault remains encrypted and safe.
          </Text>
          <Pressable onPress={this.reset} className="mt-6 rounded-lg bg-blue-600 px-4 py-2">
            <Text className="font-medium text-white">Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
