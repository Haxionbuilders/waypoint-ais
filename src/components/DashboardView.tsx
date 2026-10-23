import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  Mail,
  RotateCcw,
  MapPin,
  Sparkles,
  LocateFixed,
  Zap,
  ArrowRight,
  Shield,
  Briefcase,
} from 'lucide-react';
import { DepartureBriefingCard } from '@/components/DepartureBriefingCard';
import { SmartPackingModal } from '@/components/SmartPackingModal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Journey {
  id: string;
  origin: string;
  destination: string;
  travel_mode: string;
  departure_at: string;
  created_at: string;
  status?: string;
}

interface DashboardViewProps {
  onOpenLateModal: () => void;
  onOpenPasteBooking: () => void;
  onOpenPhotoReport: () => void;
  onOpenRecovery: (trip: Journey) => void;
  userPos: { lat: number; lng: number; accuracy: number } | null;
  onToast: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Demo journey used for the "Test Trip Recovery" card                */
/* ------------------------------------------------------------------ */

const DEMO_JOURNEY: Journey = {
  id: 'demo-recovery-001',
  origin: 'London Paddington',
  destination: 'Bristol Temple Meads',
  travel_mode: 'train',
  departure_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  status: 'disrupted',
};

/* ------------------------------------------------------------------ */
/*  Inline style helpers                                               */
/* ------------------------------------------------------------------ */

const card = (hover: boolean): React.CSSProperties => ({
  background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 20,
  transition: 'background 0.2s ease, transform 0.2s ease',
  transform: hover ? 'translateY(-2px)' : 'translateY(0)',
  cursor: 'pointer',
});

const titleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.95)',
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 14,
  margin: 0,
  marginTop: 4,
};

const sectionLabel: React.CSSProperties = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  margin: 0,
  marginBottom: 12,
};

const cardTitle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.92)',
  fontSize: 15,
  fontWeight: 600,
  margin: 0,
};

const cardDesc: React.CSSProperties = {
  color: 'rgba(255,255,255,0.4)',
  fontSize: 12,
  margin: 0,
  marginTop: 4,
};

const dotStyle = (color: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  display: 'inline-block',
  marginRight: 8,
  boxShadow: `0 0 6px ${color}`,
});

/* ------------------------------------------------------------------ */
/*  Keyframe injection (runs once)                                     */
/* ------------------------------------------------------------------ */

const STYLE_ID = '__dashboard-view-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    @keyframes pulse-accent {
      0%   { box-shadow: 0 0 0 0 rgba(100,216,255,0.35); }
      70%  { box-shadow: 0 0 0 10px rgba(100,216,255,0); }
      100% { box-shadow: 0 0 0 0 rgba(100,216,255,0); }
    }
  `;
  document.head.appendChild(styleEl);
}

/* ------------------------------------------------------------------ */
/*  ActionCard                                                         */
/* ------------------------------------------------------------------ */

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  pulse?: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick, pulse }) => {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = {
    ...card(hovered),
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    ...(pulse
      ? { animation: 'pulse-accent 2s infinite', borderColor: 'rgba(100,216,255,0.25)' }
      : {}),
  };

  return (
    <div
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(100,216,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <p style={cardTitle}>{title}</p>
        <p style={cardDesc}>{description}</p>
      </div>
      <ArrowRight size={14} color="rgba(255,255,255,0.25)" style={{ marginLeft: 'auto' }} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  StatusCard                                                         */
/* ------------------------------------------------------------------ */

interface StatusCardProps {
  label: string;
  value: string;
  dotColor?: string;
  icon: React.ReactNode;
}

const StatusCard: React.FC<StatusCardProps> = ({ label, value, dotColor, icon }) => (
  <div
    style={{
      ...card(false),
      cursor: 'default',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'rgba(100,216,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <p style={{ ...cardDesc, marginTop: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </p>
      <p style={{ ...cardTitle, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {dotColor && <span style={dotStyle(dotColor)} />}
        {value}
      </p>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  DashboardView                                                      */
/* ------------------------------------------------------------------ */

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenLateModal,
  onOpenPasteBooking,
  onOpenPhotoReport,
  onOpenRecovery,
  userPos,
  onToast,
}) => {
  const [showPacking, setShowPacking] = useState(false);
  const gpsLabel = userPos
    ? `±${Math.round(userPos.accuracy)} m`
    : 'Not tracking';

  const gpsColor = userPos
    ? userPos.accuracy < 30
      ? '#34d399'
      : '#facc15'
    : 'rgba(255,255,255,0.25)';

  return (
    <div
      className="dashboard-view"
      style={{
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      {/* ---- Header ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'rgba(100,216,255,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Activity size={22} color="var(--accent, #64d8ff)" />
        </div>
        <div>
          <h2 style={titleStyle}>Operations Dashboard</h2>
          <p style={subtitleStyle}>Quick access to all WAYPOINT AI tools</p>
        </div>
      </div>

      {/* ---- Autonomous Departure Briefing ---- */}
      <DepartureBriefingCard
        trip={{ origin: 'Kochi Central', destination: 'Munnar Hill Station' }}
        onPrepareDelayMessage={onOpenLateModal}
      />

      {/* ---- Quick Actions ---- */}
      <div>
        <p style={sectionLabel}>Quick Actions</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          <ActionCard
            icon={<AlertTriangle size={20} color="var(--accent, #64d8ff)" />}
            title="I'm Running Late"
            description="Notify contacts and get re‑routed"
            onClick={onOpenLateModal}
            pulse
          />
          <ActionCard
            icon={<Briefcase size={20} color="var(--accent, #64d8ff)" />}
            title="Smart Packing Checklist"
            description="Weather & transit gear checklist"
            onClick={() => setShowPacking(true)}
          />
          <ActionCard
            icon={<Camera size={20} color="var(--accent, #64d8ff)" />}
            title="Photo Hazard Report"
            description="Snap a photo and file a report"
            onClick={onOpenPhotoReport}
          />
          <ActionCard
            icon={<Mail size={20} color="var(--accent, #64d8ff)" />}
            title="Paste Booking Email"
            description="Import trip details from an email"
            onClick={onOpenPasteBooking}
          />
          <ActionCard
            icon={<RotateCcw size={20} color="var(--accent, #64d8ff)" />}
            title="Test Trip Recovery"
            description="Simulate a disrupted journey recovery"
            onClick={() => {
              onOpenRecovery(DEMO_JOURNEY);
              onToast('Demo recovery trip loaded');
            }}
          />
        </div>
      </div>

      {showPacking && (
        <SmartPackingModal
          isOpen={showPacking}
          onClose={() => setShowPacking(false)}
          destination="Munnar"
          onToast={onToast}
        />
      )}

      {/* ---- Status Cards ---- */}
      <div>
        <p style={sectionLabel}>System Status</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <StatusCard
            label="GPS"
            value={gpsLabel}
            dotColor={gpsColor}
            icon={<LocateFixed size={18} color="var(--accent, #64d8ff)" />}
          />
          <StatusCard
            label="System"
            value="Operational"
            dotColor="#34d399"
            icon={<Shield size={18} color="var(--accent, #64d8ff)" />}
          />
          <StatusCard
            label="Agent"
            value="Ready"
            dotColor="#34d399"
            icon={<Zap size={18} color="var(--accent, #64d8ff)" />}
          />
        </div>
      </div>

      {/* ---- Recent Activity ---- */}
      <div>
        <p style={sectionLabel}>Recent Activity</p>
        <div
          style={{
            ...card(false),
            cursor: 'default',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
            textAlign: 'center',
          }}
        >
          <Sparkles size={28} color="rgba(255,255,255,0.15)" />
          <p
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: 13,
              margin: 0,
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            Agent activity will appear here as you use WAYPOINT AI
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
