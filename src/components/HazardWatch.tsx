import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, X, RefreshCw, ExternalLink, Search } from 'lucide-react';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

interface Hazard {
  id: string; kind: string; title: string; severity: 'low' | 'medium' | 'high'; distanceKm: number | null;
  time: string; url: string; source: string; dataType: 'official' | 'forecast'; confidence: string;
}
interface ScanResult { hazards: Hazard[]; sources: Record<string, 'ok' | 'unavailable'>; radiusKm: number; checkedAt: string }
interface Place { name: string; lat: number; lng: number }
interface Props { pos?: { lat: number; lng: number } | null; onToast: (m: string) => void }

const COLORS = { high: '#F87171', medium: '#FBBF24', low: '#4ADE80' } as const;
const REFRESH_MS = 10 * 60 * 1000;

export function HazardWatch({ pos, onToast }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState('');
  const alerted = useRef<Set<string>>(new Set());

  const target = place ?? (pos ? { name: 'Your location', lat: pos.lat, lng: pos.lng } : null);
  const tLat = target?.lat, tLng = target?.lng;

  const scan = useCallback(async () => {
    if (tLat == null || tLng == null || !supabaseUrl || !supabaseAnonKey) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/hazard-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ lat: tLat, lng: tLng, radiusKm: 150 }),
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const d = (await res.json()) as ScanResult;
      setData(d);
      const fresh = d.hazards.filter((h) => h.severity === 'high' && !alerted.current.has(h.id));
      if (fresh.length) { fresh.forEach((h) => alerted.current.add(h.id)); onToast(`Hazard nearby: ${fresh[0].title}`); }
    } catch (e) {
      setError(e instanceof TypeError ? 'Hazard service unreachable. Deploy it with: supabase functions deploy hazard-scan --no-verify-jwt' : (e as Error).message);
    } finally { setBusy(false); }
  }, [tLat, tLng, onToast]);

  useEffect(() => {
    void scan();
    const t = setInterval(() => void scan(), REFRESH_MS);
    return () => clearInterval(t);
  }, [scan]);

  const findPlace = async () => {
    if (!query.trim()) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const j = (await r.json()) as { display_name: string; lat: string; lon: string }[];
      if (!j[0]) { onToast('Place not found'); return; }
      setPlace({ name: j[0].display_name.split(',').slice(0, 2).join(','), lat: Number(j[0].lat), lng: Number(j[0].lon) });
    } catch { onToast('Place search failed'); }
  };

  const high = data?.hazards.filter((h) => h.severity !== 'low').length ?? 0;
  const down = data ? Object.entries(data.sources).filter(([, v]) => v === 'unavailable').map(([k]) => k) : [];
  const card: React.CSSProperties = { background: '#131A24', border: '1px solid #22304A', borderRadius: 10, padding: 12, marginBottom: 8 };
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#94A3B8' };

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="Nearby hazards (auto-scan)" style={{ position: 'relative' }}>
        <ShieldAlert size={16} />
        {high > 0 && <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, background: '#F87171' }} />}
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setOpen(false)}>
          <div style={{ background: '#080B10', border: '1px solid #22304A', borderRadius: 14, width: 'min(640px,100%)', maxHeight: '88vh', overflow: 'auto', padding: 20, color: '#F1F5F9' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><ShieldAlert size={18} /> Hazards near {target?.name ?? '…'}</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 0, color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void findPlace()} placeholder="Check another place, e.g. Pune"
                style={{ flex: 1, background: '#131A24', border: '1px solid #22304A', borderRadius: 8, padding: '8px 10px', color: '#F1F5F9' }} />
              <button onClick={() => void findPlace()} style={{ background: '#64D8FF', color: '#080B10', border: 0, borderRadius: 8, padding: '0 12px', cursor: 'pointer' }} aria-label="Search"><Search size={14} /></button>
              <button onClick={() => void scan()} disabled={busy} style={{ background: '#131A24', color: '#64D8FF', border: '1px solid #22304A', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }} aria-label="Refresh"><RefreshCw size={14} /></button>
            </div>
            {!target && <p style={{ color: '#94A3B8', fontSize: 13 }}>Allow location access, or search for a place above.</p>}
            {error && <p style={{ color: '#F87171', fontSize: 13 }}>{error}</p>}
            {data && (
              <>
                <p style={{ ...mono, margin: '0 0 10px' }}>
                  Checked {new Date(data.checkedAt).toLocaleTimeString()} · radius {data.radiusKm} km · auto-refresh every 10 min
                  {down.length > 0 && <span style={{ color: '#FBBF24' }}> · unavailable: {down.join(', ')}</span>}
                </p>
                {data.hazards.length === 0 && (
                  <p style={{ color: '#94A3B8', fontSize: 13 }}>
                    {down.length === 3 ? 'All sources unavailable, so nothing could be checked.' : 'No reports found in the sources that responded (USGS quakes last 7 days, NASA open events last 30 days, 48h weather forecast). This is not a guarantee of safety.'}
                  </p>
                )}
                {data.hazards.map((h) => (
                  <div key={h.id} style={{ ...card, borderLeft: `3px solid ${COLORS[h.severity]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{h.title}</strong>
                      <span style={{ ...mono, color: COLORS[h.severity], textTransform: 'uppercase' }}>{h.severity}</span>
                    </div>
                    <div style={{ ...mono, marginTop: 4 }}>
                      {h.dataType.toUpperCase()} · {h.source}{h.distanceKm ? ` · ${h.distanceKm} km away` : ''} · {new Date(h.time).toLocaleString()}
                    </div>
                    <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ color: '#64D8FF', fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 6 }}>Source <ExternalLink size={11} /></a>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
