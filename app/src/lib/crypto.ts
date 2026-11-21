import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';

// tweetnacl needs a CSPRNG. Use the OS one (SecRandomCopyBytes on iOS).
nacl.setPRNG((x: Uint8Array, n: number) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

// ---------- encoding ----------
const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s: string) => enc.encode(s);
export const fromUtf8 = (b: Uint8Array) => dec.decode(b);

export function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// ---------- keychain ----------
// Secrets live in the iOS Keychain, readable only while the device is
// unlocked, and never synced or backed up off this device.
const KC: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const K_VAULT = 'harry.vaultKey.v1';
const K_IDENTITY = 'harry.identity.v1';
const K_SESSION = 'harry.session.v1';

export type Identity = {
  boxPk: Uint8Array;
  boxSk: Uint8Array;
  signPk: Uint8Array;
  signSk: Uint8Array;
};

let vaultKey: Uint8Array | null = null;
let identity: Identity | null = null;

export async function getVaultKey(): Promise<Uint8Array> {
  if (vaultKey) return vaultKey;
  const stored = await SecureStore.getItemAsync(K_VAULT, KC);
  if (stored) vaultKey = unb64(stored);
  else {
    vaultKey = nacl.randomBytes(32);
    await SecureStore.setItemAsync(K_VAULT, b64(vaultKey), KC);
  }
  return vaultKey;
}

export async function getIdentity(): Promise<Identity> {
  if (identity) return identity;
  const stored = await SecureStore.getItemAsync(K_IDENTITY, KC);
  if (stored) {
    const j = JSON.parse(stored);
    identity = { boxPk: unb64(j.boxPk), boxSk: unb64(j.boxSk), signPk: unb64(j.signPk), signSk: unb64(j.signSk) };
  } else {
    const box = nacl.box.keyPair();
    const sign = nacl.sign.keyPair();
    identity = { boxPk: box.publicKey, boxSk: box.secretKey, signPk: sign.publicKey, signSk: sign.secretKey };
    await SecureStore.setItemAsync(
      K_IDENTITY,
      JSON.stringify({ boxPk: b64(box.publicKey), boxSk: b64(box.secretKey), signPk: b64(sign.publicKey), signSk: b64(sign.secretKey) }),
      KC,
    );
  }
  return identity;
}

export type Session = { userId: string; token: string };
export async function getSession(): Promise<Session | null> {
  const s = await SecureStore.getItemAsync(K_SESSION, KC);
  return s ? (JSON.parse(s) as Session) : null;
}
export const setSession = (s: Session) => SecureStore.setItemAsync(K_SESSION, JSON.stringify(s), KC);

export async function wipeKeys() {
  await Promise.all([K_VAULT, K_IDENTITY, K_SESSION].map((k) => SecureStore.deleteItemAsync(k, KC)));
  vaultKey = null;
  identity = null;
}

// ---------- at-rest encryption (XSalsa20-Poly1305) ----------
export async function sealLocal(value: unknown): Promise<string> {
  const key = await getVaultKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8(JSON.stringify(value)), nonce, key);
  return JSON.stringify({ v: 1, n: b64(nonce), c: b64(box) });
}
export async function openLocal<T>(sealed: string): Promise<T> {
  const key = await getVaultKey();
  const j = JSON.parse(sealed);
  const plain = nacl.secretbox.open(unb64(j.c), unb64(j.n), key);
  if (!plain) throw new Error('vault: decryption failed');
  return JSON.parse(fromUtf8(plain)) as T;
}

// ---------- end-to-end encryption between people ----------
// Each message is encrypted separately for each recipient with a fresh
// ephemeral X25519 key (Curve25519 + XSalsa20-Poly1305, the same primitives
// Signal builds on), and signed with the sender's Ed25519 identity key so the
// recipient knows who sent it. The server only ever relays ciphertext.
export type Envelope = { v: 1; e: string; n: string; c: string; s?: string };

export function sealFor(recipientBoxPk: Uint8Array, payload: unknown, signSk?: Uint8Array): string {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const c = nacl.box(utf8(JSON.stringify(payload)), nonce, recipientBoxPk, eph.secretKey);
  const env: Envelope = { v: 1, e: b64(eph.publicKey), n: b64(nonce), c: b64(c) };
  if (signSk) env.s = b64(nacl.sign.detached(concat(eph.publicKey, nonce, c), signSk));
  return JSON.stringify(env);
}

/** Returns the payload, or null if it can't be decrypted or the signature doesn't match. */
export function openFrom<T>(envelope: string, boxSk: Uint8Array, senderSignPk?: Uint8Array): T | null {
  try {
    const env = JSON.parse(envelope) as Envelope;
    const e = unb64(env.e);
    const n = unb64(env.n);
    const c = unb64(env.c);
    if (senderSignPk) {
      if (!env.s || !nacl.sign.detached.verify(concat(e, n, c), unb64(env.s), senderSignPk)) return null;
    }
    const plain = nacl.box.open(c, n, e, boxSk);
    return plain ? (JSON.parse(fromUtf8(plain)) as T) : null;
  } catch {
    return null;
  }
}

export const newBoxKeyPair = () => nacl.box.keyPair();

/** Safety number: compare in person to confirm nobody swapped keys. */
export function safetyNumber(a: { boxPk: string; signPk: string }, b: { boxPk: string; signPk: string }): string {
  const fp = (k: { boxPk: string; signPk: string }) => nacl.hash(concat(unb64(k.boxPk), unb64(k.signPk)));
  const [x, y] = [fp(a), fp(b)].sort((p, q) => (b64(p) < b64(q) ? -1 : 1));
  const h = nacl.hash(concat(x, y));
  const digits: string[] = [];
  for (let i = 0; i < 12; i++) {
    const n = ((h[i * 2] << 8) | h[i * 2 + 1]) % 100000;
    digits.push(String(n).padStart(5, '0'));
  }
  return digits.join(' ');
}

export const randomId = () => b64(nacl.randomBytes(12)).replace(/[+/=]/g, (ch) => ({ '+': '-', '/': '_', '=': '' })[ch] ?? '');
