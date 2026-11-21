import * as Speech from 'expo-speech';

// Calm, unhurried delivery. iOS "Enhanced"/"Premium" voices sound far more
// natural; users can download more in Settings > Accessibility > Spoken Content.
const PREFERRED = ['Evan', 'Nathan', 'Aaron', 'Tom', 'Arthur', 'Daniel', 'Alex', 'Jamie', 'Oliver'];
const AVOID = /Fred|Albert|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Bad News|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Junior|Ralph|Grandpa|Rocko|Eddy|Reed/i;

let cachedVoice: string | undefined;

export async function listVoices() {
  const voices = await Speech.getAvailableVoicesAsync();
  return voices
    .filter((v) => v.language.startsWith('en') && !AVOID.test(v.name))
    .sort((a, b) => score(b) - score(a));
}

function score(v: Speech.Voice): number {
  let s = 0;
  if (/premium/i.test(v.identifier)) s += 40;
  if (/enhanced/i.test(v.identifier) || v.quality === Speech.VoiceQuality.Enhanced) s += 25;
  if (v.language === 'en-US') s += 10;
  const i = PREFERRED.findIndex((n) => v.name.startsWith(n));
  if (i >= 0) s += 20 - i;
  return s;
}

export async function bestVoice(preferred?: string): Promise<string | undefined> {
  if (preferred) return preferred;
  if (cachedVoice) return cachedVoice;
  cachedVoice = (await listVoices())[0]?.identifier;
  return cachedVoice;
}

/** Turn markdown-ish text into something pleasant to hear. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Speaks a streamed reply sentence by sentence so Harry starts talking right
 * away. iOS queues utterances back to back, so delivery stays smooth.
 */
export class SentenceSpeaker {
  private buf = '';
  private queued = 0;
  private ended = false;
  private stopped = false;
  constructor(
    private voice: string | undefined,
    private rate: number,
    private onFinished: () => void,
  ) {}

  push(delta: string) {
    if (this.stopped) return;
    this.buf += delta;
    // Speak complete sentences; keep very short fragments together so the
    // rhythm doesn't feel clipped.
    const re = /^([\s\S]*?[.!?…]["')\]]?)(\s+)/;
    let m: RegExpMatchArray | null;
    while ((m = this.buf.match(re)) && m[1].length >= 24) {
      this.say(m[1]);
      this.buf = this.buf.slice(m[0].length);
    }
  }

  end() {
    this.ended = true;
    if (this.buf.trim()) this.say(this.buf);
    this.buf = '';
    if (this.queued === 0) this.finish();
  }

  stop() {
    this.stopped = true;
    this.buf = '';
    Speech.stop();
  }

  private say(text: string) {
    const clean = speakable(text);
    if (!clean) return;
    this.queued++;
    const done = () => {
      this.queued--;
      if (this.ended && this.queued === 0) this.finish();
    };
    Speech.speak(clean, {
      voice: this.voice,
      language: 'en-US',
      rate: this.rate,
      pitch: 0.96,
      onDone: done,
      onStopped: done,
      onError: done,
    });
  }

  private finish() {
    if (this.stopped) return;
    this.stopped = true;
    this.onFinished();
  }
}
