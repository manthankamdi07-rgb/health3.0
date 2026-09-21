import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MicIcon, MicOffIcon } from './Icons';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  title?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Map portal language codes to Web Speech API language tags
const LANG_MAP: Record<string, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

// Declare SpeechRecognition types for TypeScript
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  title = 'Voice input (Speech to text)',
  size = 16,
  className = '',
  style = {},
}) => {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          onTranscript(transcript.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Cleanup
        }
      }
    };
  }, [onTranscript]);

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!recognitionRef.current || !isSupported) return;

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignored
      }
      setIsListening(false);
    } else {
      try {
        // Set recognition language matching user's selected UI language
        const speechLang = LANG_MAP[i18n.language] || 'en-US';
        recognitionRef.current.lang = speechLang;
        recognitionRef.current.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="Voice input is not supported in this browser"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted, #64748b)',
          opacity: 0.4,
          cursor: 'not-allowed',
          padding: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style,
        }}
      >
        <MicOffIcon size={size} />
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        onClick={toggleListening}
        className={`voice-input-btn ${isListening ? 'voice-input-btn--active' : ''} ${className}`}
        title={isListening ? 'Listening... click to stop' : title}
        aria-label={isListening ? 'Listening... click to stop' : title}
        style={{
          background: isListening ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
          border: isListening ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.12)',
          color: isListening ? '#ef4444' : 'var(--color-text-secondary, #cbd5e1)',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '5px 7px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isListening ? '0 0 14px rgba(239, 68, 68, 0.4)' : 'none',
          animation: isListening ? 'pulse 1.5s infinite' : 'none',
          ...style,
        }}
      >
        <MicIcon size={size} />
        {isListening && (
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>
            Listening...
          </span>
        )}
      </button>
    </div>
  );
};

export default VoiceInputButton;
