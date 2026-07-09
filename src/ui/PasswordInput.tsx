import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import {
  generatePassword,
  PASSWORD_KIND_LABELS,
  type PasswordKind,
} from '../utils/passwordGenerator';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
  autoFocus?: boolean;
  autoComplete?: 'current-password' | 'new-password' | 'off';
  /** When true, shows a row of one-tap generator chips below the field. */
  showGenerator?: boolean;
}

const INPUT_CLASS =
  'h-12 rounded-xl border border-zinc-300 bg-zinc-50 pl-4 pr-12 text-base text-zinc-900 focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:bg-zinc-950';

const GENERATOR_KINDS: PasswordKind[] = ['memorable', 'strong', 'fortKnox'];

/**
 * Password field with a show/hide eye toggle and, optionally, one-tap
 * generator chips (RandomKeygen-style) that fill the field with a strong
 * suggestion the user can then edit. Forwards `testID` to the inner input so
 * existing tests keep targeting it directly.
 */
export function PasswordInput({
  value,
  onChangeText,
  placeholder = '••••••••••••',
  testID,
  autoFocus,
  autoComplete = 'off',
  showGenerator = false,
}: Props): React.ReactElement {
  const [visible, setVisible] = useState(false);

  function handleGenerate(kind: PasswordKind): void {
    onChangeText(generatePassword(kind));
    setVisible(true); // reveal so the user can see what was suggested
  }

  return (
    <View className="gap-2">
      <View className="relative justify-center">
        <TextInput
          className={INPUT_CLASS}
          placeholder={placeholder}
          placeholderTextColor="#a1a1aa"
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChangeText={onChangeText}
          testID={testID}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          className="absolute right-1 top-0 h-12 w-11 items-center justify-center"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          testID={testID ? `${testID}-toggle` : undefined}
        >
          <Text className="text-lg">{visible ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>

      {showGenerator ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs text-zinc-400 dark:text-zinc-500">Suggest:</Text>
          {GENERATOR_KINDS.map((kind) => (
            <Pressable
              key={kind}
              onPress={() => handleGenerate(kind)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 active:opacity-70 dark:border-zinc-700"
              testID={testID ? `${testID}-gen-${kind}` : undefined}
            >
              <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {PASSWORD_KIND_LABELS[kind]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default PasswordInput;
