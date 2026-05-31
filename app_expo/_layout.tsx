import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0f172a', // Slate 900
          },
          headerTintColor: '#ffffff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitle: 'AnaesSOP Clinical Guidelines',
        }}
      />
      <StatusBar style="light" />
    </>
  );
}
