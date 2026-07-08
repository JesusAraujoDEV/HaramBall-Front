import React from 'react';
import { Pressable, Text } from 'react-native';
import useThemeStore from '../theme/themeStore';

const LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' } as const;
const ICONS = { system: '◐', light: '○', dark: '●' } as const;

/**
 * Compact pill that cycles the theme preference (system → light → dark).
 */
export function ThemeToggle(): React.ReactElement {
  const preference = useThemeStore((s) => s.preference);
  const cycle = useThemeStore((s) => s.cycle);

  return (
    <Pressable
      onPress={cycle}
      className="flex-row items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
      testID="theme-toggle"
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${LABELS[preference]}`}
    >
      <Text className="text-xs text-zinc-500 dark:text-zinc-400">{ICONS[preference]}</Text>
      <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{LABELS[preference]}</Text>
    </Pressable>
  );
}

export default ThemeToggle;
