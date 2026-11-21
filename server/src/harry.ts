import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { ACCREDITED_DOMAINS } from "./sources.ts";
import {
  CRISIS_SYSTEM_NOTE,
  HARRY_SYSTEM,
  KICKOFF_INSTRUCTION,
  MEDICAL_SYSTEM_NOTE,
  VOICE_MODE_ADDENDUM,
  renderProfile,
} from "./prompts.ts";
import type { Profile } from "./schemas.ts";

// The SDK reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

// Main conversation model: the most capable Opus. Triage (a yes/no routing
// check that runs before each turn) uses the fast small model so the
// medical-verification and crisis rules can be enforced without adding
// noticeable latency.
const MAIN_MODEL = process.env.HARRY_MODEL ?? "claude-opus-5-5";
const TRIAGE_MODEL = process.env.HARRY_TRIAGE_MODEL ?? "claude-haiku-5-5";
// Fast mode: up to ~2.5x faster output on Opus 5.5, at premium pricing.
const FAST_MODE = (process.env.HARRY_FAST_MODE ?? "true") === "true";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Source = { title: string; url: string };
export type ChatEvent =
  | { type: "flags"; medical: boolean; crisis: boolean }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done"; verified: boolean | null }
  | { type: "error"; message: string };

// ---------- Triage ----------

const TriageSchema = z.object({
  medical: z.boolean().describe("Health, medical, mental-health-clinical, medication, substance, symptom, or nutrition-for-a-condition topic"),
  crisis: z.boolean().describe("Any sign of suicidal thoughts, self-harm, harming others, abuse, or immediate danger"),
});

const CRISIS_PATTERN =
  /\b(kill (myself|me)|suicid|end (it|my life)|don'?t want to (live|be here)|self[- ]?harm|hurt (myself|someone)|no reason to live|better off (dead|without me)|overdose)\b/i;
const MEDICAL_PATTERN =
  /\b(medic|dose|dosage|mg\b|pill|prescri|symptom|diagnos|doctor|blood pressure|testosterone|\btrt\b|ed\b|erectile|depress|anxiety|ptsd|insomnia|sleep apnea|alcohol|drinking|drug|supplement|pain|chest|heart|diabet|cholesterol|cancer|therapy|ssri|adderall|weed|cannabis|vasectomy|prostate)\w*/i;

export async function triage(latest: string): Promise<{ medical: boolean; crisis: boolean }> {
  const heuristic = { medical: MEDICAL_PATTERN.test(latest), crisis: CRISIS_PATTERN.test(latest) };
  try {
    const res = await client.messages.parse(
      {
        model: TRIAGE_MODEL,
        max_tokens: 256,
        output_config: { effort: "low", format: zodOutputFormat(TriageSchema) },
        system:
          "You route messages for a men's support app. Classify the user's latest message. Be inclusive: when unsure whether it's health-related, answer true. When unsure about risk, answer true.",
        messages: [{ role: "user", content: `<message>\n${latest.slice(0, 4000)}\n</message>` }],
      },
      { timeout: 4000, maxRetries: 0 },
    );
    const out = res.parsed_output;
    if (!out) return heuristic;
    // Union with the keyword backstop: never let one path silently drop a flag.
    return { medical: out.medical || heuristic.medical, crisis: out.crisis || heuristic.crisis };
  } catch {
    return heuristic;
  }
}

// ---------- Main chat ----------

function buildSystem(profile: Profile, mode: "chat" | "voice"): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: HARRY_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: renderProfile(profile) },
  ];
  if (mode === "voice") blocks.push({ type: "text", text: VOICE_MODE_ADDENDUM });
  return blocks;
}

// Text-only history from the device. Merge consecutive same-role turns and
// make sure the conversation starts with the user, as the API requires.
function normalizeHistory(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns.slice(-60)) {
    const text = t.content.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n\n${text}`;
    else out.push({ role: t.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function collectSources(message: Anthropic.Beta.BetaMessage): Source[] {
  const cited = new Map<string, Source>();
  const searched = new Map<string, Source>();
  for (const block of message.content) {
    if (block.type === "text" && block.citations) {
      for (const c of block.citations) {
        if (c.type === "web_search_result_location") cited.set(c.url, { url: c.url, title: c.title ?? c.url });
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") searched.set(r.url, { url: r.url, title: r.title });
      }
    }
  }
  return [...(cited.size ? cited : searched).values()].slice(0, 8);
}

export async function* chat(opts: {
  profile: Profile;
  history: ChatTurn[];
  mode: "chat" | "voice";
  kickoff: boolean;
  signal: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const messages = normalizeHistory(opts.history);
  let flags = { medical: false, crisis: false };

  if (opts.kickoff) {
    messages.length = 0;
    messages.push({ role: "user", content: "(I just finished setting up the app.)" }, { role: "system", content: KICKOFF_INSTRUCTION });
  } else {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") {
      yield { type: "error", message: "Conversation must end with a message from you." };
      return;
    }
    flags = await triage(typeof last.content === "string" ? last.content : "");
    yield { type: "flags", ...flags };
    // Operator notes ride as mid-conversation system messages right after the
    // user's turn, so the cached system prompt prefix is untouched.
    const notes = [flags.crisis ? CRISIS_SYSTEM_NOTE : "", flags.medical ? MEDICAL_SYSTEM_NOTE : ""].filter(Boolean);
    if (notes.length) messages.push({ role: "system", content: notes.join("\n\n") });
  }

  const base: Anthropic.Beta.MessageCreateParamsStreaming = {
    model: MAIN_MODEL,
    max_tokens: opts.mode === "voice" ? 4000 : 16000,
    stream: true,
    system: buildSystem(opts.profile, opts.mode),
    // Opus 5.5 always thinks adaptively; effort is the only depth control.
    // Voice turns need snappy replies; written chat gets a bit more care.
    output_config: { effort: opts.mode === "voice" && !flags.medical ? "low" : "medium" },
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 4,
        allowed_domains: ACCREDITED_DOMAINS,
      },
    ],
    betas: [FALLBACK_BETA],
    // If a safety classifier declines, the API re-runs the turn on a
    // fallback model inside the same call instead of returning nothing.
    fallbacks: "default",
    messages,
  };

  let useFast = FAST_MODE;
  let plain = false; // set if the API rejects an optional feature for this account
  let lastMessage: Anthropic.Beta.BetaMessage | null = null;

  // pause_turn: the server-side search loop hit its iteration cap; resend the
  // assistant content so it resumes. Cap continuations.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { betas, fallbacks, ...core } = base;
    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      ...(plain ? core : { ...core, betas, fallbacks }),
      messages: [...base.messages],
      ...(useFast && !plain ? { speed: "fast" as const } : {}),
    };
    let emitted = false;
    try {
      const stream = client.beta.messages.stream(params, { signal: opts.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emitted = true;
          yield { type: "delta", text: event.delta.text };
        }
      }
      lastMessage = await stream.finalMessage();
    } catch (err) {
      // Fast mode has its own rate limit: fall back to standard speed once.
      if (err instanceof Anthropic.RateLimitError && useFast && !emitted) {
        useFast = false;
        attempt--;
        continue;
      }
      // Optional extras (fast mode, server-side fallbacks) may not be enabled
      // on every account: retry once with a plain request.
      if (err instanceof Anthropic.BadRequestError && !plain && !emitted) {
        console.warn("chat: retrying without optional features:", err.message.slice(0, 200));
        plain = true;
        attempt--;
        continue;
      }
      if (err instanceof Anthropic.APIUserAbortError) return;
      console.error("chat error", err instanceof Anthropic.APIError ? `${err.status} ${err.name}` : err);
      yield { type: "error", message: "Harry couldn't reach his brain just now. Try again in a moment." };
      return;
    }

    if (lastMessage.stop_reason === "pause_turn") {
      base.messages.push({ role: "assistant", content: lastMessage.content });
      continue;
    }
    break;
  }

  if (!lastMessage) return;
  if (lastMessage.stop_reason === "refusal") {
    yield {
      type: "delta",
      text: "I'm not able to help with that one. If you're going through something heavy, I'm still here to talk, and you can always reach a real person at 988.",
    };
  }
  const sources = collectSources(lastMessage);
  if (sources.length) yield { type: "sources", sources };
  yield { type: "done", verified: flags.medical ? sources.length > 0 : null };
}

// ---------- Profile learning ----------

const LearnSchema = z.object({
  notes: z
    .array(z.string())
    .describe("The complete updated list of durable notes about him, each one short sentence. Max 40."),
  lifeFocus: z.array(z.string()).describe("Updated short phrases for where he is in life right now. Max 6."),
});

export async function learn(profile: Profile, transcript: ChatTurn[]) {
  const res = await client.messages.parse({
    model: MAIN_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(LearnSchema) },
    system:
      "You maintain the memory of Harry, an AI confidant for men. Given his current profile and a recent conversation, return an updated list of durable, useful facts (life situation, people in his life by role, goals, preferences, ongoing challenges, what helped). Keep existing notes unless the conversation corrects them. Exclude passwords, account numbers, exact addresses, and anything about third parties beyond their role and relevant context. Exclude one-off small talk. Write neutrally and kindly.",
    messages: [
      {
        role: "user",
        content: `${renderProfile(profile)}\n\n<conversation>\n${transcript
          .map((t) => `${t.role === "user" ? "Him" : "Harry"}: ${t.content}`)
          .join("\n")}\n</conversation>`,
      },
    ],
  });
  const out = res.parsed_output;
  if (!out) throw new Error("learn: unparsed output");
  return { notes: out.notes.slice(0, 40), lifeFocus: out.lifeFocus.slice(0, 6) };
}

// ---------- Circle (agent-to-agent) ----------

async function oneShot(system: string, user: string, maxTokens = 2000): Promise<string> {
  const res = await client.messages.create({
    model: MAIN_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error("refused");
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Rewrites a question so other members can't tell who asked it.
export function anonymize(question: string) {
  return oneShot(
    "Rewrite a man's question so it can be posted anonymously to a small private group of his friends and family. Remove or generalize names, places, employers, dates, and any detail that would identify him or the people involved, while keeping the substance needed to give good advice. Write it in first person, plainly. Output only the rewritten question.",
    `<question>\n${question}\n</question>`,
    1500,
  );
}

// Drafts a reply on behalf of a Circle member, from only the experience he
// explicitly chose to share. The member reviews before anything is sent.
export function draftReply(question: string, experience: string[], displayName: string) {
  return oneShot(
    `You are Harry, the AI confidant of ${displayName}. Someone in his trusted circle asked an anonymous question. Draft a short, supportive reply in ${displayName}'s voice (first person) that he can review and send. Base any personal perspective only on the experience notes he chose to share; never invent experiences. If the notes don't cover it, offer encouragement and a practical thought instead. No health claims. 2-5 sentences. Output only the reply.`,
    `<question>\n${question}\n</question>\n<shared_experience>\n${experience.join("\n") || "(none shared)"}\n</shared_experience>`,
    1200,
  );
}

// Blends replies from the circle into one takeaway for the asker.
export function synthesize(question: string, replies: string[]) {
  return oneShot(
    "You are Harry, an AI confidant. A man asked his private circle a question anonymously. Summarize what they said into a warm, honest takeaway for him: the common threads, any meaningful disagreement, and one practical next step. Don't attribute replies to anyone. 3-6 sentences. No lists.",
    `<question>\n${question}\n</question>\n${replies.map((r, i) => `<reply n="${i + 1}">\n${r}\n</reply>`).join("\n")}`,
  );
}
