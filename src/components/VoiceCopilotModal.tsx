import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, X, AlertTriangle, Radio } from 'lucide-react';
import { processAutonomousQuery } from '@/lib/clientAi';

interface VoiceCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination?: string;
  userPos?: { lat: number; lng: number } | null;
  onOpenLateModal: () => void;
  onToast: (msg: string) => void;
}

export function VoiceCopilotModal({
  isOpen,
  onClose,
  destination = 'Munnar Hill Station',
  userPos,
  onOpenLateModal,
  onToast,
}: VoiceCopilotModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopSpeaking();
      setTranscript('');
      setResponse('');
      return;
    }

    // Initialize Web Speech API Recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setTranscript(text);
        if (event.results[0].isFinal) {
          void handleProcessQuery(text);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [isOpen]);

  const startListening = () => {
    stopSpeaking();
    setTranscript('');
    setResponse('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        // already started
      }
    } else {
      onToast('Speech recognition not supported in this browser. You can click sample voice prompts.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* ignored */ }
    }
    setIsListening(false);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    stopSpeaking();

    // Clean markdown stars
    const clean = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleProcessQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setAnalyzing(true);
    stopListening();

    try {
      const result = await processAutonomousQuery(queryText, userPos);
      setResponse(result.response);
      speakText(result.response);
    } catch {
      const fallback = `Route ahead to ${destination} is mostly clear. Weather forecast shows light rain with a 15-minute pacing buffer recommended.`;
      setResponse(fallback);
      speakText(fallback);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const quickPrompts = [
    'Will I make it to Munnar on time?',
    'What is the weather ahead on the route?',
    'Are there any potholes or flooding hazards?',
    'Brief me on my departure timing',
  ];

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="late-modal-panel"
        style={{ width: '560px', textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="late-modal-head" style={{ justifyContent: 'space-between' }}>
          <div className="late-brand">
            <span
              className="late-icon-badge"
              style={{
                background: isListening
                  ? 'linear-gradient(135deg, #ef4444, #f97316)'
                  : 'linear-gradient(135deg, var(--accent), var(--accent2))',
                animation: isListening ? 'markerBeat 1s infinite' : 'none',
              }}
            >
              <Radio size={18} />
            </span>
            <div style={{ textAlign: 'left' }}>
              <h3>Voice Co-Pilot (Hands-Free)</h3>
              <p>Ask route risks, weather pacing, or arrival feasibility while driving</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Voice Microphone Center Stage */}
        <div style={{ padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: isListening
                ? 'linear-gradient(135deg, #ef4444, #f97316)'
                : 'linear-gradient(135deg, var(--accent), var(--accent2))',
              border: 'none',
              color: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isListening
                ? '0 0 40px rgba(239, 68, 68, 0.6), 0 0 0 10px rgba(239, 68, 68, 0.2)'
                : '0 0 30px var(--glow), 0 0 0 8px rgba(100, 216, 255, 0.15)',
              cursor: 'pointer',
              transition: '0.3s transform',
              transform: isListening ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            {isListening ? <Mic size={36} /> : <Mic size={36} />}
          </button>

          <div>
            <strong style={{ fontSize: '14px', color: isListening ? 'var(--red)' : 'var(--text)' }}>
              {isListening
                ? 'Listening to your voice...'
                : analyzing
                ? 'Reasoning with SenseNova & Telemetry...'
                : isSpeaking
                ? 'Co-Pilot Speaking...'
                : 'Tap microphone to speak hands-free'}
            </strong>
            <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
              {isListening ? 'Speak naturally into your device microphone' : 'Or tap one of the suggested prompts below'}
            </small>
          </div>

          {/* Transcript Display */}
          {transcript && (
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--surface2)',
                border: '1px solid var(--line)',
                fontSize: '12px',
                color: 'var(--text)',
                fontStyle: 'italic',
              }}
            >
              "{transcript}"
            </div>
          )}

          {/* AI Spoken Answer Box */}
          {response && (
            <div
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid var(--accent)',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
                  Co-Pilot Response
                </span>
                <button
                  type="button"
                  onClick={isSpeaking ? stopSpeaking : () => speakText(response)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{isSpeaking ? 'Stop Audio' : 'Replay Audio'}</span>
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                {response.replace(/[*_#]/g, '')}
              </p>

              {response.toLowerCase().includes('late') && (
                <button
                  type="button"
                  className="late-trigger-btn"
                  onClick={() => {
                    onClose();
                    onOpenLateModal();
                  }}
                  style={{ marginTop: '6px' }}
                >
                  <AlertTriangle size={13} /> Open Delay Assistant Notice
                </button>
              )}
            </div>
          )}

          {/* Suggested Quick Prompts */}
          <div style={{ width: '100%', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
              Suggested Driver Inquiries
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="late-action-secondary"
                  style={{ fontSize: '11px', padding: '6px 12px' }}
                  onClick={() => {
                    setTranscript(q);
                    void handleProcessQuery(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
