import React, { useState, useEffect } from 'react';
import {
  Clock, Shield, Check, Phone, MessageSquare, AlertTriangle,
  MapPin, CheckCircle2, X, BellRing
} from 'lucide-react';
import type { SafeArrivalSession } from '@/types';

interface SafeArrivalTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination?: string;
  userPos?: { lat: number; lng: number } | null;
  onToast: (msg: string) => void;
}

export function SafeArrivalTimerModal({
  isOpen,
  onClose,
  destination = 'Munnar Hill Station',
  userPos,
  onToast,
}: SafeArrivalTimerModalProps) {
  const [session, setSession] = useState<SafeArrivalSession>({
    id: 'safe-01',
    destination,
    eta: '20:30',
    bufferMinutes: 10,
    emergencyContactName: 'Family Contact',
    emergencyContactPhone: '+919876543210',
    status: 'monitoring',
    startedAt: new Date().toISOString(),
  });

  const [timeLeftMinutes, setTimeLeftMinutes] = useState(24);
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimeLeftMinutes((prev) => {
        if (prev <= 1) {
          setIsOverdue(true);
          return 0;
        }
        return prev - 1;
      });
    }, 60000); // 1 minute ticker
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleConfirmArrival = () => {
    setSession((s) => ({ ...s, status: 'arrived' }));
    onToast('Safe arrival confirmed! Emergency timer deactivated.');
    setTimeout(onClose, 1200);
  };

  const handleDispatchEmergencyMessage = () => {
    const coords = userPos ? ` (GPS: ${userPos.lat.toFixed(4)}, ${userPos.lng.toFixed(4)})` : '';
    const text = `SAFETY ALERT: I have not checked in as safely arrived at ${destination}${coords} by the estimated time. Please verify my status or call me.`;
    const whatsappUrl = `https://wa.me/${session.emergencyContactPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
    onToast('Emergency check-in message opened in WhatsApp');
  };

  if (!isOpen) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="late-modal-panel"
        style={{ width: '560px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="late-modal-head">
          <div className="late-brand">
            <span
              className="late-icon-badge"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Shield size={18} />
            </span>
            <div>
              <h3>Safe Arrival Sentinel</h3>
              <p>Automated check-in timer with emergency contact escalation</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Timer Card */}
        <div
          style={{
            padding: '20px',
            borderRadius: '14px',
            background: isOverdue ? 'color-mix(in srgb, #ef4444 12%, transparent)' : 'var(--surface2)',
            border: isOverdue ? '1px solid #ef4444' : '1px solid var(--line)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: isOverdue ? '#ef4444' : 'var(--green)', textTransform: 'uppercase' }}>
            {isOverdue ? 'Check-in Window Overdue' : 'Active Safe Arrival Countdown'}
          </span>

          <div style={{ fontSize: '42px', fontWeight: 800, fontFamily: 'Inter', color: isOverdue ? '#ef4444' : 'var(--text)' }}>
            {timeLeftMinutes} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--muted)' }}>min remaining</span>
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted2)', maxWidth: '400px' }}>
            Traveling to <strong>{destination}</strong>. If you do not tap "I've Arrived Safely" within your ETA + {session.bufferMinutes}m buffer, a pre-composed alert will prompt your contact.
          </p>

          <button
            type="button"
            onClick={handleConfirmArrival}
            className="late-submit-btn"
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, var(--green), #059669)',
              color: '#fff',
              marginTop: '4px',
            }}
          >
            <Check size={16} />
            <span>I've Arrived Safely</span>
          </button>
        </div>

        {/* Emergency Contact & Dispatch Section */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
              Assigned Emergency Contact
            </span>
            <span style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono' }}>
              {session.emergencyContactPhone}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="late-action-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleDispatchEmergencyMessage}
            >
              <MessageSquare size={13} /> Open Pre-filled WhatsApp Alert
            </button>
            <button
              type="button"
              className="late-action-secondary"
              style={{ flex: 'none', padding: '0 12px' }}
              onClick={() => {
                setIsOverdue(true);
                setTimeLeftMinutes(0);
                onToast('Simulated overdue safety window');
              }}
            >
              <BellRing size={13} /> Test Overdue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
