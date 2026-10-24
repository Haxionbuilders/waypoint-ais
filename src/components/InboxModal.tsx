import { useState, useCallback } from 'react';
import { X, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { connectGmail, getGmailToken, scanInbox, type InboxEmail } from '@/lib/gmail';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExtract: (text: string) => void;
}

export function InboxModal({ isOpen, onClose, onExtract }: Props) {
  const [emails, setEmails] = useState<InboxEmail[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(!!getGmailToken());

  const scan = useCallback(async () => {
    setBusy(true); setError(null);
    try { setEmails(await scanInbox()); setConnected(true); }
    catch (e) {
      const m = e instanceof Error ? e.message : 'Scan failed';
      if (m === 'not_connected') { setConnected(false); setError('Connect Gmail first (the Google session may have expired).'); }
      else setError(m);
    } finally { setBusy(false); }
  }, []);

  const connect = async () => {
    setBusy(true); setError(null);
    try { await connectGmail(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start Google sign-in'); setBusy(false); }
  };

  if (!isOpen) return null;
  const card: React.CSSProperties = { background: '#131A24', border: '1px solid #22304A', borderRadius: 10, padding: 12, marginBottom: 8, color: '#F1F5F9' };
  const btn: React.CSSProperties = { background: '#64D8FF', color: '#080B10', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#080B10', border: '1px solid #22304A', borderRadius: 14, width: 'min(640px,100%)', maxHeight: '88vh', overflow: 'auto', padding: 20, color: '#F1F5F9' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Mail size={18} /> Gmail booking scan</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 6, alignItems: 'flex-start', margin: '0 0 14px' }}>
          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Optional. Read-only access to find booking emails, plus permission to create drafts. Waypoint never sends mail. Nothing is saved until you review it.
        </p>
        {!connected && <button style={btn} onClick={connect} disabled={busy}>Connect Gmail</button>}
        {connected && <button style={btn} onClick={scan} disabled={busy}><RefreshCw size={14} /> {busy ? 'Scanning…' : emails ? 'Rescan' : 'Scan last 60 days'}</button>}
        {error && <p style={{ color: '#F87171', fontSize: 13 }}>{error}</p>}
        <div style={{ marginTop: 14 }}>
          {emails?.length === 0 && <p style={{ color: '#94A3B8', fontSize: 13 }}>No booking-style emails found in the last 60 days.</p>}
          {emails?.map((m) => (
            <div key={m.id} style={card}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.subject || '(no subject)'}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#94A3B8', margin: '2px 0 6px' }}>{m.from} · {m.date}</div>
              <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>{m.snippet}</div>
              <button style={btn} onClick={() => { onExtract(m.text || m.snippet); onClose(); }}>Extract booking</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
