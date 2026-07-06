// @testing-library/react-native v13+ ships Jest matchers built in;
// no separate extend-expect import is required.

// Force the RN `Platform.OS` to "web" for the whole test run. Our crypto
// module (`src/crypto/sodium.ts`) branches on `Platform.OS` to pick
// `libsodium-wrappers-sumo` (pure JS, works under Node/Jest) vs.
// `react-native-libsodium` (a JSI native module with no bindings outside a
// real native runtime). Platform-adapter tests that specifically need to
// exercise native behavior override this per-test via `jest.mock`.
import { Platform } from 'react-native';

Platform.OS = 'web';
