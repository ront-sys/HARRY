import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useStore } from '@/lib/store';
import { C } from '@/lib/theme';

export default function Tabs() {
  const ready = useStore((s) => s.ready);
  const hasProfile = useStore((s) => !!s.profile);
  if (ready && !hasProfile) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs backgroundColor={C.bgBottom} tintColor={C.accent} labelStyle={{ color: C.textDim, selected: { color: C.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Talk</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="circle">
        <NativeTabs.Trigger.Label>Circle</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
