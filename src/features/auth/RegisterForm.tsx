import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
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
    <View className="w-full max-w-md gap-5 self-center rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
      <View className="items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-md">
          <Text className="text-2xl font-bold text-white">H</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold text-slate-900">Create your vault</Text>
          <Text className="mt-1 text-sm text-slate-500">Set up your encrypted password vault</Text>
        </View>
      </View>

      <View className="flex-row gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <Text className="text-base">⚠️</Text>
        <Text className="flex-1 text-sm leading-5 text-amber-800">
          Your Master Password cannot be recovered. If you forget it, your existing entries become
          permanently unreadable.
        </Text>
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-slate-700">Email</Text>
        <TextInput
          className="h-12 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900 focus:border-blue-500 focus:bg-white"
          placeholder="you@example.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="register-email"
        />
        {fieldErrors.email ? <Text className="text-sm text-red-600">{fieldErrors.email}</Text> : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-slate-700">Master Password</Text>
        <TextInput
          className="h-12 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900 focus:border-blue-500 focus:bg-white"
          placeholder="••••••••••••"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={masterPassword}
          onChangeText={setMasterPassword}
          testID="register-password"
        />
        {fieldErrors.masterPassword ? (
          <Text className="text-sm text-red-600">{fieldErrors.masterPassword}</Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-slate-700">Confirm Master Password</Text>
        <TextInput
          className="h-12 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900 focus:border-blue-500 focus:bg-white"
          placeholder="••••••••••••"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          testID="register-confirm-password"
        />
        {fieldErrors.confirmPassword ? (
          <Text className="text-sm text-red-600">{fieldErrors.confirmPassword}</Text>
        ) : null}
      </View>

      {formError ? (
        <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{formError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        className="mt-1 h-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm active:bg-blue-700 disabled:opacity-60"
        testID="register-submit"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">Register</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/login')} className="py-1">
        <Text className="text-center text-sm text-slate-500">
          Already have an account? <Text className="font-semibold text-blue-600">Log in</Text>
        </Text>
      </Pressable>
    </View>
  );
}

export default RegisterForm;
