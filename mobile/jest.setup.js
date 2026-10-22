/* The API base URL the client reads at import. Tests never reach it: every
   request in a test goes to a mocked fetch. */
process.env.EXPO_PUBLIC_API_URL = "https://api.test";
