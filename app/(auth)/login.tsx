import React from 'react';
import { ScrollView } from 'react-native';
import { LoginForm } from '../../src/features/auth/LoginForm';

export default function LoginScreen(): React.ReactElement {
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <LoginForm />
    </ScrollView>
  );
}
