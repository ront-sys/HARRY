import { fetch as streamingFetch } from 'expo/fetch';
import { b64, getIdentity, getSession, setSession, type Session } from './crypto';
import type { ChatMessage, Group, Profile, Source } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function session(alias?: string): Promise<Session> {
  const existing = await getSession();
  if (existing) return existing;
  const id = await getIdentity();
  const res = await fetch(`${API_URL}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: alias || 'Friend', boxPk: b64(id.boxPk), signPk: b64(id.signPk) }),
  });
  if (!res.ok) throw new ApiError(res.status, 'register_failed');
  const s = (await res.json()) as Session;
  await setSession(s);
  return s;
}

export const ensureAccount = (alias: string) => session(alias);
export const myUserId = async () => (await session()).userId;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const s = await session();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, j.error ?? 'request_failed');
  }
  return (await res.json()) as T;
}

// Profile fields that stay on the phone and are never sent to the server.
function wireProfile(p: Profile) {
  const { realName: _r, circleExperience: _c, ...rest } = p;
  return rest;
}

export type ChatEvent =
  | { type: 'flags'; medical: boolean; crisis: boolean }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done'; verified: boolean | null }
  | { type: 'error'; message: string };

/** Streams Harry's reply as server-sent events. */
export async function streamChat(
  opts: { profile: Profile; messages: ChatMessage[]; mode: 'chat' | 'voice'; kickoff?: boolean },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const s = await session();
  const res = await streamingFetch(`${API_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}`, accept: 'text/event-stream' },
    body: JSON.stringify({
      profile: wireProfile(opts.profile),
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      mode: opts.mode,
      kickoff: !!opts.kickoff,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const code = res.status === 429 ? "You've hit today's limit. Harry will be ready again tomorrow." : 'Harry is unreachable right now.';
    onEvent({ type: 'error', message: code });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
        } catch {
          // ignore malformed line
        }
      }
    }
  }
}

export const api = {
  learn: (profile: Profile, transcript: ChatMessage[]) =>
    call<{ notes: string[]; lifeFocus: string[] }>('POST', '/v1/profile/learn', {
      profile: wireProfile(profile),
      transcript: transcript.slice(-60).map((m) => ({ role: m.role, content: m.content })),
    }),
  renameAlias: (alias: string) => call('PATCH', '/v1/me', { alias }),
  deleteAccount: () => call('DELETE', '/v1/me'),

  groups: () => call<{ groups: Group[] }>('GET', '/v1/groups'),
  createGroup: (name: string) => call<Group>('POST', '/v1/groups', { name }),
  createInvite: (groupId: string) => call<{ code: string; expiresAt: number }>('POST', `/v1/groups/${groupId}/invites`),
  acceptInvite: (code: string) => call<Group>('POST', `/v1/invites/${encodeURIComponent(code)}/accept`),
  leaveGroup: (groupId: string) => call('POST', `/v1/groups/${groupId}/leave`),

  send: (body: {
    groupId: string;
    kind: 'chat' | 'circle_question';
    anonymous?: boolean;
    items: { recipientId: string; envelope: string }[];
  }) => call<{ ok: true; delivered: number; questionId: string | null }>('POST', '/v1/messages', body),
  reply: (questionId: string, envelope: string) => call('POST', '/v1/circle/reply', { questionId, envelope }),
  inbox: (after: number) =>
    call<{
      messages: {
        id: number;
        groupId: string;
        senderId: string | null;
        kind: 'chat' | 'circle_question' | 'circle_reply';
        questionId: string | null;
        envelope: string;
        createdAt: number;
      }[];
    }>('GET', `/v1/inbox?after=${after}`),
  ack: (upTo: number) => call('POST', '/v1/inbox/ack', { upTo }),

  anonymize: (question: string) => call<{ question: string }>('POST', '/v1/circle/anonymize', { question }),
  draft: (question: string, experience: string[], displayName: string) =>
    call<{ draft: string }>('POST', '/v1/circle/draft', { question, experience, displayName }),
  synthesize: (question: string, replies: string[]) =>
    call<{ text: string }>('POST', '/v1/circle/synthesize', { question, replies }),
};
