import React, { useState, useEffect } from 'react';
import {
  Compass, AlertTriangle, ShieldCheck, Check, ArrowRight,
  RotateCcw, Activity, MapPin, Sparkles, X, Route, Zap
} from 'lucide-react';
import type { PlanBEvent } from '@/types';

interface PlanBAutopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrip: { origin: string; destination: string };
  onApplyPlanB: (event: PlanBEvent) => void;
  onToast: (msg: string) => void;
}

export function PlanBAutopilotModal({
  isOpen,
  onClose,
  activeTrip = { origin: 'Kochi Central', destination: 'Munnar Hill Station' },
  onApplyPlanB,
  onToast,
}: PlanBAutopilotModalProps) {
  const [autopilotActive, setAutopilotActive] = useState(true);
  const [pulseCount, setPulseCount] = useState(1);
  const [activeEvent, setActiveEvent] = useState<PlanBEvent | null>({
    id: 'pb-01',
    title: 'Monsoon Flash Runoff Detected at Aluva-Perumbavoor Bridge',
    triggerReason: 'Satellite telemetry detected 14mm/hr rainfall surge causing lane constriction on NH-85.',
    severity: 'high',
    impactMinutes: 28,
    alternativeRouteName: 'Seaport-Airport Corridor via MC Road (SH-1)',
    alternativeKm: 134,
    alternativeMinutes: 195,
    suggestedAction: 'Divert onto State Highway 1 to avoid 35-minute bridge standing queue.',
    draftDelayMessage: {
      subject: 'Route Update: Diverting via SH-1 corridor (+15m revised ETA)',
      body: `I am currently en route to ${activeTrip.destination}. Autopilot identified heavy rainfall slowdowns on the primary highway, so I am diverting via SH-1 to ensure steady progress. Revised ETA is +15 minutes.`,
    },
    detected_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'pending',
  });

  // Simulated live telemetry heartbeat counter
  useEffect(() => {
    if (!isOpen || !autopilotActive) return;
    const interval = setInterval(() => {
      setPulseCount((p) => p + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, autopilotActive]);

  const handleAcceptPlanB = () => {
    if (!activeEvent) return;
    onApplyPlanB(activeEvent);
    onToast(`Plan B Detour Applied: Switched to ${activeEvent.alternativeRouteName}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="late-modal-panel"
        style={{ width: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="late-modal-head">
          <div className="late-brand">
            <span
              className="late-icon-badge"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }}
            >
              <Compass size={18} />
            </span>
            <div>
              <h3>Plan B Autopilot (Continuous Trip Sentinel)</h3>
              <p>Continuous AI monitoring that acts before you get stranded</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Live Sentinel Heartbeat Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'var(--surface2)',
            border: '1px solid var(--line)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text)' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: autopilotActive ? 'var(--green)' : 'var(--muted)',
                animation: autopilotActive ? 'markerBeat 1.5s infinite' : 'none',
              }}
            />
            <strong>Autopilot Active:</strong>
            <span>Monitoring {activeTrip.origin} → {activeTrip.destination}</span>
          </div>

          <div style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>
            Pulse #{pulseCount} · OSRM + Open-Meteo Synced
          </div>
        </div>

        {/* Active Incident & Plan B Suggestion */}
        {activeEvent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'color-mix(in srgb, var(--amber) 10%, transparent)',
                border: '1px solid var(--amber)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase' }}>
                  Live Disruption Detected
                </span>
                <span className="late-confidence-tag" style={{ background: 'var(--amber)', color: '#000' }}>
                  +{activeEvent.impactMinutes} min impact
                </span>
              </div>

              <strong style={{ fontSize: '13px', color: 'var(--text)' }}>
                {activeEvent.title}
              </strong>

              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted2)', lineHeight: 1.4 }}>
                {activeEvent.triggerReason}
              </p>
            </div>

            {/* Plan B Comparison Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
                <Route size={16} />
                <strong style={{ fontSize: '12px' }}>Recommended Plan B Detour</strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--line)',
                  fontSize: '11px',
                }}
              >
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>DETOUR CORRIDOR</small>
                  <strong style={{ color: 'var(--text)' }}>{activeEvent.alternativeRouteName}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>ESTIMATED TIME</small>
                  <strong style={{ color: 'var(--green)' }}>{activeEvent.alternativeMinutes} min (Saves ~18 min)</strong>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted2)', lineHeight: 1.4 }}>
                {activeEvent.suggestedAction}
              </p>
            </div>

            {/* Pre-Drafted Delay Notice for Approval */}
            <div className="late-draft-container" style={{ margin: 0 }}>
              <div className="late-draft-head">
                <div className="late-draft-title">
                  <Sparkles size={14} />
                  <span>Pre-drafted Notice (Awaiting One-Click Approval)</span>
                </div>
              </div>
              <div className="late-draft-preview-box">
                <div className="late-draft-subject">{activeEvent.draftDelayMessage.subject}</div>
                <div className="late-draft-body">{activeEvent.draftDelayMessage.body}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="late-actions-bar" style={{ marginTop: '4px' }}>
              <button
                type="button"
                className="late-action-secondary"
                onClick={() => {
                  setActiveEvent(null);
                  onToast('Autopilot incident dismissed. Monitoring continues.');
                }}
              >
                Ignore & Stay on Plan A
              </button>

              <button
                type="button"
                className="late-submit-btn"
                onClick={handleAcceptPlanB}
                style={{ padding: '10px 18px', background: 'linear-gradient(135deg, var(--green), #059669)', color: '#fff' }}
              >
                <Check size={15} />
                <span>Approve Plan B Detour</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
