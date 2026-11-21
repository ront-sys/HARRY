import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '@/lib/api';
import { b64, getIdentity, safetyNumber } from '@/lib/crypto';
import { answerQuestion, askCircle, draftAnswer, leaveGroup, sendGroupMessage, summarizeReplies, useStore } from '@/lib/store';
import { C, F, R } from '@/lib/theme';
import type { GroupItem } from '@/lib/types';
import { Button, Card, Field, H2, P, Screen } from '@/ui/kit';

type Question = Extract<GroupItem, { type: 'question' }>;

function QuestionCard({ groupId, q, replies }: { groupId: string; q: Question; replies: GroupItem[] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const synthesis = replies.filter((r) => r.type === 'synthesis').at(-1);
  const answers = replies.filter((r) => r.type === 'reply');

  const makeDraft = async () => {
    setBusy(true);
    try {
      setDraft(await draftAnswer(q.text));
    } catch {
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!draft?.trim()) return;
    setBusy(true);
    try {
      await answerQuestion(groupId, q, draft.trim());
      setDraft(null);
    } catch {
      Alert.alert("Couldn't send", 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const summarize = async () => {
    setBusy(true);
    try {
      await summarizeReplies(groupId, q.questionId);
    } catch {
      Alert.alert("Harry couldn't sum it up", 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: C.sage }}>
      <Text style={st.qLabel}>{q.mine ? `You asked${q.anonymous ? ' (anonymously)' : ''}` : q.anonymous ? 'Someone in the Circle asks' : 'A question for the Circle'}</Text>
      <P>{q.text}</P>
      {q.mine ? (
        <>
          <Text style={st.meta}>
            {answers.length} {answers.length === 1 ? 'reply' : 'replies'}
          </Text>
          {answers.map((a) => (
            <View key={a.id} style={st.answer}>
              <P dim>{a.text}</P>
            </View>
          ))}
          {synthesis ? (
            <View style={st.synthesis}>
              <Text style={st.qLabel}>Harry's take</Text>
              <P>{synthesis.text}</P>
            </View>
          ) : null}
          {answers.length > 0 ? <Button title={synthesis ? 'Update Harry’s take' : 'Have Harry sum it up'} kind="secondary" onPress={summarize} loading={busy} /> : null}
        </>
      ) : q.answered ? (
        <Text style={st.meta}>You replied.</Text>
      ) : draft === null ? (
        <Button title="Have my Harry draft a reply" kind="secondary" onPress={makeDraft} loading={busy} />
      ) : (
        <>
          <Field multiline value={draft} onChangeText={setDraft} placeholder="Write your reply" />
          <Text style={st.meta}>Your reply goes only to the person who asked, and they won't see your name.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" kind="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
            <Button title="Send reply" onPress={send} loading={busy} disabled={!draft.trim()} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </Card>
  );
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useStore((s) => s.groups.find((g) => g.id === id));
  const items = useStore((s) => s.circle.items[id] ?? null);
  const myId = useStore((s) => s.myId);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'message' | 'ask'>('message');
  const [preview, setPreview] = useState<{ text: string; anonymous: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const list = useMemo(() => {
    const all = items ?? [];
    return all.filter((i) => i.type === 'chat' || i.type === 'question').reverse();
  }, [items]);

  if (!group) {
    return (
      <Screen>
        <View style={{ padding: 24, gap: 12 }}>
          <P dim>This Circle isn't available.</P>
          <Button title="Back" kind="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const invite = async () => {
    try {
      const { code } = await api.createInvite(group.id);
      await Share.share({
        message: `Join my Circle "${group.name}" on HARRY. Open the app, go to Circle → Join with code, and enter: ${code}\n(Works once, expires in 3 days.)`,
      });
    } catch {
      Alert.alert("Couldn't create an invite", 'Check your connection and try again.');
    }
  };

  const showSafety = async (m: (typeof group.members)[number]) => {
    const me = await getIdentity();
    const num = safetyNumber({ boxPk: b64(me.boxPk), signPk: b64(me.signPk) }, m);
    Alert.alert(`Safety number with ${m.alias}`, `${num}\n\nCompare this with ${m.alias} in person or on a call. If it matches on both phones, nobody is intercepting your messages.`);
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      if (mode === 'message') {
        await sendGroupMessage(group, t);
        setText('');
      } else {
        const { question } = await api.anonymize(t);
        setPreview({ text: question, anonymous: true });
      }
    } catch (e) {
      Alert.alert("Couldn't send", (e as Error).message || 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const confirmAsk = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await askCircle(group, preview.text.trim(), preview.anonymous);
      setPreview(null);
      setText('');
      setMode('message');
    } catch (e) {
      Alert.alert("Couldn't ask", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={20} tintColor={C.text} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setShowMembers((v) => !v)}>
          <Text style={st.title} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={st.meta}>
            {group.members.length} members · end-to-end encrypted {showMembers ? '▴' : '▾'}
          </Text>
        </Pressable>
        <Pressable onPress={invite} style={st.iconBtn} accessibilityLabel="Invite">
          <SymbolView name="person.badge.plus" size={20} tintColor={C.onAccent} />
        </Pressable>
      </View>
      {showMembers ? (
        <View style={st.members}>
          {group.members.map((m) => (
            <Pressable key={m.id} onPress={() => (m.id === myId ? null : showSafety(m))} style={st.member}>
              <Text style={st.memberName}>{m.alias}{m.id === myId ? ' (you)' : ''}</Text>
              {m.id !== myId ? <Text style={st.meta}>Verify safety number</Text> : null}
            </Pressable>
          ))}
          <Button
            title="Leave Circle"
            kind="danger"
            onPress={() =>
              Alert.alert('Leave this Circle?', 'Messages from this Circle will be removed from your phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => leaveGroup(group.id).then(() => router.back()) },
              ])
            }
          />
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          inverted
          data={list}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', transform: [{ scaleY: -1 }], gap: 8 }}>
              <H2 style={{ textAlign: 'center' }}>Quiet in here</H2>
              <P dim style={{ textAlign: 'center' }}>
                {group.members.length < 2 ? 'Tap the invite button to bring someone in.' : 'Say something, or ask the Circle through Harry.'}
              </P>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'question') {
              const related = (items ?? []).filter((r) => (r.type === 'reply' || r.type === 'synthesis') && r.questionId === item.questionId);
              return <QuestionCard groupId={group.id} q={item} replies={related} />;
            }
            if (item.type !== 'chat') return null;
            return (
              <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start', gap: 3 }}>
                {!item.mine ? <Text style={st.from}>{item.from}</Text> : null}
                <View style={[st.bubble, item.mine ? { backgroundColor: C.userBubble } : { backgroundColor: C.harryBubble }]}>
                  <Text style={[st.bubbleText, item.mine && { color: C.onAccent }]}>{item.text}</Text>
                </View>
              </View>
            );
          }}
        />
        <View style={st.modeRow}>
          {(['message', 'ask'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[st.modeChip, mode === m && { backgroundColor: C.surfaceHigh }]}>
              <Text style={[st.modeText, mode === m && { color: C.text }]}>{m === 'message' ? 'Message' : 'Ask through Harry'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.composer}>
          <TextInput
            style={st.input}
            value={text}
            onChangeText={setText}
            placeholder={mode === 'message' ? `Message ${group.name}` : 'What do you want to ask the guys?'}
            placeholderTextColor={C.textFaint}
            selectionColor={C.accent}
            multiline
          />
          <Pressable onPress={submit} disabled={!text.trim() || busy} style={[st.send, (!text.trim() || busy) && { opacity: 0.4 }]} accessibilityLabel="Send">
            {busy ? <ActivityIndicator color={C.onAccent} /> : <SymbolView name="arrow.up" size={18} tintColor={C.onAccent} weight="bold" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={st.sheetWrap}>
          <ScrollView style={st.sheet} contentContainerStyle={{ gap: 14, padding: 24 }} keyboardShouldPersistTaps="handled">
            <H2>Here's how Harry will ask it</H2>
            <P dim>He took out names and details that could identify you. Edit anything you like.</P>
            <Field multiline value={preview?.text ?? ''} onChangeText={(t) => setPreview((p) => (p ? { ...p, text: t } : p))} />
            <View style={st.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.memberName}>Ask anonymously</Text>
                <Text style={st.meta}>Members won't see it came from you. Replies come back only to you.</Text>
              </View>
              <Switch value={preview?.anonymous ?? true} onValueChange={(v) => setPreview((p) => (p ? { ...p, anonymous: v } : p))} trackColor={{ true: C.accent }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Cancel" kind="ghost" onPress={() => setPreview(null)} style={{ flex: 1 }} />
              <Button title="Ask the Circle" onPress={confirmAsk} loading={busy} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  title: { fontFamily: F.display, fontSize: 22, color: C.text },
  meta: { fontFamily: F.body, fontSize: 13, color: C.textDim },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  members: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  member: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  memberName: { fontFamily: F.medium, fontSize: 16, color: C.text },
  from: { fontFamily: F.medium, fontSize: 12, color: C.textDim, marginLeft: 6 },
  bubble: { maxWidth: '84%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleText: { fontFamily: F.body, fontSize: 16, lineHeight: 23, color: C.text },
  qLabel: { fontFamily: F.semibold, fontSize: 12, color: C.sage, letterSpacing: 0.4, textTransform: 'uppercase' },
  answer: { borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 10 },
  synthesis: { backgroundColor: C.surfaceHigh, borderRadius: R.md, padding: 12, gap: 6 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill },
  modeText: { fontFamily: F.medium, fontSize: 14, color: C.textDim },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12 },
  input: { flex: 1, maxHeight: 140, minHeight: 44, fontFamily: F.body, fontSize: 17, color: C.text, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', backgroundColor: C.bgTop, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
