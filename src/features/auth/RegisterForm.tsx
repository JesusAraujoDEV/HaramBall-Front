import React, { useState } from 'react';
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

  async function handleSubmit(): Promise<void> {
    if (submitting) return; // guard against duplicate submissions (Requirement 1.4 loading)
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
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4 p-6">
      <Text className="text-2xl font-bold text-gray-900">Create your vault</Text>

      <View className="rounded-lg bg-amber-50 p-3">
        <Text className="text-amber-800">
          Your Master Password cannot be recovered. If you forget it, your existing entries become
          permanently unreadable.
        </Text>
      </View>

      <View>
        <Text className="mb-1 text-gray-700">Email</Text>
        <TextInput
          className="rounded-lg border border-gray-300 px-3 py-2"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="register-email"
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
          testID="register-password"
        />
        {fieldErrors.masterPassword ? (
          <Text className="mt-1 text-red-600">{fieldErrors.masterPassword}</Text>
        ) : null}
      </View>

      <View>
        <Text className="mb-1 text-gray-700">Confirm Master Password</Text>
        <TextInput
          className="rounded-lg border border-gray-300 px-3 py-2"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          testID="register-confirm-password"
        />
        {fieldErrors.confirmPassword ? (
          <Text className="mt-1 text-red-600">{fieldErrors.confirmPassword}</Text>
        ) : null}
      </View>

      {formError ? <Text className="text-red-600">{formError}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        className="items-center rounded-lg bg-blue-600 py-3 disabled:opacity-60"
        testID="register-submit"
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-medium text-white">Register</Text>}
      </Pressable>

      <Pressable onPress={() => router.replace('/login')}>
        <Text className="text-center text-blue-600">Already have an account? Log in</Text>
      </Pressable>
    </View>
  );
}

export default RegisterForm;
