import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cancelReply, newConversation, sendToHarry, useStore } from '@/lib/store';
import { C, F, R } from '@/lib/theme';
import { useDictation } from '@/lib/useDictation';
import { Screen } from '@/ui/kit';
import { MessageBubble } from '@/ui/MessageBubble';

function IconButton({ name, onPress, label, active }: { name: React.ComponentProps<typeof SymbolView>['name']; onPress: () => void; label: string; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8} style={[st.icon, active && { backgroundColor: C.accent }]}>
      <SymbolView name={name} size={20} tintColor={active ? C.onAccent : C.text} />
    </Pressable>
  );
}

export default function Talk() {
  const convo = useStore((s) => s.conversations.find((c) => c.id === s.currentId) ?? null);
  const streaming = useStore((s) => s.streaming);
  const name = useStore((s) => s.profile?.displayName ?? '');
  const [text, setText] = useState('');
  const [base, setBase] = useState('');
  const dict = useDictation({
    onFinal: (t) => setText((base ? `${base} ` : '') + t),
  });

  const messages = useMemo(() => [...(convo?.messages ?? [])].reverse(), [convo?.messages]);
  const shown = dict.listening ? (base ? `${base} ` : '') + dict.partial : text;

  const send = () => {
    if (dict.listening) dict.stop();
    const t = shown.trim();
    if (!t) return;
    setText('');
    setBase('');
    dict.setPartial('');
    void sendToHarry(t, 'chat');
  };

  const toggleMic = async () => {
    if (dict.listening) {
      dict.stop();
      setText(shown);
    } else {
      setBase(text.trim());
      await dict.start();
    }
  };

  return (
    <Screen>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Harry</Text>
          <Text style={st.subtitle}>{streaming ? 'thinking it over…' : 'here for you'}</Text>
        </View>
        <IconButton name="clock.arrow.circlepath" label="Past conversations" onPress={() => router.push('/history')} />
        <IconButton name="square.and.pencil" label="New conversation" onPress={() => newConversation()} />
        <IconButton name="waveform" label="Talk out loud" onPress={() => router.push('/conversation')} active />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={st.list}
          keyboardDismissMode="interactive"
          renderItem={({ item, index }) => <MessageBubble m={item} typing={streaming && index === 0} />}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={st.emptyTitle}>{streaming ? '' : `What's on your mind${name ? `, ${name}` : ''}?`}</Text>
              <Text style={st.emptyBody}>Type, tap the mic to dictate, or use the waveform to just talk.</Text>
            </View>
          }
        />
        <View style={st.composer}>
          <Pressable onPress={toggleMic} style={[st.mic, dict.listening && { backgroundColor: C.danger }]} accessibilityLabel={dict.listening ? 'Stop dictation' : 'Dictate'}>
            <SymbolView name={dict.listening ? 'stop.fill' : 'mic.fill'} size={18} tintColor={C.text} />
          </Pressable>
          <TextInput
            style={st.input}
            value={shown}
            onChangeText={(t) => {
              if (dict.listening) dict.abort();
              setText(t);
            }}
            placeholder={dict.listening ? 'Listening…' : 'Talk to Harry'}
            placeholderTextColor={C.textFaint}
            selectionColor={C.accent}
            multiline
          />
          {streaming ? (
            <Pressable onPress={cancelReply} style={st.send} accessibilityLabel="Stop reply">
              <SymbolView name="stop.fill" size={16} tintColor={C.onAccent} />
            </Pressable>
          ) : (
            <Pressable onPress={send} disabled={!shown.trim()} style={[st.send, !shown.trim() && { opacity: 0.4 }]} accessibilityLabel="Send">
              <SymbolView name="arrow.up" size={18} tintColor={C.onAccent} weight="bold" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  title: { fontFamily: F.display, fontSize: 28, color: C.text },
  subtitle: { fontFamily: F.displayItalic, fontSize: 14, color: C.textDim },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  list: { padding: 16, gap: 14, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8, transform: [{ scaleY: -1 }] },
  emptyTitle: { fontFamily: F.display, fontSize: 24, color: C.text, textAlign: 'center' },
  emptyBody: { fontFamily: F.body, fontSize: 15, color: C.textDim, textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 44,
    fontFamily: F.body,
    fontSize: 17,
    color: C.text,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
