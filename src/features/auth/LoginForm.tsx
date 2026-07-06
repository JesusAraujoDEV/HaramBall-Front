import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
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
  const unlockWithPassword = useVaultStore((s) => s.unlockWithPassword);

  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) return;
    const timer = setTimeout(() => setRetryAfter((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);

  async function handleSubmit(): Promise<void> {
    if (submitting) return; // guard against duplicate submissions (Requirement 2.6)
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
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await unlockWithPassword(result.data.email, result.data.masterPassword);
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
      setSubmitting(false);
    }
  }

  const isRateLimited = retryAfter !== null && retryAfter > 0;

  return (
    <View className="gap-4 p-6">
      <Text className="text-2xl font-bold text-gray-900">Welcome back</Text>

      <View>
        <Text className="mb-1 text-gray-700">Email</Text>
        <TextInput
          className="rounded-lg border border-gray-300 px-3 py-2"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="login-email"
        />
        {fieldErrors.email ? <Text className="mt-1 text-red-600">{fieldErrors.email}</Text> : null}
      </View>

      <View>
        <Text className="mb-1 text-gray-700">Master Password</Text>
        <TextInput
          className="rounded-lg border border-gray-300 px-3 py-2"
          secureTextEntry
          value={masterPassword}
          onChangeText={setMasterPassword}
          testID="login-password"
        />
        {fieldErrors.masterPassword ? (
          <Text className="mt-1 text-red-600">{fieldErrors.masterPassword}</Text>
        ) : null}
      </View>

      {formError ? (
        <Text className="text-red-600">
          {isRateLimited ? `Too many attempts. Try again in ${retryAfter}s.` : formError}
        </Text>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || isRateLimited}
        className="items-center rounded-lg bg-blue-600 py-3 disabled:opacity-60"
        testID="login-submit"
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-medium text-white">Log in</Text>}
      </Pressable>

      <Pressable onPress={() => router.replace('/register')}>
        <Text className="text-center text-blue-600">Need an account? Register</Text>
      </Pressable>
    </View>
  );
}

export default LoginForm;
