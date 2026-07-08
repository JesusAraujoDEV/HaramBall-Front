import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import useVaultStore from '../../vault/vaultStore';
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

  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
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
      });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Incorrect email or password.');
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

      <Pressable onPress={() => router.replace('/register')} className="py-1">
        <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Need an account? <Text className="font-semibold text-zinc-900 underline dark:text-zinc-50">Register</Text>
        </Text>
      </Pressable>
    </View>
  );
}

export default LoginForm;
