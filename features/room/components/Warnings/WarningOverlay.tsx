"use client";

interface WarningOverlayProps {
  show: boolean;
  countdown: number;
  message: string;
}

export function WarningOverlay({ show, countdown, message }: WarningOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
      <div className="bg-red-600 text-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 animate-pulse pointer-events-auto">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold mb-1">Uyarı!</h3>
            <p className="text-white/90">{message}</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="text-6xl font-bold mb-2">{countdown}</div>
          <p className="text-white/80 text-sm">saniye içinde diğer soruya geçilecek</p>
        </div>
      </div>
    </div>
  );
}
