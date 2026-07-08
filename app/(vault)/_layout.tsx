import { Stack } from 'expo-router';
import { useColorScheme } from 'nativewind';

export default function VaultLayout() {
  const { colorScheme } = useColorScheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colorScheme === 'dark' ? '#09090b' : '#fafafa' },
      }}
    />
  );
}
