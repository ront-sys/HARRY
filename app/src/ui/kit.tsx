import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { C, F, R } from '@/lib/theme';

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[C.bgTop, C.bgBottom]} style={StyleSheet.absoluteFill}>
      {children}
    </LinearGradient>
  );
}

export function Screen({ children, edges = ['top'], style }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={{ flex: 1 }}>
      <Backdrop>
        <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>
          {children}
        </SafeAreaView>
      </Backdrop>
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function P({ children, style, dim }: { children: ReactNode; style?: StyleProp<TextStyle>; dim?: boolean }) {
  return <Text style={[s.p, dim && { color: C.textDim }, style]}>{children}</Text>;
}
export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = kind === 'primary' ? C.accent : kind === 'secondary' ? C.surfaceHigh : kind === 'danger' ? 'transparent' : 'transparent';
  const fg = kind === 'primary' ? C.onAccent : kind === 'danger' ? C.danger : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === 'danger' && { borderWidth: 1, borderColor: C.danger },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[s.chip, selected && { backgroundColor: C.accent, borderColor: C.accent }]}>
      <Text style={[s.chipText, selected && { color: C.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={s.chips}>{children}</View>;
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 8 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor={C.textFaint} selectionColor={C.accent} style={[s.field, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }, style]} {...rest} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  h1: { fontFamily: F.display, fontSize: 32, lineHeight: 38, color: C.text, letterSpacing: -0.3 },
  h2: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.text },
  p: { fontFamily: F.body, fontSize: 16, lineHeight: 24, color: C.text },
  label: { fontFamily: F.semibold, fontSize: 13, color: C.textDim, letterSpacing: 0.4, textTransform: 'uppercase' },
  btn: { minHeight: 52, borderRadius: R.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipText: { fontFamily: F.medium, fontSize: 15, color: C.text },
  field: {
    fontFamily: F.body,
    fontSize: 17,
    color: C.text,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 18, borderWidth: 1, borderColor: C.line, gap: 10 },
});
