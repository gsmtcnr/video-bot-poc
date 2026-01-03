/**
 * Room View - Client Component (Refactored - LiveKit olmadan)
 *
 * Native kamera yönetimi + ElevenLabs + Orb ile basit video görüşme
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { useCamera } from "../hooks/useCamera";
import { useRoomState } from "../hooks/useRoomState";
import { useMockWebSpeech } from "../hooks/useMockWebSpeech";
import { useEyeContact } from "../hooks/useEyeContact";
import { useSilenceDetection } from "../hooks/useSilenceDetection";
import { RoomHeader } from "../components/Header";
import { ChatSidebar } from "../components/Chat";
import { VideoGrid } from "../components/VideoGrid";
import { LoadingView } from "../components/LoadingView";
import { ErrorView } from "../components/ErrorView";
import { DeviceTestView } from "../components/DeviceTest";
import { WarningOverlay } from "../components/Warnings";
import { createChatMessage, parseElevenLabsMessage } from "../utils/messages";
import { defaultInterviewConfig } from "@/lib/interview/config";
import { createRecorder } from "../utils/createRecorder";

interface RoomViewProps {
  readonly roomId: string;
}

/**
 * Room View Component
 *
 * Native kamera + ElevenLabs conversation + Orb visualization
 * Mock mode desteği ile
 */
export function RoomView({ roomId }: RoomViewProps) {
  const { state, setState, updateChatMessages, updateChatInput, toggleChat } =
    useRoomState();

  // Device test state
  const [deviceTestsCompleted, setDeviceTestsCompleted] = useState(false);

  // Token management - room ID'den token alınacak
  const conversationTokenRef = useRef<string | undefined>(undefined);

  // Camera
  const camera = useCamera();

  // Ref'ler ile güncel değerleri sakla (closure sorununu önlemek için)
  const videoStreamRef = useRef<MediaStream | null>(camera.videoStream);
  const isElevenLabsConnectedRef = useRef<boolean>(state.isElevenLabsConnected);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);

  // Ref'leri güncelle
  useEffect(() => {
    videoStreamRef.current = camera.videoStream;
  }, [camera.videoStream]);

  useEffect(() => {
    isElevenLabsConnectedRef.current = state.isElevenLabsConnected;
  }, [state.isElevenLabsConnected]);

  useEffect(() => {
    const interval = setInterval(() => {
      const audioEl = document.querySelector("audio");
      if (audioEl) {
        aiAudioRef.current = audioEl as HTMLAudioElement;
        console.log("🔊 AI audio element captured");
        clearInterval(interval);
      }
    }, 300);
  
    return () => clearInterval(interval);
  }, []);

  // Agent state for Orb
  const [agentState, setAgentState] = useState<
    "listening" | "talking" | "thinking" | "idle"
  >("idle");

  // Refs for mock implementation
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const elevenLabsStartedRef = useRef(false);
  const isReadyToSpeakRef = useRef(true);

  // Skip question ref (will be set by mock hook)
  const skipToNextQuestionRef = useRef<(() => void) | null>(null);

  // Otomatik sonlandırma için ref'ler (gerçek mode için)
  const isEndingSessionRef = useRef(false);
  const endSessionRef = useRef<(() => Promise<void>) | null>(null);
  const closingMessageDetectedRef = useRef(false);
  const recorderRef = useRef<ReturnType<typeof createRecorder> | null>(null);

  // Mock mode kontrolü
  const useMockMode = process.env.NEXT_PUBLIC_USE_MOCK_ELEVENLABS === "true";

  // Mock Web Speech Apihook (eğer mock mode aktifse)
  const mockWebSpeechApi = useMockWebSpeech({
    onMessage: (message) => {
      updateChatMessages(message);
    },
    onError: (error) => {
      console.error("❌ Mock Web Speech Apierror:", error);
      setState({ errorMessage: error });
    },
    onConnect: () => {
      console.log("✅ Mock Web Speech Apiconnected");
      recorderRef.current?.start();
      setState({
        isElevenLabsConnected: true,
        isLoading: false,
        loadingStep: "ready",
      });
    },
    onDisconnect: () => {
      console.log("❌ Mock Web Speech Apidisconnected");
      setState({ isElevenLabsConnected: false });
      setAgentState("idle");
    },
    connectionTimeoutRef,
    elevenLabsStartedRef,
    isReadyToSpeak: isReadyToSpeakRef,
  });

  // Real ElevenLabs conversation (eğer mock mode değilse)
  const realConversation = useConversation({
    onConnect: () => {
      console.log("✅ ElevenLabs connected");
      recorderRef.current?.start();
      setState({
        isElevenLabsConnected: true,
        isLoading: false,
        loadingStep: "ready",
      });
    },
    onDisconnect: async () => {
      console.log("❌ ElevenLabs disconnected");
      setState({ isElevenLabsConnected: false });
      setAgentState("idle");

      // Flag'leri reset et
      isEndingSessionRef.current = false;
      closingMessageDetectedRef.current = false;
      // Otomatik sonlandırma sonrası /completed'e yönlendir (sadece gerçek mode için)
      // Mock mode kendi içinde yönlendirme yapıyor
      if (!useMockMode) {
        setTimeout(() => {
          if (typeof globalThis !== "undefined" && globalThis.location) {
            globalThis.location.href = "/completed";
          }
        }, 1000);
      }
    },
    onMessage: (message) => {
      console.log("📨 Message received:", message);
      const parsed = parseElevenLabsMessage(message);
      if (parsed.text) {
        const chatMessage = createChatMessage(parsed.text, parsed.sender);
        updateChatMessages(chatMessage);

        // Otomatik sonlandırma kontrolü: Eğer AI Bot closingMessage içeriyorsa
        if (parsed.sender === "AI Bot" && !isEndingSessionRef.current) {
          const closingMessage =
            defaultInterviewConfig.closingMessage.toLowerCase();
          const messageText = parsed.text.toLowerCase();

          // Mesaj closingMessage içeriyorsa veya kapanış ifadeleri içeriyorsa
          const isClosingMessage =
            messageText.includes(closingMessage) ||
            messageText.includes("görüşme sona erdi") ||
            messageText.includes("görüşme tamamlandı") ||
            messageText.includes("tüm sorular") ||
            (messageText.includes("teşekkür ederim") &&
              (messageText.includes("görüşme") ||
                messageText.includes("sona")));

          if (isClosingMessage) {
            console.log("✅ Closing message detected:", parsed.text);
            console.log("✅ Waiting for AI to finish speaking...");

            // Kapanış mesajı tespit edildiğini işaretle
            closingMessageDetectedRef.current = true;
            // Agent state'i idle'a set et (listening'de kalmasın)
            // Ama AI hala konuşuyor olabilir, onModeChange'de kontrol edeceğiz
          }
        }
      }
    },
    onError: (error: unknown) => {
      console.error("❌ ElevenLabs error:", error);
      const errorMsg =
        error instanceof Error ? error.message : "AI bağlantı hatası";
      setState({ errorMessage: errorMsg });
    },
    onStatusChange: (status) => {
      console.log("📊 Status changed:", status.status);
    },
    onModeChange: (mode) => {
      console.log("🎭 Mode changed:", mode.mode);
      // Eğer session sonlandırılıyorsa, mode değişikliklerini görmezden gel
      if (isEndingSessionRef.current) {
        console.log("⏸️ Mode change ignored (session ending)");
        return;
      }

      // Kapanış mesajı tespit edildiyse ve AI konuşmayı bitirdiyse, session'ı sonlandır
      if (closingMessageDetectedRef.current && !isEndingSessionRef.current) {
        // AI konuşmayı bitirdi (listening mode)
        if (mode.mode === "listening") {
          console.log("✅ AI finished speaking, ending session now...");
          // Flag'leri set et
          closingMessageDetectedRef.current = false;
          isEndingSessionRef.current = true;

          // Agent state'i idle'a set et
          setAgentState("idle");

          // Kısa bir gecikme sonra session'ı sonlandır (mesajın tamamen bitmesi için)
          setTimeout(() => {
            if (endSessionRef.current) {
              console.log("🔄 Calling endSession via ref...");
              endSessionRef
                .current()
                .then(() => {
                  console.log("✅ Session ended successfully via auto-close");
                  // Flag'i reset et
                  isEndingSessionRef.current = false;

                  // onDisconnect callback'i çağrılacak (yönlendirme orada yapılacak)
                })
                .catch((err: unknown) => {
                  console.error(
                    "❌ Error ending session after closing message:",
                    err
                  );
                  // Flag'i reset et
                  isEndingSessionRef.current = false;
                  // Hata durumunda da yönlendir
                  setTimeout(() => {
                    if (
                      typeof globalThis !== "undefined" &&
                      globalThis.location
                    ) {
                      globalThis.location.href = "/completed";
                    }
                  }, 1000);
                });
            } else {
              console.warn(
                "⚠️ endSession ref is null, calling endSession directly and redirecting"
              );
              isEndingSessionRef.current = false;
              realConversation.endSession().catch(() => {
                // Ignore errors
              });
              setTimeout(() => {
                if (typeof globalThis !== "undefined" && globalThis.location) {
                  globalThis.location.href = "/completed";
                }
              }, 1000);
            }
          }, 1000); // 1 saniye ek gecikme (mesajın tamamen bitmesi için)

          return; // Mode state'i güncelleme (zaten idle'a set ettik)
        }
      }

      // Mode'a göre agent state'i güncelle
      if (mode.mode === "speaking") {
        setAgentState("talking");
      } else if (mode.mode === "listening") {
        setAgentState("listening");
      } else if (mode.mode === "thinking") {
        setAgentState("thinking");
      } else {
        setAgentState("idle");
      }
    },
  });

  // Conversation object - mock veya real
  const conversation = useMockMode
    ? mockWebSpeechApi.conversation
    : realConversation;

  // skipToNextQuestion ref'ini set et (mock mode için)
  useEffect(() => {
    if (useMockMode) {
      skipToNextQuestionRef.current = mockWebSpeechApi.skipToNextQuestion;
    } else {
      skipToNextQuestionRef.current = null;
    }
  }, [useMockMode, mockWebSpeechApi]);

  // Eye contact detection (sadece cihaz testleri tamamlandıktan sonra)
  const eyeContact = useEyeContact({
    videoStream: camera.videoStream,
    enabled: deviceTestsCompleted && state.isElevenLabsConnected,
    onEyeContactLost: () => {
      console.log("👁️ Eye contact lost for 5 seconds, skipping to next question");
      if (useMockMode && skipToNextQuestionRef.current) {
        skipToNextQuestionRef.current();
      }
      // TODO: Real mode için de implement edilmeli
    },
    warningDuration: 5,
  });

  // Silence detection (sadece cihaz testleri tamamlandıktan sonra ve mock mode için)
  // Audio stream'i camera.videoStream'den alıyoruz
  const silence = useSilenceDetection({
    audioStream: camera.videoStream,
    enabled: deviceTestsCompleted && state.isElevenLabsConnected && useMockMode,
    onSilenceDetected: () => {
      console.log("🔇 Silence detected for 10 seconds, skipping to next question");
      if (skipToNextQuestionRef.current) {
        skipToNextQuestionRef.current();
      }
    },
    silenceDuration: 10,
    threshold: 0.01,
  });

  // endSession ref'ini set et (otomatik sonlandırma için - sadece gerçek mode)
  useEffect(() => {
    if (!useMockMode) {
      endSessionRef.current =
        realConversation.endSession.bind(realConversation);
    } else {
      endSessionRef.current = null;
    }
  }, [useMockMode, realConversation]);

  // Audio volume functions for Orb
  const getInputVolume = useCallback(() => {
    if (useMockMode) {
      // Mock mode'da volume simülasyonu
      return 0.3 + Math.random() * 0.2;
    }
    return conversation.getInputVolume?.() ?? 0;
  }, [conversation, useMockMode]);

  const getOutputVolume = useCallback(() => {
    if (useMockMode) {
      // Mock mode'da volume simülasyonu (AI konuşurken)
      return agentState === "talking" ? 0.4 + Math.random() * 0.3 : 0;
    }
    return conversation.getOutputVolume?.() ?? 0;
  }, [conversation, useMockMode, agentState]);

  // Initialize: Camera + ElevenLabs (sadece cihaz testleri tamamlandıktan sonra)
  useEffect(() => {
    if (!deviceTestsCompleted) return;

    const initialize = async () => {
      try {
        setState({ isLoading: true, loadingStep: "starting_camera" });

        // 1. Kamerayı başlat (stream oluşturulacak)
        try {
          await camera.initialize();
          console.log("✅ Camera initialized");
        } catch (err) {
          console.error("❌ Camera initialization failed:", err);
          const errorMessage =
            camera.error ||
            (err instanceof Error ? err.message : "Kamera başlatılamadı");
          throw new Error(errorMessage);
        }

        // Kameranın hazır olduğundan emin ol
        if (camera.error) {
          throw new Error(camera.error);
        }

        setState({
          loadingStep: useMockMode ? "ready" : "connecting_elevenlabs",
        });

        // 2. Mock mode ise mock session'ı başlat
        if (useMockMode) {
          // Kameranın hazır olduğundan emin ol (stream hazır olmalı)
          // State güncellemesi biraz zaman alabilir, bir süre bekle
          await new Promise((resolve) => setTimeout(resolve, 200));

          console.log(
            "🎭 Starting Mock Web Speech Apisession, camera stream:",
            camera.videoStream ? "ready" : "not ready"
          );
          await mockWebSpeechApi.startSession();
          console.log("✅ Mock Web Speech Apiinitialization complete");
          return;
        }

        // 3. Token al (eğer yoksa) - önce room ID'den al, yoksa yeni token oluştur
        let token = conversationTokenRef.current;
        if (!token) {
          // Önce room ID'den token'ı almaya çalış
          try {
            const roomTokenResponse = await fetch(`/api/room/${roomId}/token`);
            if (roomTokenResponse.ok) {
              const roomTokenData = await roomTokenResponse.json();
              token = roomTokenData.conversationToken;
              if (token) {
                console.log("✅ Token retrieved from room:", roomId);
                conversationTokenRef.current = token;
              }
            }
          } catch (roomTokenError) {
            console.warn(
              "⚠️ Could not retrieve token from room, will create new one:",
              roomTokenError
            );
          }

          // Eğer room'dan token alınamadıysa, yeni token oluştur
          if (!token) {
            const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
            if (!agentId) {
              throw new Error("ElevenLabs Agent ID yapılandırılmamış");
            }

            const tokenResponse = await fetch("/api/elevenlabs/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId }),
            });

            if (!tokenResponse.ok) {
              const errorData = await tokenResponse.json().catch(() => ({}));
              throw new Error(errorData.error || "ElevenLabs token alınamadı");
            }

            const tokenData = await tokenResponse.json();
            token =
              tokenData.conversationToken ||
              tokenData.token ||
              tokenData.conversation_token;

            if (!token) {
              throw new Error("Geçersiz ElevenLabs token formatı");
            }

            console.log("✅ New token created");
            conversationTokenRef.current = token;
          }
        }

        // 4. ElevenLabs conversation'ı başlat
        await realConversation.startSession({
          conversationToken: token,
          connectionType: "webrtc",
          overrides: {
            conversation: {
              textOnly: false, // Hem sesli hem metin mesajlaşma
            },
            agent: {
              language: "tr",
            },
          },
        });

        console.log("✅ Initialization complete");
      } catch (err) {
        console.error("❌ Initialization error:", err);
        const errorMsg = err instanceof Error ? err.message : "Başlatma hatası";
        setState({
          errorMessage: errorMsg,
          isLoading: false,
        });
      }
    };

    initialize();

    return () => {
      camera.stop();
      if (useMockMode) {
        mockWebSpeechApi.endSession().catch((err: unknown) => {
          console.warn("Error ending mock conversation:", err);
        });
      } else {
        realConversation.endSession().catch((err: unknown) => {
          console.warn("Error ending conversation:", err);
        });
      }
    };
  }, [useMockMode, deviceTestsCompleted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!camera.videoStream) return;
  
    recorderRef.current = createRecorder({
      videoStream: camera.videoStream,
      aiAudioElement: useMockMode ? null : aiAudioRef.current,
    });
  
    console.log(
      "🎬 Recorder ready",
      useMockMode ? "(mock: no AI audio)" : "(real: AI audio)"
    );
  }, [camera.videoStream, useMockMode]);

  // Handlers
  const handleEndInterview = async () => {
    try {
      if (recorderRef.current) {
        await recorderRef.current.stop();
        recorderRef.current.download();
      }
      if (useMockMode) {
        await mockWebSpeechApi.endSession();
      } else {
        await realConversation.endSession();
      }
      camera.stop();
      globalThis.location.href = "/completed";
    } catch (e) {
      console.error("Error ending interview:", e);

      globalThis.location.href = "/completed";
    }
  };

  const handleSendMessage = useCallback(
    (message: string) => {
      const trimmedMessage = message.trim();
      if (!trimmedMessage) return;

      updateChatInput("");

      // Kullanıcı mesajını ekle (mock mode'da mock hook içinde de ekleniyor ama burada da ekliyoruz)
      if (!useMockMode) {
        updateChatMessages(createChatMessage(trimmedMessage, "Siz"));
      }

      // ElevenLabs'a gönder (mock veya gerçek)
      if (useMockMode) {
        mockWebSpeechApi.sendMessage(trimmedMessage);
      } else {
        realConversation.sendUserMessage(trimmedMessage);
      }
    },
    [
      useMockMode,
      mockWebSpeechApi,
      realConversation,
      updateChatInput,
      updateChatMessages,
    ]
  );

  // Device tests first
  if (!deviceTestsCompleted) {
    return <DeviceTestView onTestsComplete={() => setDeviceTestsCompleted(true)} />;
  }

  // Error handling
  const error = state.errorMessage || camera.error;
  if (error) {
    return <ErrorView error={error} />;
  }

  // Loading state
  if (state.isLoading) {
    return <LoadingView loadingStep={state.loadingStep} />;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      {/* Warning Overlays */}
      <WarningOverlay
        show={eyeContact.isEyeContactLost}
        countdown={eyeContact.countdown}
        message="Lütfen kameraya bakın"
      />
      <WarningOverlay
        show={silence.isSilent}
        countdown={silence.silenceDuration > 0 ? 10 - silence.silenceDuration : 0}
        message="Sessizlik tespit edildi"
      />

      {/* Header */}
      <RoomHeader
        isConnected={true}
        isElevenLabsConnected={state.isElevenLabsConnected}
        isChatOpen={state.isChatOpen}
        onToggleChat={toggleChat}
        onEndInterview={handleEndInterview}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Grid - Kullanıcı kamerası + AI Orb */}
        <VideoGrid
          videoStream={camera.videoStream}
          agentState={agentState}
          getInputVolume={getInputVolume}
          getOutputVolume={getOutputVolume}
          isMockMode={useMockMode}
          isChatOpen={state.isChatOpen}
        />

        {/* Chat Sidebar */}
        {state.isChatOpen && (
          <ChatSidebar
            messages={state.chatMessages}
            chatInput={state.chatInput}
            isElevenLabsConnected={state.isElevenLabsConnected}
            onInputChange={updateChatInput}
            onSendMessage={handleSendMessage}
            onUserActivity={() => {
              // User activity - bot'un konuşmasını engelle (eğer gerekirse)
              conversation.sendUserActivity?.();
            }}
            conversation={conversation}
          />
        )}
      </div>
    </div>
  );
}
