import React from 'react';
import { ScrollView } from 'react-native';
import { RegisterForm } from '../../src/features/auth/RegisterForm';

export default function RegisterScreen(): React.ReactElement {
  return (
    <ScrollView
      className="flex-1 bg-slate-100"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}
    >
      <RegisterForm />
    </ScrollView>
  );
}
