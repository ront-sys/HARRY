import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteConversation, openConversation, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';
import { Button, Card, H1, P, Screen } from '@/ui/kit';

const when = (t: number) => {
  const d = new Date(t);
  const days = Math.floor((Date.now() - t) / 864e5);
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function History() {
  const conversations = useStore((s) => s.conversations.filter((c) => c.messages.length > 0));
  return (
    <Screen edges={['top', 'bottom']}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 20, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <H1>Past conversations</H1>
            </View>
            <P dim>Encrypted on this phone. Long-press to delete one.</P>
          </View>
        }
        ListEmptyComponent={<P dim>No conversations yet.</P>}
        renderItem={({ item }) => {
          const last = item.messages.at(-1);
          return (
            <Pressable
              onPress={() => {
                openConversation(item.id);
                router.back();
              }}
              onLongPress={() =>
                Alert.alert('Delete this conversation?', 'It will be erased from this phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(item.id) },
                ])
              }>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={st.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={st.when}>{when(item.updatedAt)}</Text>
                </View>
                {last ? (
                  <Text style={st.preview} numberOfLines={2}>
                    {last.role === 'assistant' ? 'Harry: ' : ''}
                    {last.content}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
        ListFooterComponent={<Button title="Done" kind="secondary" onPress={() => router.back()} style={{ marginTop: 12 }} />}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { flex: 1, fontFamily: F.semibold, fontSize: 16, color: C.text },
  when: { fontFamily: F.body, fontSize: 13, color: C.textFaint },
  preview: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textDim },
});
