/**
 * Interface implemented by `biometric.native.ts` (wrapping
 * `expo-local-authentication`) and `biometric.web.ts` (always unavailable —
 * Web has no biometric unlock path).
 */
export interface BiometricAdapter {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}
