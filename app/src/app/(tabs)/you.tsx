import * as Speech from 'expo-speech';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { updateProfile, updateSettings, useStore, wipeEverything } from '@/lib/store';
import { C, F } from '@/lib/theme';
import { bestVoice, listVoices } from '@/lib/voice';
import { Button, Card, Chip, Chips, Field, H1, H2, P, Screen } from '@/ui/kit';

function EditableList({ items, onChange, placeholder, empty }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; empty: string }) {
  const [adding, setAdding] = useState('');
  return (
    <View style={{ gap: 8 }}>
      {items.length === 0 ? <P dim>{empty}</P> : null}
      {items.map((n, i) => (
        <View key={`${i}-${n}`} style={st.noteRow}>
          <Text style={st.note}>{n}</Text>
          <Pressable hitSlop={10} onPress={() => onChange(items.filter((_, j) => j !== i))} accessibilityLabel="Remove">
            <Text style={st.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Field
        placeholder={placeholder}
        value={adding}
        onChangeText={setAdding}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (adding.trim()) onChange([...items, adding.trim()]);
          setAdding('');
        }}
      />
    </View>
  );
}

export default function You() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [currentVoice, setCurrentVoice] = useState<string | undefined>();

  useEffect(() => {
    listVoices().then((v) => setVoices(v.slice(0, 8).map((x) => ({ id: x.identifier, name: x.name }))));
    bestVoice(settings.voiceId).then(setCurrentVoice);
  }, [settings.voiceId]);

  if (!profile) return <Screen>{null}</Screen>;

  const preview = (id: string) => {
    Speech.stop();
    Speech.speak(`Hey ${profile.displayName}. I'm here whenever you want to talk.`, { voice: id, rate: settings.voiceRate, pitch: 0.96 });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={st.body}>
        <H1>{profile.displayName}</H1>
        <P dim>Everything here is stored encrypted on this iPhone, behind Face ID.</P>

        <Card>
          <H2>About you</H2>
          <Field label="Harry calls you" value={profile.displayName} onChangeText={(displayName) => displayName.trim() && updateProfile({ displayName })} />
          <Field
            label="What's going on right now"
            multiline
            value={profile.whatBringsYou ?? ''}
            onChangeText={(whatBringsYou) => updateProfile({ whatBringsYou })}
            placeholder="Anything Harry should keep in mind"
          />
          <Field
            label={profile.work?.profession !== undefined ? 'Profession' : 'Job'}
            value={profile.work?.profession ?? profile.work?.job ?? ''}
            onChangeText={(v) => updateProfile({ work: profile.work?.profession !== undefined ? { ...profile.work, profession: v } : { ...profile.work, job: v } })}
          />
          <Text style={st.label}>How Harry talks to you</Text>
          <Chips>
            {['Straight talk', 'Gentle and patient', 'A bit of both'].map((x) => (
              <Chip key={x} label={x} selected={profile.coachingStyle === x} onPress={() => updateProfile({ coachingStyle: x })} />
            ))}
          </Chips>
        </Card>

        <Card>
          <H2>What Harry knows</H2>
          <P dim>Harry notes useful things as you talk so he doesn't have to ask twice. Remove anything you'd rather he forget.</P>
          <EditableList
            items={profile.notes ?? []}
            onChange={(notes) => updateProfile({ notes })}
            placeholder="Add something Harry should know"
            empty="Nothing yet. This fills in as you talk."
          />
        </Card>

        <Card>
          <H2>What your Harry can share</H2>
          <P dim>
            When someone in your Circle asks a question, your Harry drafts a reply from only what you put here. You always review it
            before it's sent. Your private chats are never used.
          </P>
          <EditableList
            items={profile.circleExperience ?? []}
            onChange={(circleExperience) => updateProfile({ circleExperience })}
            placeholder="e.g. Went through a divorce in 2019; counseling helped"
            empty="Nothing shared yet."
          />
        </Card>

        <Card>
          <H2>Harry's voice</H2>
          <P dim>Tap to hear a voice. For the most natural sound, download an "Enhanced" or "Premium" voice in iOS Settings → Accessibility → Spoken Content → Voices.</P>
          {voices.map((v) => (
            <Pressable
              key={v.id}
              style={[st.voice, currentVoice === v.id && { borderColor: C.accent }]}
              onPress={() => {
                updateSettings({ voiceId: v.id });
                preview(v.id);
              }}>
              <Text style={st.voiceName}>{v.name}</Text>
              {currentVoice === v.id ? <Text style={st.selected}>Selected</Text> : null}
            </Pressable>
          ))}
          <Text style={st.label}>Pace</Text>
          <Chips>
            {[
              ['Slower', 0.85],
              ['Calm', 0.92],
              ['Natural', 1.0],
            ].map(([label, r]) => (
              <Chip key={label as string} label={label as string} selected={settings.voiceRate === r} onPress={() => updateSettings({ voiceRate: r as number })} />
            ))}
          </Chips>
        </Card>

        <Card>
          <H2>Privacy & security</H2>
          <Text style={st.label}>Lock again after</Text>
          <Chips>
            {[
              ['Immediately', 0],
              ['30 seconds', 30],
              ['5 minutes', 300],
            ].map(([label, secs]) => (
              <Chip key={label as string} label={label as string} selected={settings.lockAfterSeconds === secs} onPress={() => updateSettings({ lockAfterSeconds: secs as number })} />
            ))}
          </Chips>
          <P dim>
            Your profile and conversations are encrypted on this phone with a key in the iOS Keychain. To answer you, your messages are
            sent over an encrypted connection to Harry's AI and aren't stored on our servers. Circle messages are end-to-end encrypted:
            only the people in the Circle can read them.
          </P>
          <Button title="Past conversations" kind="secondary" onPress={() => router.push('/history')} />
        </Card>

        <Card>
          <H2>If things get heavy</H2>
          <P dim>Free, confidential, 24/7. Veterans and service members: press 1.</P>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Call 988" onPress={() => Linking.openURL('tel:988')} style={{ flex: 1 }} />
            <Button title="Text 988" kind="secondary" onPress={() => Linking.openURL('sms:988')} style={{ flex: 1 }} />
          </View>
        </Card>

        <Button
          title="Delete everything"
          kind="danger"
          onPress={() =>
            Alert.alert('Delete everything?', 'This permanently erases your profile, conversations, Circle memberships, and keys from this phone and our servers.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await wipeEverything();
                  router.replace('/onboarding');
                },
              },
            ])
          }
        />
        <P dim style={{ textAlign: 'center', fontSize: 13 }}>
          Harry is an AI, not a doctor, therapist, or emergency service.
        </P>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 48 },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.textDim, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 },
  noteRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  note: { flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.text },
  remove: { fontFamily: F.medium, fontSize: 14, color: C.textFaint },
  voice: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  voiceName: { fontFamily: F.medium, fontSize: 16, color: C.text },
  selected: { fontFamily: F.medium, fontSize: 14, color: C.accent },
});
