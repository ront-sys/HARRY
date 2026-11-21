import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, R } from '@/lib/theme';
import type { ChatMessage } from '@/lib/types';

const clean = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)[*_](\S.*?\S)[*_](?=\s|$)/g, '$1$2');

function hostLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known: Record<string, string> = {
      'mayoclinic.org': 'Mayo Clinic',
      'my.clevelandclinic.org': 'Cleveland Clinic',
      'clevelandclinic.org': 'Cleveland Clinic',
      'cdc.gov': 'CDC',
      'medlineplus.gov': 'MedlinePlus (NIH)',
      'nimh.nih.gov': 'NIMH',
      'nhs.uk': 'NHS',
      'who.int': 'WHO',
      'va.gov': 'VA',
      'ptsd.va.gov': 'VA PTSD Center',
      'apa.org': 'APA',
      'samhsa.gov': 'SAMHSA',
      'health.harvard.edu': 'Harvard Health',
      'hopkinsmedicine.org': 'Johns Hopkins',
    };
    return known[host] ?? (host.endsWith('nih.gov') ? 'NIH' : host);
  } catch {
    return url;
  }
}

export function CrisisCard() {
  return (
    <View style={st.crisis}>
      <Text style={st.crisisTitle}>You don't have to carry this alone</Text>
      <Text style={st.crisisBody}>Talk to a real person right now, free and confidential, 24/7. Veterans and service members: press 1.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable style={st.crisisBtn} onPress={() => Linking.openURL('tel:988')}>
          <Text style={st.crisisBtnText}>Call 988</Text>
        </Pressable>
        <Pressable style={st.crisisBtn} onPress={() => Linking.openURL('sms:988')}>
          <Text style={st.crisisBtnText}>Text 988</Text>
        </Pressable>
        <Pressable style={[st.crisisBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.text }]} onPress={() => Linking.openURL('tel:911')}>
          <Text style={[st.crisisBtnText, { color: C.text }]}>911</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MessageBubble({ m, typing }: { m: ChatMessage; typing?: boolean }) {
  const mine = m.role === 'user';
  const sources = m.sources ?? [];
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 8 }}>
      {m.crisis ? <CrisisCard /> : null}
      <View style={[st.bubble, mine ? st.mine : st.harry]}>
        <Text selectable style={[st.text, mine && { color: C.onAccent }]}>
          {m.content ? clean(m.content) : typing ? '…' : ''}
        </Text>
      </View>
      {!mine && sources.length ? (
        <View style={st.sources}>
          <Text style={st.sourcesLabel}>Verified with</Text>
          <View style={st.sourceRow}>
            {[...new Map(sources.map((x) => [hostLabel(x.url), x])).entries()].map(([label, x]) => (
              <Pressable key={x.url} onPress={() => WebBrowser.openBrowserAsync(x.url)} style={st.sourceChip} accessibilityRole="link">
                <Text style={st.sourceText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {!mine && m.verified === false ? (
        <Text style={st.unverified}>I couldn't confirm this with accredited medical sources. Please check with your doctor.</Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  bubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
  harry: { backgroundColor: C.harryBubble, borderBottomLeftRadius: 6 },
  mine: { backgroundColor: C.userBubble, borderBottomRightRadius: 6 },
  text: { fontFamily: F.body, fontSize: 17, lineHeight: 25, color: C.text },
  sources: { maxWidth: '86%', gap: 6, paddingLeft: 4 },
  sourcesLabel: { fontFamily: F.medium, fontSize: 12, color: C.sage, letterSpacing: 0.3 },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sourceChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1, borderColor: C.sage },
  sourceText: { fontFamily: F.medium, fontSize: 13, color: C.sage },
  unverified: { maxWidth: '86%', fontFamily: F.body, fontSize: 13, color: C.textFaint, paddingLeft: 4 },
  crisis: { alignSelf: 'stretch', backgroundColor: '#6B3B2E', borderRadius: R.lg, padding: 16, gap: 10 },
  crisisTitle: { fontFamily: F.display, fontSize: 19, color: C.text },
  crisisBody: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.text },
  crisisBtn: { backgroundColor: C.text, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10 },
  crisisBtnText: { fontFamily: F.semibold, fontSize: 15, color: '#3B2F28' },
});
