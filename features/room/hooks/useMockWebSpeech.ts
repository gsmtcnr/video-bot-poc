/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useRef, useMemo, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { UseElevenLabsReturn } from '../types/room';
import { createChatMessage } from '../utils/messages';

/* ---------------------------------- */
/* Types                              */
/* ---------------------------------- */

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionType, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionType, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognitionType, ev: { error: string; message: string }) => void) | null;
  onresult: ((this: SpeechRecognitionType, ev: any) => void) | null;
};

type VoiceSelector =
  | { type: 'auto-tr' }
  | { type: 'by-name'; name: string }
  | { type: 'by-lang'; lang: string }
  | { type: 'index'; index: number };

interface Props {
  onMessage: (message: { id: string; sender: string; message: string; timestamp: number }) => void;
  onError: (error: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  connectionTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  elevenLabsStartedRef: React.MutableRefObject<boolean>;
  isReadyToSpeak?: React.MutableRefObject<boolean>;
}

/* ---------------------------------- */
/* Hook                               */
/* ---------------------------------- */

export function useMockWebSpeech({
  onMessage,
  onError,
  onConnect,
  onDisconnect,
  elevenLabsStartedRef,
}: Props): UseElevenLabsReturn & {
  setVoice: (v: VoiceSelector) => void;
  getAvailableVoices: () => SpeechSynthesisVoice[];
  skipToNextQuestion: () => void;
} {
  /* ---------------------------------- */
  /* Refs & State                       */
  /* ---------------------------------- */

  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const greetingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isRecordingRef = useRef(false);
  const isMutedRef = useRef(false);
  const isTTSSpeakingRef = useRef(false);
  const isUserSpeakingRef = useRef(false);

  const [isSpeaking, setIsSpeaking] = useState(false);

  const currentQuestionIndexRef = useRef(0);
  const answeredQuestionsCountRef = useRef(0);

  const voiceConfigRef = useRef<VoiceSelector>({
    type: 'by-lang',
    lang: 'tr-TR',
  });

  /* ---------------------------------- */
  /* Interview Data                     */
  /* ---------------------------------- */

  const frontendInterviewQuestions = [
    'Merhaba! Öncelikle kendinizi kısaca tanıtır mısınız? Frontend geliştirme alanında ne kadar deneyiminiz var?',
    'En son yaptığınız projeler nelerdir? Projelerinizde hangi teknolojileri kullandınız?',
    'Projenizin en büyük challengeı nedir? Bu challengeı nasıl çözdünüz?',
    'Projenizin en büyük başarısı nedir? Bu başarıyı nasıl elde ettiniz?',
    'Bu projeden çıkardığınız en önemli teknik ders neydi?',
  ];

  const closingMessage =
    'Harika! Tüm sorularınızı cevapladığınız için teşekkür ederim. Görüşme sona ermiştir. İyi günler!';

  /* ---------------------------------- */
  /* Helpers                            */
  /* ---------------------------------- */

  const getVoice = useCallback((selector: VoiceSelector): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in globalThis)) return null;

    const voices = globalThis.speechSynthesis.getVoices();
    if (!voices.length) return null;

    switch (selector.type) {
      case 'auto-tr': {
        const tr = voices.filter(v => v.lang.startsWith('tr'));
        return tr.length ? tr[Math.floor(Math.random() * tr.length)] : null;
      }

      case 'by-name':
        return voices.find(v => v.name === selector.name) ?? null;

      case 'by-lang': {
        const byLang = voices.filter(v => v.lang === selector.lang);
        return byLang[0] ?? null;
      }

      case 'index':
        return voices[selector.index] ?? null;

      default:
        return null;
    }
  }, []);

  const stopRecognitionSafely = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  };

  const startRecognitionSafely = () => {
    if (
      !recognitionRef.current ||
      isMutedRef.current ||
      !elevenLabsStartedRef.current ||
      isTTSSpeakingRef.current
    )
      return;

    try {
      recognitionRef.current.start();
    } catch {}
  };

  const speak = useCallback(
    (text: string, onFinish?: () => void) => {
      if (!('speechSynthesis' in globalThis)) return;

      try {
        isTTSSpeakingRef.current = true;
        stopRecognitionSafely();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';

        const voice = getVoice(voiceConfigRef.current);
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setIsSpeaking(true);

        utterance.onend = () => {
          isTTSSpeakingRef.current = false;
          setIsSpeaking(false);
          onFinish?.();
          setTimeout(startRecognitionSafely, 200);
        };

        utterance.onerror = () => {
          isTTSSpeakingRef.current = false;
          setIsSpeaking(false);
          setTimeout(startRecognitionSafely, 200);
        };

        globalThis.speechSynthesis.cancel();
        globalThis.speechSynthesis.speak(utterance);
      } catch {
        isTTSSpeakingRef.current = false;
        setIsSpeaking(false);
        startRecognitionSafely();
      }
    },
    [getVoice]
  );

  const getNextAIMessage = () => {
    if (answeredQuestionsCountRef.current >= 5) return closingMessage;

    if (currentQuestionIndexRef.current < frontendInterviewQuestions.length) {
      return frontendInterviewQuestions[currentQuestionIndexRef.current++];
    }

    return closingMessage;
  };

  const respondAsAI = (withDelay = true) => {
    const delay = withDelay ? 3000 + Math.random() * 1000 : 0;

    setTimeout(() => {
      const response = getNextAIMessage();
      onMessage(createChatMessage(response, 'AI Bot'));

      speak(response, () => {
        if (response === closingMessage) {
          setTimeout(() => (location.href = '/completed'), 2000);
        }
      });
    }, delay);
  };

  /* ---------------------------------- */
  /* Speech Recognition Init            */
  /* ---------------------------------- */

  const initSpeechRecognition = useCallback(() => {
    const Ctor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!Ctor) return null;

    const recognition = new Ctor() as SpeechRecognitionType;
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isRecordingRef.current = true;
    };

    recognition.onend = () => {
      isRecordingRef.current = false;
      startRecognitionSafely();
    };

    recognition.onerror = e => {
      if (e.error === 'not-allowed') {
        onError('Mikrofon izni verilmedi.');
      }
    };

    recognition.onresult = event => {
      if (isTTSSpeakingRef.current) return;

      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript + ' ';
        else isUserSpeakingRef.current = true;
      }

      if (!finalText.trim()) return;

      isUserSpeakingRef.current = false;
      onMessage(createChatMessage(finalText.trim(), 'Siz'));
      answeredQuestionsCountRef.current += 1;
      respondAsAI();
    };

    return recognition;
  }, [onError]);

  /* ---------------------------------- */
  /* Mock Conversation                 */
  /* ---------------------------------- */

  const mockConversation = useMemo(
    () =>
      ({
        startSession: async () => 'mock-id',
        endSession: async () => {
          globalThis.speechSynthesis?.cancel();
        },
        sendUserMessage: (text: string) => {
          onMessage(createChatMessage(text, 'Siz'));
          answeredQuestionsCountRef.current += 1;
          respondAsAI();
        },
        isSpeaking,
        isThinking: false,
        isMuted: isMutedRef.current,
        mute: () => {
          isMutedRef.current = true;
          stopRecognitionSafely();
        },
        unmute: () => {
          isMutedRef.current = false;
          startRecognitionSafely();
        },
        getInputVolume: () =>
          isUserSpeakingRef.current && !isTTSSpeakingRef.current
            ? Math.random() * 0.5 + 0.3
            : 0,
        getOutputVolume: () =>
          globalThis.speechSynthesis?.speaking ? Math.random() * 0.5 + 0.4 : 0,
      } as unknown as ReturnType<typeof useConversation>),
    [isSpeaking]
  );

  /* ---------------------------------- */
  /* Public API                         */
  /* ---------------------------------- */

  const startSession = useCallback(async () => {
    if (elevenLabsStartedRef.current) return;
    elevenLabsStartedRef.current = true;

    recognitionRef.current = initSpeechRecognition();
    recognitionRef.current?.start();

    await new Promise(r => setTimeout(r, 500));
    onConnect?.();

    greetingTimeoutRef.current = setTimeout(() => {
      const first = frontendInterviewQuestions[0];
      currentQuestionIndexRef.current = 1;
      onMessage(createChatMessage(first, 'AI Bot'));
      speak(first);
    }, 1000);
  }, []);

  const endSession = useCallback(async () => {
    elevenLabsStartedRef.current = false;
    stopRecognitionSafely();
    recognitionRef.current = null;
    onDisconnect?.();
  }, []);

  const skipToNextQuestion = useCallback(() => {
    // Mevcut konuşmayı durdur
    globalThis.speechSynthesis?.cancel();
    isTTSSpeakingRef.current = false;
    setIsSpeaking(false);

    // Bir sonraki soruya geç
    answeredQuestionsCountRef.current += 1;
    respondAsAI(false); // Gecikme olmadan bir sonraki soruya geç
  }, []);

  return {
    conversation: mockConversation,
    sendMessage: mockConversation.sendUserMessage,
    startSession,
    endSession,
    skipToNextQuestion,
    setVoice: v => {
      voiceConfigRef.current = v;
    },
    getAvailableVoices: () =>
      globalThis.speechSynthesis?.getVoices() ?? [],
  };
}
