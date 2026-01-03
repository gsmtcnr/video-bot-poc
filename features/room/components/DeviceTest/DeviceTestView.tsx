"use client";

import { useState, useRef, useEffect } from "react";

interface DeviceTestViewProps {
  onTestsComplete: () => void;
}

export function DeviceTestView({ onTestsComplete }: DeviceTestViewProps) {
  const [microphoneTested, setMicrophoneTested] = useState(false);
  const [cameraTested, setCameraTested] = useState(false);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [testing, setTesting] = useState<'microphone' | 'camera' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Mikrofon seviyesini ölç
  useEffect(() => {
    if (!microphoneStream) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(microphoneStream);

    analyser.fftSize = 256;
    microphone.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setMicrophoneLevel(average / 255); // 0-1 arası normalize et

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [microphoneStream]);

  // Video stream'i video elementine bağla
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const testMicrophone = async () => {
    setTesting('microphone');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophoneStream(stream);

      // 3 saniye sonra otomatik olarak testi başarılı say
      setTimeout(() => {
        setMicrophoneTested(true);
        setTesting(null);
      }, 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Mikrofon erişimi reddedildi';
      setError(errorMsg);
      setTesting(null);
    }
  };

  const testCamera = async () => {
    setTesting('camera');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        }
      });
      setCameraStream(stream);

      // 2 saniye sonra otomatik olarak testi başarılı say
      setTimeout(() => {
        setCameraTested(true);
        setTesting(null);
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Kamera erişimi reddedildi';
      setError(errorMsg);
      setTesting(null);
    }
  };

  const handleStartInterview = () => {
    // Stream'leri temizle
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }

    onTestsComplete();
  };

  const allTestsCompleted = microphoneTested && cameraTested;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-gray-800 p-8 shadow-xl">
        <h1 className="mb-2 text-3xl font-bold text-white">Cihaz Testleri</h1>
        <p className="mb-8 text-gray-400">
          Görüşmeye başlamadan önce mikrofon ve kameranızı test etmeniz gerekmektedir.
        </p>

        {error && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Mikrofon Testi */}
          <div className="rounded-lg bg-gray-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  microphoneTested ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  {microphoneTested ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Mikrofon Testi</h3>
                  <p className="text-sm text-gray-400">
                    {microphoneTested
                      ? 'Mikrofon testi başarılı'
                      : 'Mikrofonunuzu test edin'}
                  </p>
                </div>
              </div>

              {!microphoneTested && (
                <button
                  onClick={testMicrophone}
                  disabled={testing === 'microphone'}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition-colors"
                >
                  {testing === 'microphone' ? 'Test Ediliyor...' : 'Test Et'}
                </button>
              )}
            </div>

            {/* Mikrofon Seviye Göstergesi */}
            {microphoneStream && !microphoneTested && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Konuşmayı deneyin:</p>
                <div className="h-4 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${microphoneLevel * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Kamera Testi */}
          <div className="rounded-lg bg-gray-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  cameraTested ? 'bg-green-500' : 'bg-gray-600'
                }`}>
                  {cameraTested ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Kamera Testi</h3>
                  <p className="text-sm text-gray-400">
                    {cameraTested
                      ? 'Kamera testi başarılı'
                      : 'Kameranızı test edin'}
                  </p>
                </div>
              </div>

              {!cameraTested && (
                <button
                  onClick={testCamera}
                  disabled={testing === 'camera'}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition-colors"
                >
                  {testing === 'camera' ? 'Test Ediliyor...' : 'Test Et'}
                </button>
              )}
            </div>

            {/* Kamera Önizlemesi */}
            {cameraStream && (
              <div className="mt-4 rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>
        </div>

        {/* Başlat Butonu */}
        {allTestsCompleted && (
          <div className="mt-8 pt-6 border-t border-gray-600">
            <button
              onClick={handleStartInterview}
              className="w-full px-8 py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold rounded-lg transition-colors"
            >
              Görüşmeye Başla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
