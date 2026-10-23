/* The API base URL the client reads at import. Tests never reach it: every
   request in a test goes to a mocked fetch. */
process.env.EXPO_PUBLIC_API_URL = "https://api.test";

/* The app's store persists through AsyncStorage, which has no native side
   under Jest; its own mock keeps the values in memory. */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
