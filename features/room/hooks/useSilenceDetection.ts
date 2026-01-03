"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseSilenceDetectionProps {
  audioStream: MediaStream | null;
  enabled: boolean;
  onSilenceDetected: () => void;
  silenceDuration?: number; // Saniye cinsinden sessizlik süresi (varsayılan: 10)
  threshold?: number; // Ses seviyesi eşiği (0-1 arası, varsayılan: 0.01)
}

interface UseSilenceDetectionReturn {
  isSilent: boolean;
  silenceDuration: number;
  currentVolume: number;
  resetSilence: () => void;
}

/**
 * Silence Detection Hook
 *
 * Audio stream'den ses seviyesini analiz ederek sessizlik tespiti yapar.
 * Belirtilen süre boyunca sessizlik olursa callback çağırır.
 */
export function useSilenceDetection({
  audioStream,
  enabled,
  onSilenceDetected,
  silenceDuration = 10,
  threshold = 0.01,
}: UseSilenceDetectionProps): UseSilenceDetectionReturn {
  const [isSilent, setIsSilent] = useState(false);
  const [currentSilenceDuration, setCurrentSilenceDuration] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetSilence = useCallback(() => {
    setIsSilent(false);
    setCurrentSilenceDuration(0);
    silenceStartTimeRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !audioStream) {
      // Cleanup
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    let active = true;

    const initAudioAnalysis = async () => {
      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(audioStream);

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        microphone.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
          if (!active || !analyserRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);

          // RMS (Root Mean Square) hesapla - daha doğru ses seviyesi
          const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
          const rms = Math.sqrt(sum / dataArray.length);
          const normalizedVolume = rms / 255; // 0-1 arası normalize et

          setCurrentVolume(normalizedVolume);

          animationFrameRef.current = requestAnimationFrame(updateVolume);
        };

        updateVolume();

        // Her saniye sessizlik kontrolü yap
        checkIntervalRef.current = setInterval(() => {
          if (!active) return;

          const volume = currentVolume;

          if (volume < threshold) {
            // Sessiz
            if (silenceStartTimeRef.current === null) {
              // Sessizlik başladı
              silenceStartTimeRef.current = Date.now();
              setIsSilent(true);
            } else {
              // Sessizlik devam ediyor
              const elapsedSeconds = (Date.now() - silenceStartTimeRef.current) / 1000;
              setCurrentSilenceDuration(Math.floor(elapsedSeconds));

              if (elapsedSeconds >= silenceDuration) {
                // Sessizlik süresi doldu
                console.log(`🔇 Silence detected for ${silenceDuration} seconds`);
                onSilenceDetected();
                resetSilence();
              }
            }
          } else {
            // Ses var - sessizlik sayacını sıfırla
            if (silenceStartTimeRef.current !== null) {
              resetSilence();
            }
          }
        }, 1000);

      } catch (err) {
        console.error("Silence detection error:", err);
      }
    };

    initAudioAnalysis();

    return () => {
      active = false;

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [enabled, audioStream, threshold, silenceDuration, onSilenceDetected, currentVolume, resetSilence]);

  return {
    isSilent,
    silenceDuration: currentSilenceDuration,
    currentVolume,
    resetSilence,
  };
}
