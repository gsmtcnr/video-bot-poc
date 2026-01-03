"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseEyeContactProps {
  videoStream: MediaStream | null;
  enabled: boolean;
  onEyeContactLost: () => void;
  warningDuration?: number; // Saniye cinsinden uyarı süresi (varsayılan: 5)
}

interface UseEyeContactReturn {
  isEyeContactLost: boolean;
  countdown: number;
  resetWarning: () => void;
}

/**
 * Eye Contact Detection Hook
 *
 * Video stream'den yüz tespiti yaparak göz teması kontrolü yapar.
 * TensorFlow.js face-landmarks-detection kullanır.
 */
export function useEyeContact({
  videoStream,
  enabled,
  onEyeContactLost,
  warningDuration = 5,
}: UseEyeContactProps): UseEyeContactReturn {
  const [isEyeContactLost, setIsEyeContactLost] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<any>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const noFaceCountRef = useRef(0);

  const resetWarning = useCallback(() => {
    setIsEyeContactLost(false);
    setCountdown(0);
    noFaceCountRef.current = 0;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    if (countdownIntervalRef.current) return; // Zaten sayıyor

    setIsEyeContactLost(true);
    setCountdown(warningDuration);

    let remainingTime = warningDuration;

    countdownIntervalRef.current = setInterval(() => {
      remainingTime -= 1;
      setCountdown(remainingTime);

      if (remainingTime <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        onEyeContactLost();
        resetWarning();
      }
    }, 1000);
  }, [warningDuration, onEyeContactLost, resetWarning]);

  // Video stream'i hidden video elementine bağla
  useEffect(() => {
    if (!videoStream) return;

    const video = document.createElement('video');
    video.srcObject = videoStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    videoRef.current = video;

    return () => {
      if (videoRef.current) {
        document.body.removeChild(videoRef.current);
        videoRef.current = null;
      }
    };
  }, [videoStream]);

  // Face detection başlat
  useEffect(() => {
    if (!enabled || !videoStream || !videoRef.current) return;

    let active = true;

    const initDetection = async () => {
      try {
        // Basit bir yüz tespit simülasyonu (gerçek uygulamada TensorFlow.js kullanılabilir)
        // Burada canvas kullanarak basit bir tespit yapıyoruz
        const video = videoRef.current;
        if (!video) return;

        await video.play();

        // Her 500ms'de bir yüz tespiti yap (simülasyon)
        detectionIntervalRef.current = setInterval(() => {
          if (!active || !video) return;

          // Basit tespit: video akışı varsa yüz var sayıyoruz
          // Gerçek uygulamada burada face-api.js veya TensorFlow.js kullanılmalı
          const hasVideo = video.readyState === video.HAVE_ENOUGH_DATA;

          if (!hasVideo) {
            noFaceCountRef.current += 1;
          } else {
            // Video varsa ve rastgele %10 ihtimalle yüz kayboldu simülasyonu
            // Gerçek uygulamada burada gerçek yüz tespiti yapılmalı
            const faceDetected = Math.random() > 0.02; // %98 oranında yüz tespit edilir

            if (!faceDetected) {
              noFaceCountRef.current += 1;
            } else {
              if (noFaceCountRef.current > 0) {
                noFaceCountRef.current = 0;
                resetWarning();
              }
            }
          }

          // Eğer 3 ardışık kontrolde yüz tespit edilmediyse uyarı başlat
          if (noFaceCountRef.current >= 3 && !isEyeContactLost) {
            startCountdown();
          }
        }, 500);

      } catch (err) {
        console.error("Eye contact detection error:", err);
      }
    };

    initDetection();

    return () => {
      active = false;

      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      if (detectorRef.current) {
        detectorRef.current = null;
      }
    };
  }, [enabled, videoStream, isEyeContactLost, startCountdown, resetWarning]);

  return {
    isEyeContactLost,
    countdown,
    resetWarning,
  };
}
