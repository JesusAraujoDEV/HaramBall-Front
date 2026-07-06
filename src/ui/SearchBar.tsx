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
    <View className="border-b border-gray-200 px-4 py-2">
      <TextInput
        testID={testID}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-full bg-gray-100 px-4 py-2 text-base"
      />
    </View>
  );
}

export default SearchBar;
