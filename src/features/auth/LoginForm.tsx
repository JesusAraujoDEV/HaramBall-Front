import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import useVaultStore from '../../vault/vaultStore';
import biometricAdapter from '../../platform/biometric';
import { ApiError } from '../../api/errors';
import { getRetryAfterSeconds, toUserMessage } from '../../utils/errorMessages';
import { loginSchema } from './schemas';

/**
 * Login form: email + Master_Password, generic 401 message (never reveals
 * whether the email exists), 429 message with a `Retry-After` countdown
 * (Requirements 2.3, 2.4, 2.6).
 */
export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const unlockWithPassword = useVaultStore((s) => s.unlockWithPassword);
  const unlockWithBiometrics = useVaultStore((s) => s.unlockWithBiometrics);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  // Set once the backend replies TOTP_REQUIRED: the password was correct and
  // the form now collects the authenticator code for a second submit.
  const [needsTotp, setNeedsTotp] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // A ref (not just the `submitting` state) guards re-entrancy: React state
  // updates are batched/async, so two synchronous button presses in the
  // same tick would both see the stale `submitting === false` value if we
  // only checked state. The ref is updated immediately and synchronously.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) return;
    const timer = setTimeout(() => setRetryAfter((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);

  // Show the fingerprint button only where biometrics are actually available
  // (native device with an enrolled fingerprint/face).
  useEffect(() => {
    let cancelled = false;
    void biometricAdapter.isAvailable().then((ok) => {
      if (!cancelled) setBiometricAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBiometric(): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const unlocked = await unlockWithBiometrics();
      if (unlocked) {
        router.replace('/');
      } else {
        setFormError('Log in with your master password once first, then fingerprint will work.');
      }
    } catch (err) {
      setFormError(toUserMessage(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) return; // guard against duplicate submissions (Requirement 2.6)
    submittingRef.current = true;
    setFormError(null);

    const result = loginSchema.safeParse({ email, masterPassword });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !errors[key]) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      submittingRef.current = false;
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      // enableBiometrics persists the master key behind the platform
      // keystore (native only) so the 24 h re-verification flow can restore
      // the session without retyping the master password.
      await unlockWithPassword(result.data.email, result.data.masterPassword, {
        enableBiometrics: true,
        totpCode: needsTotp ? totpCode.trim() : undefined,
      });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REQUIRED') {
        // Password accepted; prompt for the authenticator code and retry.
        setNeedsTotp(true);
        setFormError('Enter the 6-digit code from your authenticator app.');
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError(needsTotp ? 'Incorrect code, email, or password.' : 'Incorrect email or password.');
      } else if (err instanceof ApiError && err.status === 429) {
        const seconds = getRetryAfterSeconds(err);
        setRetryAfter(seconds ?? null);
        setFormError(
          seconds
            ? `Too many attempts. Try again in ${seconds}s.`
            : 'Too many attempts. Please wait before trying again.',
        );
      } else {
        setFormError(toUserMessage(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const isRateLimited = retryAfter !== null && retryAfter > 0;

  return (
    <View className="w-full max-w-md gap-5 self-center rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      <View className="items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
          <Text className="text-2xl font-bold text-white dark:text-zinc-900">H</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Welcome back</Text>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to unlock your vault</Text>
        </View>
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</Text>
        <TextInput
          className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400"
          placeholder="you@example.com"
          placeholderTextColor="#a1a1aa"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="login-email"
        />
        {fieldErrors.email ? <Text className="text-sm text-red-600 dark:text-red-400">{fieldErrors.email}</Text> : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Master Password</Text>
        <TextInput
          className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400"
          placeholder="••••••••••••"
          placeholderTextColor="#a1a1aa"
          secureTextEntry
          value={masterPassword}
          onChangeText={setMasterPassword}
          testID="login-password"
        />
        {fieldErrors.masterPassword ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{fieldErrors.masterPassword}</Text>
        ) : null}
      </View>

      {needsTotp ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Authenticator code</Text>
          <TextInput
            className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-center text-lg tracking-[8px] text-zinc-900 focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400"
            placeholder="000000"
            placeholderTextColor="#a1a1aa"
            keyboardType="number-pad"
            maxLength={6}
            value={totpCode}
            onChangeText={setTotpCode}
            autoFocus
            testID="login-totp"
          />
        </View>
      ) : null}

      {formError ? (
        <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
          <Text className="text-sm text-red-700 dark:text-red-300">
            {isRateLimited ? `Too many attempts. Try again in ${retryAfter}s.` : formError}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || isRateLimited}
        className="mt-1 h-12 items-center justify-center rounded-xl bg-zinc-900 shadow-sm active:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:active:bg-zinc-300"
        testID="login-submit"
      >
        {submitting ? (
          <ActivityIndicator color={colorScheme === 'dark' ? '#18181b' : '#fff'} />
        ) : (
          <Text className="text-base font-semibold text-white dark:text-zinc-900">Log in</Text>
        )}
      </Pressable>

      {biometricAvailable ? (
        <Pressable
          onPress={handleBiometric}
          disabled={submitting}
          className="h-12 flex-row items-center justify-center gap-2 rounded-xl border border-zinc-300 disabled:opacity-60 dark:border-zinc-700"
          testID="login-biometric"
          accessibilityRole="button"
          accessibilityLabel="Log in with fingerprint"
        >
          <Text className="text-lg">👆</Text>
          <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Log in with fingerprint</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={() => router.replace('/register')} className="py-1">
        <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Need an account? <Text className="font-semibold text-zinc-900 underline dark:text-zinc-50">Register</Text>
        </Text>
      </Pressable>
    </View>
  );
}

export default LoginForm;
