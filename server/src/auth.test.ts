import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "./index";

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { status: response.status, body: await response.json() };
}

async function login(email: string): Promise<string> {
  const result = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo123" })
  });
  assert.equal(result.status, 200);
  return result.body.token;
}

test("login succeeds and rejects invalid credentials", async () => {
  const success = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "aarav.mehta@opsdesk.demo", password: "demo123" })
  });
  assert.equal(success.status, 200);
  assert.equal(success.body.user.role, "agent");
  const failure = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "aarav.mehta@opsdesk.demo", password: "wrong" })
  });
  assert.equal(failure.status, 401);
});

test("protected requests require a token", async () => {
  const result = await request("/api/tickets");
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "Authentication required");
});

test("agents cannot resolve another agent's ticket, while managers can", async () => {
  const agentToken = await login("aarav.mehta@opsdesk.demo");
  const managerToken = await login("priya.shah@opsdesk.demo");
  const tickets = await request("/api/tickets", { headers: { authorization: `Bearer ${agentToken}` } });
  const target = tickets.body.find((ticket: { assigned_agent_id: number | null }) => ticket.assigned_agent_id !== 1);
  assert.ok(target);
  const denied = await request(`/api/tickets/${target.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json" },
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(denied.status, 403);
  const allowed = await request(`/api/tickets/${target.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${managerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ status: "resolved" })
  });
  assert.equal(allowed.status, 200);
  await request(`/api/tickets/${target.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${managerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ status: "open" })
  });
});

test("agents are blocked from insights and CSV export", async () => {
  const token = await login("aarav.mehta@opsdesk.demo");
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await request("/api/insights", { headers })).status, 403);
  assert.equal((await request("/api/export/tickets.csv", { headers })).status, 403);
});

test("team management validates duplicates and prevents manager self-deactivation", async () => {
  const managerToken = await login("priya.shah@opsdesk.demo");
  const headers = { authorization: `Bearer ${managerToken}`, "content-type": "application/json" };
  const duplicate = await request("/api/team", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Duplicate", email: "aarav.mehta@opsdesk.demo", role: "agent", region: "India", shift_start: "09:00", shift_end: "18:00", password: "password123" })
  });
  assert.equal(duplicate.status, 409);
  const self = await request("/api/team/9", { method: "PATCH", headers, body: JSON.stringify({ active: false }) });
  assert.equal(self.status, 400);
});

test("deactivated users cannot log in", async () => {
  const managerToken = await login("priya.shah@opsdesk.demo");
  const headers = { authorization: `Bearer ${managerToken}`, "content-type": "application/json" };
  const update = await request("/api/team/1", { method: "PATCH", headers, body: JSON.stringify({ active: false }) });
  assert.equal(update.status, 200);
  const blocked = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "aarav.mehta@opsdesk.demo", password: "demo123" })
  });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.error, "Account is deactivated");
  await request("/api/team/1", { method: "PATCH", headers, body: JSON.stringify({ active: true }) });
});
