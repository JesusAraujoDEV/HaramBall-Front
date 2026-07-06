import React from 'react';
import { ScrollView } from 'react-native';
import { RegisterForm } from '../../src/features/auth/RegisterForm';

export default function RegisterScreen(): React.ReactElement {
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <RegisterForm />
    </ScrollView>
  );
}
