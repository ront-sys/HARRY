import * as z from "zod/v4";

const short = (n = 200) => z.string().trim().max(n);

export const ProfileSchema = z.object({
  displayName: short(60).min(1),
  usesAlias: z.boolean().default(false),
  age: z.number().int().min(13).max(120).optional(),
  height: short(30).optional(),
  weight: short(30).optional(),
  military: z
    .object({
      served: z.boolean(),
      branch: short(60).optional(),
      status: short(60).optional(),
      years: z.number().int().min(0).max(60).optional(),
    })
    .optional(),
  family: z
    .object({
      relationship: short(40).optional(),
      kids: z.number().int().min(0).max(30).optional(),
      kidsAges: short(80).optional(),
      livesWith: short(120).optional(),
    })
    .optional(),
  work: z
    .object({
      profession: short(120).optional(),
      job: short(120).optional(),
      status: short(60).optional(),
    })
    .optional(),
  lifeFocus: z.array(short(120)).max(12).optional(),
  whatBringsYou: short(1000).optional(),
  coachingStyle: short(60).optional(),
  region: short(80).optional(),
  notes: z.array(short(300)).max(60).optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
});

export const ChatRequestSchema = z.object({
  profile: ProfileSchema,
  messages: z.array(ChatTurnSchema).max(400),
  mode: z.enum(["chat", "voice"]).default("chat"),
  kickoff: z.boolean().default(false),
});

export const LearnRequestSchema = z.object({
  profile: ProfileSchema,
  transcript: z.array(ChatTurnSchema).min(1).max(80),
});

export const AnonymizeRequestSchema = z.object({ question: z.string().min(1).max(4000) });

export const DraftRequestSchema = z.object({
  question: z.string().min(1).max(4000),
  experience: z.array(short(500)).max(40),
  displayName: short(60),
});

export const SynthesizeRequestSchema = z.object({
  question: z.string().min(1).max(4000),
  replies: z.array(z.string().max(4000)).min(1).max(50),
});

export const RegisterSchema = z.object({
  alias: short(60).min(1),
  boxPk: z.string().min(40).max(64), // base64 X25519 public key
  signPk: z.string().min(40).max(64), // base64 Ed25519 public key
});

const Envelope = z.string().min(1).max(96_000); // opaque ciphertext JSON, never parsed by the server

export const SendSchema = z.object({
  groupId: z.string().min(1).max(64),
  kind: z.enum(["chat", "circle_question"]),
  anonymous: z.boolean().default(false),
  questionId: z.string().max(64).optional(),
  items: z.array(z.object({ recipientId: z.string().max(64), envelope: Envelope })).min(1).max(100),
});

export const CircleReplySchema = z.object({
  questionId: z.string().min(1).max(64),
  envelope: Envelope,
});
