import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { createGroup, joinWithCode, pollInbox, refreshGroups, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';
import { Button, Card, Field, H1, P, Screen } from '@/ui/kit';

export default function Circle() {
  const groups = useStore((s) => s.groups);
  const items = useStore((s) => s.circle.items);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshGroups(), pollInbox()]);
    setRefreshing(false);
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      const g = mode === 'create' ? await createGroup(value.trim()) : await joinWithCode(value);
      setMode('none');
      setValue('');
      router.push({ pathname: '/group/[id]', params: { id: g.id } });
    } catch {
      Alert.alert(mode === 'join' ? "That code didn't work" : "Couldn't create the Circle", mode === 'join' ? 'Invite codes work once and expire after 3 days. Ask for a fresh one.' : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textDim} />}
        contentContainerStyle={st.list}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <H1>Your Circle</H1>
            <P dim>
              Invite-only groups of the men you trust: friends, brothers, your dad. Messages are end-to-end encrypted. You can also ask
              the group a question through Harry, anonymously, and he'll bring back what they said.
            </P>
            {mode === 'none' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Start a Circle" onPress={() => setMode('create')} style={{ flex: 1 }} />
                <Button title="Join with code" kind="secondary" onPress={() => setMode('join')} style={{ flex: 1 }} />
              </View>
            ) : (
              <Card>
                <Field
                  label={mode === 'create' ? 'Name your Circle' : 'Invite code'}
                  placeholder={mode === 'create' ? 'e.g. The Brothers, Dad & Me, Platoon' : 'XXXXX-XXXXX'}
                  value={value}
                  onChangeText={setValue}
                  autoCapitalize={mode === 'join' ? 'characters' : 'words'}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancel" kind="ghost" onPress={() => setMode('none')} style={{ flex: 1 }} />
                  <Button title={mode === 'create' ? 'Create' : 'Join'} onPress={submit} loading={busy} disabled={!value.trim()} style={{ flex: 1 }} />
                </View>
              </Card>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const last = (items[item.id] ?? []).at(-1);
          return (
            <Pressable onPress={() => router.push({ pathname: '/group/[id]', params: { id: item.id } })}>
              <Card>
                <Text style={st.name}>{item.name}</Text>
                <Text style={st.meta}>
                  {item.members.length} {item.members.length === 1 ? 'member' : 'members'}
                  {last ? ` · ${last.type === 'question' ? 'Question: ' : ''}${last.text.slice(0, 60)}` : ''}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  list: { padding: 20, gap: 12 },
  name: { fontFamily: F.display, fontSize: 20, color: C.text },
  meta: { fontFamily: F.body, fontSize: 14, color: C.textDim },
});
