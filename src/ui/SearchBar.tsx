import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

interface Props {
  value: string;
  onChangeDebounced: (value: string) => void;
  placeholder?: string;
  testID?: string;
  debounceMs?: number;
}

/**
 * Chat-style search input, debounced so rapid typing doesn't issue an
 * excessive number of Backend calls (Requirement 10.4). Maintains its own
 * local text state for immediate visual feedback while debouncing the
 * callback that triggers the actual search.
 */
export function SearchBar({
  value,
  onChangeDebounced,
  placeholder = 'Search…',
  testID = 'search-bar',
  debounceMs = 250,
}: Props): React.ReactElement {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  function handleChange(next: string): void {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChangeDebounced(next), debounceMs);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <View className="px-4 pb-2 pt-1">
      <TextInput
        testID={testID}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#a1a1aa"
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-base text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </View>
  );
}

export default SearchBar;
