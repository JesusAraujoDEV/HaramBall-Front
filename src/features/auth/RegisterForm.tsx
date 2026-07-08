import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { AuthService } from '../../services/AuthService';
import { ApiError } from '../../api/errors';
import { toUserMessage } from '../../utils/errorMessages';
import { registerSchema } from './schemas';

/**
 * Registration form: email + Master_Password + confirmation, blocking
 * submission on validation failure, with a prominent unrecoverable-password
 * warning (Requirements 1.4-1.9).
 */
export function RegisterForm(): React.ReactElement {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A ref (not just the `submitting` state) guards re-entrancy: React state
  // updates are batched/async, so two synchronous button presses in the
  // same tick would both see the stale `submitting === false` value if we
  // only checked state. The ref is updated immediately and synchronously.
  const submittingRef = useRef(false);

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) return; // guard against duplicate submissions (Requirement 1.4 loading)
    submittingRef.current = true;
    setFormError(null);

    const result = registerSchema.safeParse({ email, masterPassword, confirmPassword });
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
      await AuthService.register(result.data.email, result.data.masterPassword);
      router.replace('/login');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError('This email is already registered.');
      } else {
        setFormError(toUserMessage(err));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View className="w-full max-w-md gap-5 self-center rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      <View className="items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
          <Text className="text-2xl font-bold text-white dark:text-zinc-900">H</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Create your vault</Text>
          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Set up your encrypted password vault</Text>
        </View>
      </View>

      <View className="flex-row gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
        <Text className="text-base">⚠️</Text>
        <Text className="flex-1 text-sm leading-5 text-amber-800 dark:text-amber-200">
          Your Master Password cannot be recovered. If you forget it, your existing entries become
          permanently unreadable.
        </Text>
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
          testID="register-email"
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
          testID="register-password"
        />
        {fieldErrors.masterPassword ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{fieldErrors.masterPassword}</Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirm Master Password</Text>
        <TextInput
          className="h-12 rounded-xl border border-zinc-300 bg-zinc-50 px-4 text-base text-zinc-900 focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400"
          placeholder="••••••••••••"
          placeholderTextColor="#a1a1aa"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          testID="register-confirm-password"
        />
        {fieldErrors.confirmPassword ? (
          <Text className="text-sm text-red-600 dark:text-red-400">{fieldErrors.confirmPassword}</Text>
        ) : null}
      </View>

      {formError ? (
        <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
          <Text className="text-sm text-red-700 dark:text-red-300">{formError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        className="mt-1 h-12 items-center justify-center rounded-xl bg-zinc-900 shadow-sm active:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:active:bg-zinc-300"
        testID="register-submit"
      >
        {submitting ? (
          <ActivityIndicator color={colorScheme === 'dark' ? '#18181b' : '#fff'} />
        ) : (
          <Text className="text-base font-semibold text-white dark:text-zinc-900">Register</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/login')} className="py-1">
        <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account? <Text className="font-semibold text-zinc-900 underline dark:text-zinc-50">Log in</Text>
        </Text>
      </Pressable>
    </View>
  );
}

export default RegisterForm;
