import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { streamSSE } from "hono/streaming";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type * as z from "zod/v4";
import { db, sweep } from "./db.ts";
import { anonymize, chat, draftReply, learn, synthesize } from "./harry.ts";
import {
  AnonymizeRequestSchema,
  ChatRequestSchema,
  CircleReplySchema,
  DraftRequestSchema,
  LearnRequestSchema,
  RegisterSchema,
  SendSchema,
  SynthesizeRequestSchema,
} from "./schemas.ts";

type Env = { Variables: { userId: string } };
const app = new Hono<Env>();
const DAILY_AI_LIMIT = Number(process.env.HARRY_DAILY_AI_LIMIT ?? 400);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const id = (bytes = 12) => randomBytes(bytes).toString("base64url");

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  const json = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues.slice(0, 5) }, 400);
  return parsed.data;
}

// Never log request bodies: they contain personal conversations.
app.use("*", async (c, next) => {
  const t = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.routePath} ${c.res.status} ${Date.now() - t}ms`);
});

app.get("/health", (c) => c.json({ ok: true }));

// ---------- Accounts ----------
// Accounts are pseudonymous: an alias and two public keys generated on the
// device. No email, phone, or real name is required.
app.post("/v1/register", async (c) => {
  const b = await body(c, RegisterSchema);
  if (b instanceof Response) return b;
  const userId = id();
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO users (id, token_hash, alias, box_pk, sign_pk, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    userId,
    sha256(token),
    b.alias,
    b.boxPk,
    b.signPk,
    Date.now(),
  );
  return c.json({ userId, token });
});

async function auth(c: Context<Env>, next: Next) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const row = token ? (db.prepare("SELECT id FROM users WHERE token_hash = ?").get(sha256(token)) as { id: string } | undefined) : undefined;
  if (!row) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", row.id);
  await next();
}
app.use("/v1/*", async (c, next) => (c.req.path === "/v1/register" ? next() : auth(c, next)));

function underLimit(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1",
  ).run(userId, day);
  const row = db.prepare("SELECT count FROM usage WHERE user_id = ? AND day = ?").get(userId, day) as { count: number };
  return row.count <= DAILY_AI_LIMIT;
}

app.patch("/v1/me", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { alias?: unknown };
  if (typeof b.alias !== "string" || !b.alias.trim() || b.alias.length > 60) return c.json({ error: "invalid_request" }, 400);
  db.prepare("UPDATE users SET alias = ? WHERE id = ?").run(b.alias.trim(), c.get("userId"));
  return c.json({ ok: true });
});

app.delete("/v1/me", (c) => {
  const userId = c.get("userId");
  db.prepare("DELETE FROM groups WHERE owner_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  db.prepare("DELETE FROM usage WHERE user_id = ?").run(userId);
  return c.json({ ok: true });
});

// ---------- Harry ----------

app.post("/v1/chat", async (c) => {
  const b = await body(c, ChatRequestSchema);
  if (b instanceof Response) return b;
  if (!underLimit(c.get("userId"))) return c.json({ error: "daily_limit" }, 429);
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    for await (const event of chat({
      profile: b.profile,
      history: b.messages,
      mode: b.mode,
      kickoff: b.kickoff,
      signal: ac.signal,
    })) {
      await stream.writeSSE({ data: JSON.stringify(event) });
    }
  });
});

app.post("/v1/profile/learn", async (c) => {
  const b = await body(c, LearnRequestSchema);
  if (b instanceof Response) return b;
  if (!underLimit(c.get("userId"))) return c.json({ error: "daily_limit" }, 429);
  try {
    return c.json(await learn(b.profile, b.transcript));
  } catch (e) {
    console.error("learn failed", (e as Error).message);
    return c.json({ error: "learn_failed" }, 502);
  }
});

app.post("/v1/circle/anonymize", async (c) => {
  const b = await body(c, AnonymizeRequestSchema);
  if (b instanceof Response) return b;
  if (!underLimit(c.get("userId"))) return c.json({ error: "daily_limit" }, 429);
  try {
    return c.json({ question: await anonymize(b.question) });
  } catch {
    return c.json({ error: "ai_failed" }, 502);
  }
});

app.post("/v1/circle/draft", async (c) => {
  const b = await body(c, DraftRequestSchema);
  if (b instanceof Response) return b;
  if (!underLimit(c.get("userId"))) return c.json({ error: "daily_limit" }, 429);
  try {
    return c.json({ draft: await draftReply(b.question, b.experience, b.displayName) });
  } catch {
    return c.json({ error: "ai_failed" }, 502);
  }
});

app.post("/v1/circle/synthesize", async (c) => {
  const b = await body(c, SynthesizeRequestSchema);
  if (b instanceof Response) return b;
  if (!underLimit(c.get("userId"))) return c.json({ error: "daily_limit" }, 429);
  try {
    return c.json({ text: await synthesize(b.question, b.replies) });
  } catch {
    return c.json({ error: "ai_failed" }, 502);
  }
});

// ---------- Groups (invite-only Circles) ----------

const isMember = (groupId: string, userId: string) =>
  !!db.prepare("SELECT 1 FROM members WHERE group_id = ? AND user_id = ?").get(groupId, userId);

function groupView(groupId: string) {
  const g = db.prepare("SELECT id, name, owner_id AS ownerId, created_at AS createdAt FROM groups WHERE id = ?").get(groupId);
  const members = db
    .prepare(
      "SELECT u.id, u.alias, u.box_pk AS boxPk, u.sign_pk AS signPk FROM members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at",
    )
    .all(groupId);
  return { ...(g as object), members };
}

app.get("/v1/groups", (c) => {
  const rows = db.prepare("SELECT group_id FROM members WHERE user_id = ?").all(c.get("userId")) as { group_id: string }[];
  return c.json({ groups: rows.map((r) => groupView(r.group_id)) });
});

app.post("/v1/groups", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return c.json({ error: "invalid_request" }, 400);
  const groupId = id();
  const now = Date.now();
  db.prepare("INSERT INTO groups (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").run(groupId, name, c.get("userId"), now);
  db.prepare("INSERT INTO members (group_id, user_id, joined_at) VALUES (?, ?, ?)").run(groupId, c.get("userId"), now);
  return c.json(groupView(groupId));
});

app.post("/v1/groups/:id/invites", (c) => {
  const groupId = c.req.param("id");
  if (!isMember(groupId, c.get("userId"))) return c.json({ error: "not_found" }, 404);
  // Human-friendly, unambiguous code. Single use, expires in 72 hours.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const raw = randomBytes(10);
  const code = Array.from(raw, (b) => alphabet[b % alphabet.length]).join("");
  const expiresAt = Date.now() + 72 * 3600e3;
  db.prepare("INSERT INTO invites (code, group_id, created_by, expires_at, uses_left) VALUES (?, ?, ?, ?, 1)").run(
    code,
    groupId,
    c.get("userId"),
    expiresAt,
  );
  return c.json({ code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt });
});

app.post("/v1/invites/:code/accept", (c) => {
  const code = c.req.param("code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const inv = db.prepare("SELECT group_id, expires_at, uses_left FROM invites WHERE code = ?").get(code) as
    | { group_id: string; expires_at: number; uses_left: number }
    | undefined;
  if (!inv || inv.expires_at < Date.now() || inv.uses_left <= 0) return c.json({ error: "invalid_invite" }, 404);
  const userId = c.get("userId");
  db.prepare("UPDATE invites SET uses_left = uses_left - 1 WHERE code = ?").run(code);
  db.prepare("INSERT OR IGNORE INTO members (group_id, user_id, joined_at) VALUES (?, ?, ?)").run(inv.group_id, userId, Date.now());
  return c.json(groupView(inv.group_id));
});

app.post("/v1/groups/:id/leave", (c) => {
  const groupId = c.req.param("id");
  const userId = c.get("userId");
  db.prepare("DELETE FROM members WHERE group_id = ? AND user_id = ?").run(groupId, userId);
  const left = db.prepare("SELECT COUNT(*) AS n FROM members WHERE group_id = ?").get(groupId) as { n: number };
  if (left.n === 0) db.prepare("DELETE FROM groups WHERE id = ?").run(groupId);
  return c.json({ ok: true });
});

// ---------- End-to-end encrypted relay ----------
// Clients encrypt each message separately for every recipient. The server
// sees only who-sent-to-whom (or nothing about the sender, for anonymous
// questions) and opaque ciphertext, and deletes envelopes once delivered.

app.post("/v1/messages", async (c) => {
  const b = await body(c, SendSchema);
  if (b instanceof Response) return b;
  const userId = c.get("userId");
  if (!isMember(b.groupId, userId)) return c.json({ error: "not_found" }, 404);
  const memberIds = new Set(
    (db.prepare("SELECT user_id FROM members WHERE group_id = ?").all(b.groupId) as { user_id: string }[]).map((r) => r.user_id),
  );
  const now = Date.now();
  let questionId: string | null = null;
  if (b.kind === "circle_question") {
    questionId = randomUUID();
    db.prepare("INSERT INTO circle_questions (id, group_id, asker_id, created_at) VALUES (?, ?, ?, ?)").run(questionId, b.groupId, userId, now);
  }
  const anonymous = b.kind === "circle_question" && b.anonymous;
  const insert = db.prepare(
    "INSERT INTO inbox (recipient_id, group_id, sender_id, kind, question_id, envelope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  let delivered = 0;
  for (const item of b.items) {
    if (item.recipientId === userId || !memberIds.has(item.recipientId)) continue;
    insert.run(item.recipientId, b.groupId, anonymous ? null : userId, b.kind, questionId, item.envelope, now);
    delivered++;
  }
  return c.json({ ok: true, delivered, questionId });
});

// Replies to an anonymous question are routed to the asker without revealing
// who asked. They're encrypted to a one-time key carried inside the question.
app.post("/v1/circle/reply", async (c) => {
  const b = await body(c, CircleReplySchema);
  if (b instanceof Response) return b;
  const userId = c.get("userId");
  const q = db.prepare("SELECT group_id, asker_id FROM circle_questions WHERE id = ?").get(b.questionId) as
    | { group_id: string; asker_id: string }
    | undefined;
  if (!q || !isMember(q.group_id, userId)) return c.json({ error: "not_found" }, 404);
  db.prepare(
    "INSERT INTO inbox (recipient_id, group_id, sender_id, kind, question_id, envelope, created_at) VALUES (?, ?, NULL, 'circle_reply', ?, ?, ?)",
  ).run(q.asker_id, q.group_id, b.questionId, b.envelope, Date.now());
  return c.json({ ok: true });
});

app.get("/v1/inbox", (c) => {
  const after = Number(c.req.query("after") ?? 0) || 0;
  const rows = db
    .prepare(
      "SELECT id, group_id AS groupId, sender_id AS senderId, kind, question_id AS questionId, envelope, created_at AS createdAt FROM inbox WHERE recipient_id = ? AND id > ? ORDER BY id LIMIT 200",
    )
    .all(c.get("userId"), after);
  return c.json({ messages: rows });
});

app.post("/v1/inbox/ack", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { upTo?: unknown };
  if (typeof b.upTo !== "number") return c.json({ error: "invalid_request" }, 400);
  db.prepare("DELETE FROM inbox WHERE recipient_id = ? AND id <= ?").run(c.get("userId"), b.upTo);
  return c.json({ ok: true });
});

setInterval(sweep, 3600e3).unref();
sweep();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
console.log(`HARRY server listening on :${port}`);
