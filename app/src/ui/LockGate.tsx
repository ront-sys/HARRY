import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { getState, loadVault } from '@/lib/store';
import { C, F } from '@/lib/theme';
import { Backdrop, Button, P } from './kit';

/**
 * Nothing personal is decrypted or shown until Face ID / Touch ID (or the
 * device passcode as a fallback) succeeds. The app re-locks after it has been
 * in the background for a while, and covers its contents in the app switcher.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const loaded = useRef(false);

  const unlock = useCallback(async () => {
    setError(null);
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      setError('Set a passcode or Face ID on this iPhone to protect HARRY.');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock HARRY',
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });
    if (!res.success) {
      if (res.error !== 'user_cancel' && res.error !== 'system_cancel' && res.error !== 'app_cancel') setError("That didn't work. Try again.");
      return;
    }
    if (!loaded.current) {
      await loadVault();
      loaded.current = true;
    }
    setUnlocked(true);
  }, []);

  useEffect(() => {
    void unlock();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setCovered(false);
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since && Date.now() - since > getState().settings.lockAfterSeconds * 1000) {
          setUnlocked(false);
          void unlock();
        }
      } else {
        setCovered(true);
        if (next === 'background' && backgroundedAt.current === null) backgroundedAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  return (
    <View style={{ flex: 1 }}>
      {unlocked ? children : null}
      {!unlocked || covered ? (
        <View style={StyleSheet.absoluteFill}>
          <Backdrop>
            <View style={st.center}>
              <Text style={st.logo}>HARRY</Text>
              <P dim style={{ textAlign: 'center' }}>
                Your conversations are private and encrypted.
              </P>
              {!unlocked && !covered ? (
                <>
                  {error ? <P style={{ color: C.danger, textAlign: 'center' }}>{error}</P> : null}
                  <Button title="Unlock" onPress={unlock} style={{ alignSelf: 'stretch', marginTop: 12 }} />
                </>
              ) : null}
            </View>
          </Backdrop>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  logo: { fontFamily: F.display, fontSize: 44, letterSpacing: 6, color: C.accent },
});
