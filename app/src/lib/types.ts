// Must stay in sync with server/src/schemas.ts ProfileSchema.
export type Profile = {
  displayName: string;
  usesAlias: boolean;
  realName?: string; // kept on device only, never sent anywhere
  age?: number;
  height?: string;
  weight?: string;
  military?: { served: boolean; branch?: string; status?: string; years?: number };
  family?: { relationship?: string; kids?: number; kidsAges?: string; livesWith?: string };
  work?: { profession?: string; job?: string; status?: string };
  lifeFocus?: string[];
  whatBringsYou?: string;
  coachingStyle?: string;
  region?: string;
  notes?: string[];
  /** Things he chose to let his Harry share when answering his Circle. */
  circleExperience?: string[];
};

export type Source = { title: string; url: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
  sources?: Source[];
  verified?: boolean | null;
  crisis?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  learnedThrough?: number; // message count already folded into profile notes
};

export type Member = { id: string; alias: string; boxPk: string; signPk: string };
export type Group = { id: string; name: string; ownerId: string; createdAt: number; members: Member[] };

export type GroupItem =
  | { id: string; type: 'chat'; from: string; text: string; at: number; mine: boolean }
  | { id: string; type: 'question'; questionId: string; text: string; at: number; mine: boolean; anonymous: boolean; replyPk?: string; answered?: boolean }
  | { id: string; type: 'reply'; questionId: string; text: string; at: number }
  | { id: string; type: 'synthesis'; questionId: string; text: string; at: number };

export type CircleState = {
  inboxCursor: number;
  items: Record<string, GroupItem[]>; // by group id
  /** One-time secret keys for decrypting replies to questions I asked. */
  questionKeys: Record<string, string>;
};

export type Settings = {
  voiceId?: string;
  voiceRate: number;
  lockAfterSeconds: number;
};
