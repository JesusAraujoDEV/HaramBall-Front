// Minimal Jest mock for react-native-reanimated: the native worklets runtime
// isn't available under Jest. We only use `Animated.View` and the
// `FadeIn`/`FadeOut` entering/exiting animation presets (see
// `src/ui/LockOverlay.tsx`), so this mock provides a plain passthrough
// `View` and no-op animation builder placeholders — enough for component
// tests that assert on rendered output/testIDs, not on animation timing.
const React = require('react');
const { View } = require('react-native');

const AnimatedView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));

module.exports = {
  __esModule: true,
  default: {
    View: AnimatedView,
    Text: View,
    Image: View,
    ScrollView: View,
    createAnimatedComponent: (Component) => Component,
  },
  FadeIn: {},
  FadeOut: {},
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedStyle: (fn) => fn(),
  withTiming: (value) => value,
  withSpring: (value) => value,
};
