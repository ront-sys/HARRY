# HARRY

A private AI confidant for men. Harry talks through marriage, work, fatherhood, confidence, health, and everyday decisions in a calm, steady voice. He learns who you are and connects you to an invite-only Circle of the men you trust.

```
app/      iOS app (Expo SDK 58, React Native, TypeScript): builds in the cloud with EAS, no Mac needed
server/   API (Node 22 + Hono): Claude proxy, verified medical search, groups, encrypted message relay
```

## What's in v0.1

| Feature | How it works |
|---|---|
| Face ID lock | The app decrypts and shows nothing until Face ID / Touch ID (passcode as fallback) succeeds. It re-locks after time in the background and covers its contents in the app switcher. |
| Alias | During setup you choose your real name or an alias. Your real name stays on the phone and is never sent. Your server account is pseudonymous: just an alias and public keys. |
| Onboarding | Name or alias, age, height, weight, military service (branch, status, years), relationship, kids, profession (or current job if you have no profession), where you are in life, and how you want to be coached. Harry's first message is written from this profile. |
| Profile that grows | Every few exchanges Harry folds durable facts into "What Harry knows". You can see and delete any of it in the **You** tab. |
| Chat | Streams replies token by token. Uses Claude Opus 5.5 with fast mode on. |
| Dictation | Native iOS speech recognition (SFSpeechRecognizer), shown live in the text box. |
| Conversation mode | Hands-free: you talk, Harry answers out loud, then listens again. Speech starts at the first full sentence and iOS queues the rest, so delivery isn't choppy. Tap the orb to interrupt. You can pick the voice and pace (defaults to the best Enhanced/Premium male voice on the device). |
| Verified health info | A quick triage step (Claude Haiku 5.5 plus a keyword backstop) flags health topics. Harry is then required to search an allowlist of accredited sources (NIH, CDC, VA, Mayo Clinic, Cleveland Clinic, NHS, WHO, APA, and others; see `server/src/sources.ts`) and cite them. Sources appear as "Verified with" chips. If nothing verifies a claim, the app says so and points you to a doctor. |
| Crisis safety | Triage also flags risk. Harry follows a safety protocol and the app shows 988 call/text and 911 buttons (Veterans Crisis Line: press 1). |
| Circle | Invite-only groups. Invite codes are single use and expire after 72 hours. |
| End-to-end encryption | Each Circle message is encrypted separately for every member (X25519 + XSalsa20-Poly1305) and signed (Ed25519). The server only relays ciphertext and deletes it once delivered. Members can compare safety numbers to confirm nobody swapped keys. |
| Ask through Harry (agent to agent) | Your Harry rewrites your question to remove identifying details. You review it, then it goes to the Circle anonymously. Each member's Harry drafts a reply using only the experience notes that member chose to share; the member edits and approves it. Replies are encrypted to a one-time key, so they reach you without anyone learning who asked. Your Harry then sums up what the group said. |
| Encrypted on device | Your profile, conversations, and Circle history are encrypted with a 256-bit key held in the iOS Keychain (this device only), on top of iOS Data Protection. |
| Delete everything | Erases the account on the server, all local data, and the keys. |

## Ship to TestFlight tonight

You need a paid Apple Developer account, an Anthropic API key, and an [Expo account](https://expo.dev/signup) (free).

**1. Deploy the server** (about 10 minutes). With Fly.io:

```bash
cd server
fly launch --no-deploy --copy-config
fly volumes create harry_data --size 1
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

Railway or Render also work: use the Dockerfile, attach a disk at `/data`, and set `ANTHROPIC_API_KEY`. To check it, open `https://<your-app>.fly.dev/health`.

**2. Point the app at it.** In `app/eas.json`, replace both `https://YOUR-HARRY-SERVER.example.com` values with your server URL.

**3. Set your bundle ID.** In `app/app.json`, change `com.harryapp.ios` to an identifier you own (for example `com.yourcompany.harry`).

**4. Build and submit:**

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest init
npm run ios:testflight
```

EAS asks for your Apple ID, creates the certificates and the App Store Connect app record, builds in the cloud (about 15–25 minutes), and uploads the build.

**5. In App Store Connect**, open the build, answer the export-compliance questions, then add yourself and your testers under **TestFlight → Internal Testing**. Internal testers skip Beta App Review, so the build is usually installable within 10–30 minutes of processing.

### Run locally

```bash
cd server && cp .env.example .env
# edit .env and add your key, then:
node --env-file=.env --experimental-strip-types src/index.ts
```

The app uses native modules (Face ID, speech), so it needs a development build rather than Expo Go: run `npm run ios:dev-build` once, install it, then `npx expo start`.

## Privacy model, stated plainly

- **Chats with Harry** are stored only on your phone, encrypted. To generate a reply, the conversation and profile are sent over TLS to the HARRY server, which forwards them to Anthropic's API and stores nothing. The server never logs message content. Anthropic processes the request under its API data policy; ask Anthropic about zero data retention if you need it.
- **Circle messages** are end-to-end encrypted. The server can see who is in which group and when messages are sent, but not what they say. For anonymous questions, it does not tell members who asked.
- **On the server**: aliases, public keys, group membership, invite codes, undelivered ciphertext (deleted on delivery or after 30 days), and a daily usage counter.

## Known gaps (next up)

1. **Forward secrecy.** Circle encryption uses Signal's underlying primitives but not yet the full Signal Protocol (X3DH plus the Double Ratchet). If a phone's identity key is ever stolen, past messages sent to it could be decrypted. Next step: move to `libsignal`.
2. **Push notifications.** The Circle checks for new messages every 10 seconds while the app is open. Next step: APNs push with content-free payloads.
3. **Abuse protection.** The API uses per-account daily limits. Next step: Apple App Attest so only the genuine app can call it.
4. **Voice quality.** iOS system voices sound good with an Enhanced or Premium voice installed. For a truly human, calm voice, add a neural TTS provider behind the server.
5. **App Store submission (beyond TestFlight).** You'll need a privacy policy URL, the App Privacy questionnaire, and a clear "not a medical device / not emergency services" statement in the listing. The app already shows that statement in-app.
6. **Not HIPAA-covered.** Don't market it as a clinical or therapy service.

## Configuration (server environment)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | |
| `HARRY_MODEL` | `claude-opus-5-5` | Main conversation model |
| `HARRY_TRIAGE_MODEL` | `claude-haiku-5-5` | Fast health/crisis routing check before each turn |
| `HARRY_FAST_MODE` | `true` | About 2.5x faster output at 2x the price. Set `false` to halve model cost. |
| `HARRY_DAILY_AI_LIMIT` | `400` | AI calls per account per day |
| `HARRY_DB` | `./data/harry.db` | SQLite file (built into Node 22) |

Harry's persona, coaching approach, medical rules, and crisis protocol live in `server/src/prompts.ts`. The accredited-source allowlist is in `server/src/sources.ts`.
