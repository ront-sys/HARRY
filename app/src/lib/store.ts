import { useSyncExternalStore } from 'react';
import { api, ensureAccount, myUserId, streamChat, type ChatEvent } from './api';
import { b64, getIdentity, newBoxKeyPair, openFrom, randomId, sealFor, unb64, wipeKeys } from './crypto';
import type { ChatMessage, CircleState, Conversation, Group, GroupItem, Profile, Settings } from './types';
import { readVault, wipeVault, writeVault } from './vault';

type State = {
  ready: boolean;
  profile: Profile | null;
  conversations: Conversation[];
  currentId: string | null;
  streaming: boolean;
  settings: Settings;
  groups: Group[];
  circle: CircleState;
  myId: string | null;
};

const initial: State = {
  ready: false,
  profile: null,
  conversations: [],
  currentId: null,
  streaming: false,
  settings: { voiceRate: 0.92, lockAfterSeconds: 30 },
  groups: [],
  circle: { inboxCursor: 0, items: {}, questionKeys: {} },
  myId: null,
};

let state: State = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
  if ('profile' in patch) writeVault('profile', state.profile);
  if ('conversations' in patch) writeVault('conversations', state.conversations, 800);
  if ('settings' in patch) writeVault('settings', state.settings);
  if ('circle' in patch) writeVault('circle', state.circle);
}
export const getState = () => state;
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}

// ---------- lifecycle ----------

export async function loadVault() {
  const [profile, conversations, settings, circle] = await Promise.all([
    readVault<Profile | null>('profile', null),
    readVault<Conversation[]>('conversations', []),
    readVault<Settings>('settings', initial.settings),
    readVault<CircleState>('circle', initial.circle),
  ]);
  state = {
    ...state,
    ready: true,
    profile,
    conversations,
    settings: { ...initial.settings, ...settings },
    circle: { ...initial.circle, ...circle },
    currentId: conversations[0]?.id ?? null,
  };
  emit();
}

export async function completeOnboarding(profile: Profile) {
  await ensureAccount(profile.displayName);
  const myId = await myUserId();
  const convo = newConvoObject();
  set({ profile, conversations: [convo], currentId: convo.id, myId });
  // Harry opens the first conversation, tuned to where he is in life.
  void runTurn(convo.id, 'chat', { kickoff: true });
}

export function updateProfile(patch: Partial<Profile>) {
  if (!state.profile) return;
  const before = state.profile.displayName;
  set({ profile: { ...state.profile, ...patch } });
  if (patch.displayName && patch.displayName !== before) api.renameAlias(patch.displayName).catch(() => {});
}

export const updateSettings = (patch: Partial<Settings>) => set({ settings: { ...state.settings, ...patch } });

export async function wipeEverything() {
  try {
    await api.deleteAccount();
  } catch {
    // offline: still wipe locally
  }
  wipeVault();
  await wipeKeys();
  state = { ...initial, ready: true };
  emit();
}

// ---------- conversations with Harry ----------

function newConvoObject(): Conversation {
  const now = Date.now();
  return { id: randomId(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [] };
}

export function newConversation() {
  const cur = currentConversation();
  if (cur && cur.messages.filter((m) => m.role === 'user').length === 0) return cur.id;
  if (cur) void learnFrom(cur.id);
  const c = newConvoObject();
  set({ conversations: [c, ...state.conversations], currentId: c.id });
  return c.id;
}

export const openConversation = (id: string) => set({ currentId: id });
export function deleteConversation(id: string) {
  const conversations = state.conversations.filter((c) => c.id !== id);
  set({ conversations, currentId: state.currentId === id ? (conversations[0]?.id ?? null) : state.currentId });
}
export const currentConversation = () => state.conversations.find((c) => c.id === state.currentId) ?? null;

function patchConvo(id: string, fn: (c: Conversation) => Conversation) {
  set({
    conversations: state.conversations
      .map((c) => (c.id === id ? fn(c) : c))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  });
}

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 46)}…` : t;
}

let activeAbort: AbortController | null = null;
export function cancelReply() {
  activeAbort?.abort();
}

/** Send a message to Harry. `onEvent` lets voice mode speak as text arrives. */
export async function sendToHarry(text: string, mode: 'chat' | 'voice', onEvent?: (e: ChatEvent) => void) {
  const trimmed = text.trim();
  if (!trimmed || state.streaming) return;
  let id = state.currentId;
  if (!id || !state.conversations.some((c) => c.id === id)) id = newConversation();
  const msg: ChatMessage = { id: randomId(), role: 'user', content: trimmed, at: Date.now() };
  patchConvo(id, (c) => ({
    ...c,
    title: c.messages.some((m) => m.role === 'user') ? c.title : titleFrom(trimmed),
    updatedAt: Date.now(),
    messages: [...c.messages, msg],
  }));
  await runTurn(id, mode, { onEvent });
}

async function runTurn(convoId: string, mode: 'chat' | 'voice', opts: { kickoff?: boolean; onEvent?: (e: ChatEvent) => void }) {
  const profile = state.profile;
  const convo = state.conversations.find((c) => c.id === convoId);
  if (!profile || !convo) return;
  const reply: ChatMessage = { id: randomId(), role: 'assistant', content: '', at: Date.now() };
  const history = convo.messages;
  patchConvo(convoId, (c) => ({ ...c, messages: [...c.messages, reply] }));
  set({ streaming: true });
  activeAbort = new AbortController();

  const update = (fn: (m: ChatMessage) => ChatMessage) =>
    patchConvo(convoId, (c) => ({ ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === reply.id ? fn(m) : m)) }));

  // Batch UI updates for smooth rendering while tokens stream.
  let pendingText = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flushText = () => {
    timer = null;
    if (!pendingText) return;
    const add = pendingText;
    pendingText = '';
    update((m) => ({ ...m, content: m.content + add }));
  };

  try {
    await streamChat(
      { profile, messages: history, mode, kickoff: opts.kickoff },
      (e) => {
        opts.onEvent?.(e);
        if (e.type === 'delta') {
          pendingText += e.text;
          if (!timer) timer = setTimeout(flushText, 50);
        } else if (e.type === 'flags') {
          if (e.crisis) update((m) => ({ ...m, crisis: true }));
        } else if (e.type === 'sources') {
          update((m) => ({ ...m, sources: e.sources }));
        } else if (e.type === 'done') {
          update((m) => ({ ...m, verified: e.verified }));
        } else if (e.type === 'error') {
          pendingText += (pendingText ? '\n\n' : '') + e.message;
        }
      },
      activeAbort.signal,
    );
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      pendingText += "\n\nI lost the connection for a second. Mind sending that again?";
      opts.onEvent?.({ type: 'error', message: 'network' });
    }
  } finally {
    if (timer) clearTimeout(timer);
    flushText();
    activeAbort = null;
    set({ streaming: false });
    // Drop an empty reply bubble if nothing came back.
    const c = state.conversations.find((x) => x.id === convoId);
    if (c?.messages.find((m) => m.id === reply.id && !m.content.trim())) {
      patchConvo(convoId, (x) => ({ ...x, messages: x.messages.filter((m) => m.id !== reply.id) }));
    }
    const userTurns = c?.messages.filter((m) => m.role === 'user').length ?? 0;
    if (userTurns > 0 && userTurns % 6 === 0) void learnFrom(convoId);
  }
}

/** Fold what Harry learned in a conversation into the profile notes. */
export async function learnFrom(convoId: string) {
  const c = state.conversations.find((x) => x.id === convoId);
  if (!c || !state.profile) return;
  const fresh = c.messages.slice(Math.max(0, (c.learnedThrough ?? 0) - 6));
  if (fresh.filter((m) => m.role === 'user').length < 2) return;
  try {
    const out = await api.learn(state.profile, fresh);
    updateProfile({ notes: out.notes, lifeFocus: out.lifeFocus.length ? out.lifeFocus : state.profile.lifeFocus });
    patchConvo(convoId, (x) => ({ ...x, learnedThrough: x.messages.length, updatedAt: x.updatedAt }));
  } catch {
    // try again next time
  }
}

// ---------- Circle: groups and end-to-end encrypted messaging ----------

type Payload =
  | { t: 'chat'; text: string }
  | { t: 'question'; text: string; replyPk: string }
  | { t: 'reply'; text: string };

function pushItems(groupId: string, items: GroupItem[]) {
  const existing = state.circle.items[groupId] ?? [];
  const seen = new Set(existing.map((i) => i.id));
  const merged = [...existing, ...items.filter((i) => !seen.has(i.id))].sort((a, b) => a.at - b.at).slice(-500);
  set({ circle: { ...state.circle, items: { ...state.circle.items, [groupId]: merged } } });
}

export async function refreshGroups() {
  const [{ groups }, myId] = await Promise.all([api.groups(), myUserId()]);
  set({ groups, myId });
  return groups;
}

export async function createGroup(name: string) {
  const g = await api.createGroup(name);
  await refreshGroups();
  return g;
}

export async function joinWithCode(code: string) {
  const g = await api.acceptInvite(code.trim());
  await refreshGroups();
  return g;
}

export async function leaveGroup(groupId: string) {
  await api.leaveGroup(groupId);
  const items = { ...state.circle.items };
  delete items[groupId];
  set({ circle: { ...state.circle, items } });
  await refreshGroups();
}

async function fanOut(stale: Group, payload: Payload, opts: { kind: 'chat' | 'circle_question'; anonymous: boolean }) {
  // Refresh membership first so people who just joined get the message too.
  const group = (await refreshGroups().catch(() => [stale])).find((g) => g.id === stale.id) ?? stale;
  const id = await getIdentity();
  const me = state.myId ?? (await myUserId());
  const items = group.members
    .filter((m) => m.id !== me)
    .map((m) => ({ recipientId: m.id, envelope: sealFor(unb64(m.boxPk), payload, opts.anonymous ? undefined : id.signSk) }));
  if (!items.length) return { questionId: null as string | null, delivered: 0 };
  const res = await api.send({ groupId: group.id, kind: opts.kind, anonymous: opts.anonymous, items });
  return { questionId: res.questionId, delivered: res.delivered };
}

export async function sendGroupMessage(group: Group, text: string) {
  const t = text.trim();
  if (!t) return;
  await fanOut(group, { t: 'chat', text: t }, { kind: 'chat', anonymous: false });
  pushItems(group.id, [{ id: randomId(), type: 'chat', from: state.profile?.displayName ?? 'Me', text: t, at: Date.now(), mine: true }]);
}

/** Ask the circle through Harry. Replies come back encrypted to a one-time key. */
export async function askCircle(group: Group, question: string, anonymous: boolean) {
  const kp = newBoxKeyPair();
  const { questionId, delivered } = await fanOut(
    group,
    { t: 'question', text: question, replyPk: b64(kp.publicKey) },
    { kind: 'circle_question', anonymous },
  );
  if (!questionId) throw new Error('Nobody else is in this Circle yet. Invite someone first.');
  set({ circle: { ...state.circle, questionKeys: { ...state.circle.questionKeys, [questionId]: b64(kp.secretKey) } } });
  pushItems(group.id, [{ id: `q-${questionId}`, type: 'question', questionId, text: question, at: Date.now(), mine: true, anonymous }]);
  return delivered;
}

export async function answerQuestion(groupId: string, item: Extract<GroupItem, { type: 'question' }>, text: string) {
  if (!item.replyPk) return;
  await api.reply(item.questionId, sealFor(unb64(item.replyPk), { t: 'reply', text }));
  const items = (state.circle.items[groupId] ?? []).map((i) => (i.id === item.id ? { ...i, answered: true } : i));
  set({ circle: { ...state.circle, items: { ...state.circle.items, [groupId]: items } } });
}

export async function draftAnswer(question: string) {
  const p = state.profile;
  const { draft } = await api.draft(question, p?.circleExperience ?? [], p?.displayName ?? 'Friend');
  return draft;
}

export async function summarizeReplies(groupId: string, questionId: string) {
  const items = state.circle.items[groupId] ?? [];
  const q = items.find((i) => i.type === 'question' && i.questionId === questionId);
  const replies = items.filter((i) => i.type === 'reply' && i.questionId === questionId).map((i) => i.text);
  if (!q || !replies.length) return;
  const { text } = await api.synthesize(q.text, replies);
  pushItems(groupId, [{ id: `s-${questionId}-${replies.length}`, type: 'synthesis', questionId, text, at: Date.now() }]);
}

let polling = false;
/** Fetch, decrypt, and acknowledge new envelopes. The server deletes them after ack. */
export async function pollInbox() {
  if (polling || !state.profile) return;
  polling = true;
  try {
    const id = await getIdentity();
    const { messages } = await api.inbox(state.circle.inboxCursor);
    if (!messages.length) return;
    let groups = state.groups;
    const known = (gid: string, uid: string | null) => !uid || !!groups.find((g) => g.id === gid)?.members.some((x) => x.id === uid);
    if (!groups.length || messages.some((m) => !known(m.groupId, m.senderId))) groups = await refreshGroups();
    const byGroup: Record<string, GroupItem[]> = {};
    for (const m of messages) {
      const group = groups.find((g) => g.id === m.groupId);
      const sender = group?.members.find((x) => x.id === m.senderId);
      const add = (item: GroupItem) => (byGroup[m.groupId] ??= []).push(item);
      if (m.kind === 'circle_reply') {
        const sk = m.questionId ? state.circle.questionKeys[m.questionId] : undefined;
        const p = sk ? openFrom<Payload>(m.envelope, unb64(sk)) : null;
        if (p?.t === 'reply') add({ id: `r-${m.id}`, type: 'reply', questionId: m.questionId!, text: p.text, at: m.createdAt });
        continue;
      }
      // Signed messages must verify against the sender's identity key.
      const p = openFrom<Payload>(m.envelope, id.boxSk, sender ? unb64(sender.signPk) : undefined);
      if (!p || (m.senderId && !sender)) continue;
      if (m.kind === 'chat' && p.t === 'chat') {
        add({ id: `m-${m.id}`, type: 'chat', from: sender?.alias ?? 'Someone', text: p.text, at: m.createdAt, mine: false });
      } else if (m.kind === 'circle_question' && p.t === 'question' && m.questionId) {
        add({
          id: `q-${m.questionId}`,
          type: 'question',
          questionId: m.questionId,
          text: p.text,
          replyPk: p.replyPk,
          at: m.createdAt,
          mine: false,
          anonymous: !m.senderId,
        });
      }
    }
    for (const [gid, items] of Object.entries(byGroup)) pushItems(gid, items);
    const last = messages[messages.length - 1].id;
    set({ circle: { ...state.circle, inboxCursor: last } });
    await api.ack(last);
  } catch {
    // offline; try again on the next tick
  } finally {
    polling = false;
  }
}
