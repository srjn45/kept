/** Jest config using the jest-expo preset for React Native + Expo. */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // jest-expo ignores most of node_modules from transforms; add the RN/CSS libs our
  // components import so their ESM/JSX gets compiled.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-gifted-charts|gifted-charts-core|nativewind|react-native-css-interop|react-native-reanimated|react-native-gesture-handler))',
  ],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // RN component tests render VirtualizedList/SectionList (ledger) and gifted-charts (stats) in
  // jsdom, whose internal setState-on-timer work is slow under a loaded CI runner — the default
  // 5s is too aggressive and flakes there (passes locally). 20s gives ample headroom without
  // weakening any assertion (the tests still run and verify exactly the same behavior).
  testTimeout: 20000,
}
