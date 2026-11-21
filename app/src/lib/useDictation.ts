import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

// Native iOS speech-to-text (SFSpeechRecognizer). Each hook instance only
// reacts to recognition sessions it started itself.
let owner = 0;
let nextId = 1;

export function useDictation(opts: { continuous?: boolean; onFinal?: (text: string) => void; onEnd?: () => void } = {}) {
  const me = useRef(nextId++).current;
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useSpeechRecognitionEvent('start', () => {
    if (owner === me) setListening(true);
  });
  useSpeechRecognitionEvent('end', () => {
    if (owner !== me) return;
    setListening(false);
    optsRef.current.onEnd?.();
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (owner !== me) return;
    const text = e.results[0]?.transcript ?? '';
    setPartial(text);
    if (e.isFinal && text.trim()) optsRef.current.onFinal?.(text.trim());
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (owner !== me) return;
    if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('speech error', e.error, e.message);
    setListening(false);
  });

  const start = useCallback(async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return false;
    owner = me;
    setPartial('');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: !!optsRef.current.continuous,
      addsPunctuation: true,
      iosTaskHint: 'dictation',
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
        mode: 'default',
      },
    });
    return true;
  }, [me]);

  const stop = useCallback(() => {
    if (owner === me) ExpoSpeechRecognitionModule.stop();
  }, [me]);
  const abort = useCallback(() => {
    if (owner === me) ExpoSpeechRecognitionModule.abort();
  }, [me]);

  return { listening, partial, setPartial, start, stop, abort };
}
