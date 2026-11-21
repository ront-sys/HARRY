import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { completeOnboarding } from '@/lib/store';
import { C, F } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { Button, Chip, Chips, Field, H1, P, Screen } from '@/ui/kit';

const BRANCHES = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force', 'National Guard'];
const SERVICE_STATUS = ['Active duty', 'Reserve / Guard', 'Veteran', 'Retired'];
const RELATIONSHIP = ['Single', 'Dating', 'Engaged', 'Married', 'Separated', 'Divorced', 'Widowed', "It's complicated"];
const KIDS = ['0', '1', '2', '3', '4', '5+'];
const NO_JOB_STATUS = ['Between jobs', 'Student', 'Retired', 'Stay-at-home dad', 'Unable to work'];
const LIFE = [
  'New dad',
  'Raising kids',
  'Marriage strain',
  'Going through a breakup or divorce',
  'Dating again',
  'Career pressure',
  'Lost my job',
  'Starting a business',
  'Money stress',
  'Health scare',
  'Grief or loss',
  'Leaving the military',
  'Feeling stuck',
  'Lonely lately',
  'Confidence',
  'Getting in shape',
  'Caring for my parents',
  'Drinking more than I want',
];
const STYLE = ['Straight talk', 'Gentle and patient', 'A bit of both'];

type Draft = {
  nameMode: 'name' | 'alias';
  realName: string;
  alias: string;
  age: string;
  height: string;
  weight: string;
  served: boolean | null;
  branch?: string;
  status?: string;
  years: string;
  relationship?: string;
  kids?: string;
  kidsAges: string;
  noProfession: boolean;
  profession: string;
  job: string;
  workStatus?: string;
  life: string[];
  why: string;
  style?: string;
  region: string;
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Draft>({
    nameMode: 'name',
    realName: '',
    alias: '',
    age: '',
    height: '',
    weight: '',
    served: null,
    years: '',
    kidsAges: '',
    noProfession: false,
    profession: '',
    job: '',
    life: [],
    why: '',
    region: '',
  });
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const callMe = (d.nameMode === 'alias' ? d.alias : d.realName).trim();

  const steps: { title: string; sub?: string; body: React.ReactNode; canNext: boolean }[] = [
    {
      title: "Hey. I'm Harry.",
      sub: "I'm an AI you can talk to about anything on your mind: work, marriage, kids, confidence, money, the stuff that's hard to say out loud. I'll ask a few questions so I can actually be useful to you. Answer what you want; skip what you don't.",
      body: (
        <View style={st.promise}>
          <P dim>• Locked with Face ID</P>
          <P dim>• Your chats are encrypted on this phone</P>
          <P dim>• Use an alias if you'd rather not use your name</P>
          <P dim>• Not a replacement for a doctor or therapist, but a good place to start</P>
        </View>
      ),
      canNext: true,
    },
    {
      title: 'What should I call you?',
      sub: 'Your real name, or an alias. Either is fine.',
      body: (
        <View style={st.gap}>
          <Chips>
            <Chip label="My name" selected={d.nameMode === 'name'} onPress={() => up({ nameMode: 'name' })} />
            <Chip label="An alias" selected={d.nameMode === 'alias'} onPress={() => up({ nameMode: 'alias' })} />
          </Chips>
          {d.nameMode === 'name' ? (
            <Field placeholder="First name" value={d.realName} onChangeText={(realName) => up({ realName })} autoFocus autoCapitalize="words" textContentType="givenName" />
          ) : (
            <Field placeholder="Alias, like 'Coach' or 'Big Mike'" value={d.alias} onChangeText={(alias) => up({ alias })} autoFocus autoCapitalize="words" />
          )}
        </View>
      ),
      canNext: callMe.length > 0,
    },
    {
      title: 'The basics',
      sub: 'This helps me give advice that fits your body and your stage of life.',
      body: (
        <View style={st.gap}>
          <Field label="Age" placeholder="e.g. 38" keyboardType="number-pad" value={d.age} onChangeText={(age) => up({ age: age.replace(/\D/g, '').slice(0, 3) })} />
          <Field label="Height" placeholder={`e.g. 5'11"`} value={d.height} onChangeText={(height) => up({ height })} />
          <Field label="Weight" placeholder="e.g. 195 lb" value={d.weight} onChangeText={(weight) => up({ weight })} />
        </View>
      ),
      canNext: !d.age || (Number(d.age) >= 13 && Number(d.age) <= 120),
    },
    {
      title: 'Have you served in the military?',
      body: (
        <View style={st.gap}>
          <Chips>
            <Chip label="Yes" selected={d.served === true} onPress={() => up({ served: true })} />
            <Chip label="No" selected={d.served === false} onPress={() => up({ served: false })} />
          </Chips>
          {d.served ? (
            <>
              <Text style={st.q}>Branch</Text>
              <Chips>
                {BRANCHES.map((b) => (
                  <Chip key={b} label={b} selected={d.branch === b} onPress={() => up({ branch: b })} />
                ))}
              </Chips>
              <Text style={st.q}>Status</Text>
              <Chips>
                {SERVICE_STATUS.map((b) => (
                  <Chip key={b} label={b} selected={d.status === b} onPress={() => up({ status: b })} />
                ))}
              </Chips>
              <Field label="Years of service" keyboardType="number-pad" placeholder="e.g. 8" value={d.years} onChangeText={(years) => up({ years: years.replace(/\D/g, '').slice(0, 2) })} />
            </>
          ) : null}
        </View>
      ),
      canNext: d.served !== null,
    },
    {
      title: "Who's in your life at home?",
      body: (
        <View style={st.gap}>
          <Text style={st.q}>Relationship</Text>
          <Chips>
            {RELATIONSHIP.map((r) => (
              <Chip key={r} label={r} selected={d.relationship === r} onPress={() => up({ relationship: r })} />
            ))}
          </Chips>
          <Text style={st.q}>Kids</Text>
          <Chips>
            {KIDS.map((k) => (
              <Chip key={k} label={k} selected={d.kids === k} onPress={() => up({ kids: k })} />
            ))}
          </Chips>
          {d.kids && d.kids !== '0' ? <Field label="Their ages" placeholder="e.g. 3, 7, 12" value={d.kidsAges} onChangeText={(kidsAges) => up({ kidsAges })} /> : null}
        </View>
      ),
      canNext: true,
    },
    {
      title: d.noProfession ? 'What job do you have right now?' : "What's your profession?",
      sub: d.noProfession ? "Whatever pays the bills, or what you're doing these days." : 'The line of work you identify with.',
      body: (
        <View style={st.gap}>
          {d.noProfession ? (
            <>
              <Field placeholder="e.g. warehouse lead, driving for a delivery app" value={d.job} onChangeText={(job) => up({ job })} autoFocus />
              <Text style={st.q}>Or, right now I'm…</Text>
              <Chips>
                {NO_JOB_STATUS.map((w) => (
                  <Chip key={w} label={w} selected={d.workStatus === w} onPress={() => up({ workStatus: d.workStatus === w ? undefined : w })} />
                ))}
              </Chips>
            </>
          ) : (
            <Field placeholder="e.g. electrician, nurse, sales manager" value={d.profession} onChangeText={(profession) => up({ profession })} autoFocus />
          )}
          <Pressable onPress={() => up({ noProfession: !d.noProfession })} hitSlop={10}>
            <Text style={st.link}>{d.noProfession ? 'Actually, I have a profession' : "I don't really have a profession"}</Text>
          </Pressable>
        </View>
      ),
      canNext: true,
    },
    {
      title: "Where are you in life right now?",
      sub: 'Pick anything that fits. This is where I start.',
      body: (
        <View style={st.gap}>
          <Chips>
            {LIFE.map((l) => (
              <Chip
                key={l}
                label={l}
                selected={d.life.includes(l)}
                onPress={() => up({ life: d.life.includes(l) ? d.life.filter((x) => x !== l) : [...d.life, l] })}
              />
            ))}
          </Chips>
          <Field
            label="Anything specific bringing you here?"
            placeholder="Say as much or as little as you want."
            multiline
            value={d.why}
            onChangeText={(why) => up({ why })}
          />
        </View>
      ),
      canNext: true,
    },
    {
      title: 'How should I talk to you?',
      body: (
        <View style={st.gap}>
          <Chips>
            {STYLE.map((x) => (
              <Chip key={x} label={x} selected={d.style === x} onPress={() => up({ style: x })} />
            ))}
          </Chips>
          <Field
            label="Where do you live? (optional)"
            placeholder="State or country, so I can point you to local resources"
            value={d.region}
            onChangeText={(region) => up({ region })}
          />
        </View>
      ),
      canNext: true,
    },
  ];

  const finish = async () => {
    const profile: Profile = {
      displayName: callMe,
      usesAlias: d.nameMode === 'alias',
      realName: d.nameMode === 'name' ? d.realName.trim() : undefined,
      age: d.age ? Number(d.age) : undefined,
      height: d.height.trim() || undefined,
      weight: d.weight.trim() || undefined,
      military: d.served === null ? undefined : { served: d.served, branch: d.branch, status: d.status, years: d.years ? Number(d.years) : undefined },
      family: {
        relationship: d.relationship,
        kids: d.kids === undefined ? undefined : d.kids === '5+' ? 5 : Number(d.kids),
        kidsAges: d.kidsAges.trim() || undefined,
      },
      work: d.noProfession
        ? { job: d.job.trim() || undefined, status: d.workStatus }
        : { profession: d.profession.trim() || undefined },
      lifeFocus: d.life,
      whatBringsYou: d.why.trim() || undefined,
      coachingStyle: d.style,
      region: d.region.trim() || undefined,
      notes: [],
      circleExperience: [],
    };
    setBusy(true);
    try {
      await completeOnboarding(profile);
      router.replace('/');
    } catch {
      Alert.alert("Couldn't reach Harry", 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const cur = steps[step];
  const last = step === steps.length - 1;
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.progress}>
          {steps.map((_, i) => (
            <View key={i} style={[st.dot, i <= step && { backgroundColor: C.accent }]} />
          ))}
        </View>
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <H1>{cur.title}</H1>
          {cur.sub ? <P dim>{cur.sub}</P> : null}
          {cur.body}
        </ScrollView>
        <View style={st.footer}>
          {step > 0 ? <Button title="Back" kind="ghost" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
          <Button
            title={step === 0 ? "Let's start" : last ? 'Meet Harry' : 'Next'}
            onPress={() => (last ? finish() : setStep(step + 1))}
            disabled={!cur.canNext}
            loading={busy}
            style={{ flex: 2 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.surfaceHigh },
  body: { padding: 24, gap: 16, paddingBottom: 40 },
  gap: { gap: 14, marginTop: 8 },
  q: { fontFamily: F.semibold, color: C.textDim, fontSize: 14, marginTop: 6 },
  link: { fontFamily: F.medium, color: C.accent, fontSize: 15 },
  promise: { gap: 6, marginTop: 8 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingBottom: 12 },
});
