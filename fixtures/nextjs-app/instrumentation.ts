import { registerDevPanel } from "next-fetch-panel/patch";

export async function register() {
  // Mocks are allowed so E2E can verify mocked responses end to end.
  await registerDevPanel({ allowMocks: true });
}
