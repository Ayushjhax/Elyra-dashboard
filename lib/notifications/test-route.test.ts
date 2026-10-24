import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: vi.fn(), claim: vi.fn(), inbox: vi.fn(), devices: vi.fn(), push: vi.fn(), remember: vi.fn(),
}));
vi.mock("@/lib/notifications/session", () => ({ storedSession: state.session }));
vi.mock("@/lib/notifications/preferences", () => ({ claimNotification: state.claim }));
vi.mock("@/lib/notifications/inbox", () => ({ addToInbox: state.inbox }));
vi.mock("@/lib/notifications/devices", () => ({ devicesFor: state.devices, rememberAppAccount: state.remember }));
vi.mock("@/lib/notifications/push", () => ({ pushToDevices: state.push }));
import { POST } from "@/app/api/notifications/test/route";
const USER = "11111111-1111-4111-8111-111111111111";
const request = () => new Request("https://api.test/api/notifications/test", { method: "POST", body: JSON.stringify({ userId: "other-user", devices: ["someone-else"] }) });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ userId: USER }); state.claim.mockResolvedValue(true);
  state.inbox.mockResolvedValue("notification-1"); state.devices.mockResolvedValue(new Map([[USER, [{ id: "my-device" }]]]));
  state.push.mockResolvedValue({ sent: 1, failed: 0 }); state.remember.mockResolvedValue(true);
});
it("adds the test to the verified caller's inbox and pushes only to their devices", async () => {
  const result = await POST(request());
  expect(result.status).toBe(200);
  expect(state.inbox).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, kind: "system" }));
  expect(state.devices).toHaveBeenCalledWith([USER]);
  expect(state.push).toHaveBeenCalledWith([{ id: "my-device" }], expect.objectContaining({ data: { route: "/notifications", accountId: USER, notificationId: "notification-1" } }), "notification-1");
});
it("requires authentication before claiming or sending", async () => {
  state.session.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
  expect((await POST(request())).status).toBe(401); expect(state.claim).not.toHaveBeenCalled(); expect(state.push).not.toHaveBeenCalled();
});
it("rate limits before creating another row or sending", async () => {
  state.claim.mockResolvedValueOnce(false);
  const result = await POST(request());
  expect(result.status).toBe(429); expect(result.headers.get("retry-after")).toBe("60");
  expect(state.inbox).not.toHaveBeenCalled(); expect(state.push).not.toHaveBeenCalled();
});
it("does not push when writing the inbox failed", async () => {
  state.inbox.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(503); expect(state.push).not.toHaveBeenCalled();
});
it("keeps the inbox result when push fails or permission has left no devices", async () => {
  state.push.mockResolvedValueOnce({ sent: 0, failed: 1 });
  const result = await POST(request());
  expect(await result.json()).toMatchObject({ inbox: true, push: { sent: 0, failed: 1 } });
});
