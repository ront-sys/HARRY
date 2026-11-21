import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { cancelReply, getState, sendToHarry, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';
import { useDictation } from '@/lib/useDictation';
import { bestVoice, SentenceSpeaker } from '@/lib/voice';
import { Screen } from '@/ui/kit';
import { CrisisCard } from '@/ui/MessageBubble';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const LABEL: Record<Phase, string> = {
  idle: 'Tap to talk',
  listening: "I'm listening",
  thinking: 'Thinking…',
  speaking: 'Tap to interrupt',
};

function Orb({ phase }: { phase: Phase }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.35);
  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(glow);
    const dur = phase === 'speaking' ? 900 : phase === 'listening' ? 1400 : phase === 'thinking' ? 700 : 2600;
    const amp = phase === 'speaking' ? 1.1 : phase === 'listening' ? 1.07 : phase === 'thinking' ? 1.04 : 1.03;
    scale.value = withRepeat(withTiming(amp, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true);
    glow.value = withRepeat(withTiming(phase === 'idle' ? 0.45 : 0.8, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [phase, scale, glow]);
  const outer = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * 1.18 }], opacity: glow.value * 0.45 }));
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={st.orbWrap}>
      <Animated.View style={[st.orb, st.orbGlow, outer]} />
      <Animated.View style={[st.orb, inner, phase === 'listening' && { backgroundColor: C.accent }]} />
    </View>
  );
}

export default function Conversation() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const settings = useStore((s) => s.settings);
  const lastReply = useStore((s) => {
    const c = s.conversations.find((x) => x.id === s.currentId);
    const m = c?.messages[c.messages.length - 1];
    return m?.role === 'assistant' ? m : null;
  });
  const speaker = useRef<SentenceSpeaker | null>(null);
  const voice = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  // Handlers are read through a ref so the recognizer always sees the latest ones.
  const handlers = useRef<{ onFinal: (t: string) => void; onEnd: () => void }>({ onFinal: () => {}, onEnd: () => {} });
  const dict = useDictation({
    onFinal: (t) => handlers.current.onFinal(t),
    onEnd: () => handlers.current.onEnd(),
  });

  const listen = useCallback(async () => {
    if (!alive.current) return;
    setHeard('');
    const ok = await dict.start();
    setPhase(ok ? 'listening' : 'idle');
  }, [dict]);

  const respond = useCallback(
    async (text: string) => {
      setPhase('thinking');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const sp = new SentenceSpeaker(voice.current, getState().settings.voiceRate, () => {
        if (alive.current && phaseRef.current === 'speaking') void listen();
      });
      speaker.current = sp;
      await sendToHarry(text, 'voice', (e) => {
        if (e.type === 'delta') {
          if (phaseRef.current === 'thinking') setPhase('speaking');
          sp.push(e.text);
        } else if (e.type === 'error') {
          setPhase('speaking');
          sp.push(e.message === 'network' ? "Sorry, I lost the connection for a second. " : `${e.message} `);
        }
      });
      if (phaseRef.current === 'thinking') setPhase('speaking');
      sp.end();
    },
    [listen],
  );

  handlers.current = {
    onFinal: (t) => {
      if (phaseRef.current !== 'listening') return;
      setHeard(t);
      void respond(t);
    },
    onEnd: () => {
      // Recognizer timed out with nothing said: keep listening quietly.
      if (alive.current && phaseRef.current === 'listening') setTimeout(() => void listen(), 250);
    },
  };

  useEffect(() => {
    alive.current = true;
    bestVoice(settings.voiceId).then((v) => {
      voice.current = v;
      void listen();
    });
    return () => {
      alive.current = false;
      speaker.current?.stop();
      Speech.stop();
      dict.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapOrb = () => {
    Haptics.selectionAsync().catch(() => {});
    if (phase === 'speaking' || phase === 'thinking') {
      speaker.current?.stop();
      cancelReply();
      void listen();
    } else if (phase === 'listening') {
      dict.stop();
    } else {
      void listen();
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={st.top}>
        <Text style={st.title}>Harry</Text>
        <Pressable onPress={() => router.back()} accessibilityLabel="End conversation" style={st.close} hitSlop={10}>
          <SymbolView name="xmark" size={18} tintColor={C.text} />
        </Pressable>
      </View>

      <View style={st.middle}>
        {lastReply?.crisis ? <CrisisCard /> : null}
        <Pressable onPress={tapOrb} accessibilityLabel={LABEL[phase]} accessibilityRole="button">
          <Orb phase={phase} />
        </Pressable>
        <Text style={st.phase}>{LABEL[phase]}</Text>
      </View>

      <View style={st.transcript}>
        <Text style={st.heard} numberOfLines={3}>
          {phase === 'listening' ? dict.partial || ' ' : heard ? `“${heard}”` : ' '}
        </Text>
        {phase !== 'listening' && lastReply?.content ? (
          <Text style={st.reply} numberOfLines={6}>
            {lastReply.content}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const ORB = 190;
const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
  title: { fontFamily: F.display, fontSize: 24, color: C.text },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
  orbWrap: { width: ORB * 1.5, height: ORB * 1.5, alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, backgroundColor: C.accentDeep },
  orbGlow: { backgroundColor: C.accent },
  phase: { fontFamily: F.displayItalic, fontSize: 20, color: C.textDim },
  transcript: { minHeight: 180, paddingHorizontal: 28, paddingBottom: 24, gap: 12 },
  heard: { fontFamily: F.medium, fontSize: 17, lineHeight: 24, color: C.textDim, textAlign: 'center' },
  reply: { fontFamily: F.body, fontSize: 18, lineHeight: 27, color: C.text, textAlign: 'center' },
});
