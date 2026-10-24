import { useState, useEffect, useCallback } from 'react';
import { X, LifeBuoy, Phone, Navigation, MessageCircle, Languages, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { analyzeTrip, type Stop, type GuardianResult } from '@/lib/guardian';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pos?: { lat: number; lng: number } | null;
  journeys: { id: string; origin: string; destination: string }[];
  onToast: (m: string) => void;
}
type Tab = 'help' | 'phrases' | 'guardian';
interface Place { id: string; kind: string; name: string; distanceKm: number; lat: number; lng: number; phone: string | null; hours: string | null }
interface Phrase { english: string; local: string; romanized: string }

const NUMBERS: [string, string][] = [['112', 'Emergency (all services)'], ['108', 'Ambulance'], ['100', 'Police'], ['101', 'Fire'], ['1091', 'Women helpline'], ['1033', 'Highway helpline'], ['1930', 'Cyber fraud']];
const KIND_LABEL: Record<string, string> = { hospital: 'Hospitals', clinic: 'Clinics', pharmacy: 'Pharmacies', police: 'Police', fuel: 'Fuel', atm: 'ATMs' };
const LANGS = ['Hindi', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati', 'Malayalam', 'Punjabi', 'English'];
const SITUATIONS = ['emergency', 'transport', 'food', 'health', 'lodging'];
const C = { bg: '#080B10', card: '#131A24', line: '#22304A', cy: '#64D8FF', mu: '#94A3B8', red: '#F87171', am: '#FBBF24', gr: '#4ADE80' };
const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: C.mu };

async function edge<T>(name: string, body: unknown): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }, body: JSON.stringify(body) });
  } catch { throw new Error(`Could not reach "${name}". Deploy it: supabase functions deploy ${name} --no-verify-jwt`); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error === 'no_api_key' ? 'No AI key set on the server yet (supabase secrets set GEMINI_API_KEY=...).' : d.error || `Failed (${res.status})`);
  return d as T;
}

export function ToolkitModal({ isOpen, onClose, pos, journeys, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('help');
  const [places, setPlaces] = useState<Record<string, Place[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState('Hindi');
  const [sit, setSit] = useState('emergency');
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [jid, setJid] = useState('');
  const [result, setResult] = useState<GuardianResult | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  }, []);

  const loadPlaces = useCallback(() => run(async () => {
    if (!pos) throw new Error('Location unavailable. Allow location access in your browser.');
    const d = await edge<{ places: Record<string, Place[]> }>('nearby-help', { lat: pos.lat, lng: pos.lng });
    setPlaces(d.places);
  }), [pos, run]);

  useEffect(() => { if (isOpen && tab === 'help' && !places && pos) void loadPlaces(); }, [isOpen, tab, places, pos, loadPlaces]);

  if (!isOpen) return null;
  const mapsLink = pos ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : '';
  const shareText = encodeURIComponent(`I need help. My location: ${mapsLink}`);
  const btn: React.CSSProperties = { background: C.cy, color: C.bg, border: 0, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none', fontSize: 13 };
  const ghost: React.CSSProperties = { ...btn, background: C.card, color: C.cy, border: `1px solid ${C.line}` };
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 8 };
  const sel: React.CSSProperties = { background: C.card, color: '#F1F5F9', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px' };

  const guard = () => run(async () => {
    if (!supabase || !jid) throw new Error('Pick a trip first.');
    const { data, error } = await supabase.from('waypoints').select('id,label,booking_type,location,start_time,end_time,deadline,action_required,lat,lng').eq('journey_id', jid);
    if (error) throw new Error(error.message);
    setResult(analyzeTrip((data ?? []) as Stop[]));
  });
  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button key={id} onClick={() => { setTab(id); setErr(null); }} style={{ ...ghost, background: tab === id ? C.cy : C.card, color: tab === id ? C.bg : C.cy }}>{icon}{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 14, width: 'min(680px,100%)', maxHeight: '90vh', overflow: 'auto', padding: 20, color: '#F1F5F9' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><LifeBuoy size={18} /> Traveler toolkit</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, color: C.mu, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {tabBtn('help', 'SOS & Help', <Phone size={13} />)}{tabBtn('phrases', 'Phrasebook (AI)', <Languages size={13} />)}{tabBtn('guardian', 'Trip Guardian', <ShieldCheck size={13} />)}
        </div>
        {err && <p style={{ color: C.red, fontSize: 13 }}>{err}</p>}
        {busy && <p style={{ ...mono, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={13} className="spin" /> Working…</p>}

        {tab === 'help' && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 12 }}>
            {NUMBERS.map(([n, l]) => <a key={n} href={`tel:${n}`} style={{ ...card, marginBottom: 0, color: '#F1F5F9', textDecoration: 'none' }}><div style={{ fontSize: 20, fontWeight: 800, color: C.red }}>{n}</div><div style={{ fontSize: 12, color: C.mu }}>{l}</div></a>)}
          </div>
          <p style={{ ...mono, margin: '0 0 8px' }}>OFFICIAL · Indian national helplines. Numbers can differ by state.</p>
          {pos && <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <a style={btn} href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Share location on WhatsApp</a>
            <a style={ghost} href={`sms:?body=${shareText}`}>Share by SMS</a>
            <button style={ghost} onClick={() => { void navigator.clipboard.writeText(mapsLink); onToast('Location link copied'); }}>Copy link</button>
          </div>}
          {places && Object.entries(places).map(([k, list]) => list.length > 0 && (
            <div key={k}><div style={{ ...mono, margin: '10px 0 6px', textTransform: 'uppercase' }}>{KIND_LABEL[k]}</div>
              {list.map((p) => (
                <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div><div style={mono}>ESTIMATE · OpenStreetMap · {p.distanceKm} km{p.hours ? ` · ${p.hours}` : ''}</div></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {p.phone && <a style={ghost} href={`tel:${p.phone.split(';')[0].replace(/\s/g, '')}`} aria-label="Call"><Phone size={13} /></a>}
                    <a style={btn} href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" aria-label="Navigate"><Navigation size={13} /></a>
                  </div>
                </div>))}
            </div>))}
          {places && Object.values(places).every((l) => l.length === 0) && <p style={{ color: C.mu, fontSize: 13 }}>Nothing found within 8 km in OpenStreetMap. Map data can be incomplete, so call 112 if urgent.</p>}
          {!pos && <p style={{ color: C.mu, fontSize: 13 }}>Allow location access to see nearby help.</p>}
        </>)}

        {tab === 'phrases' && (<>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={sel}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
            <select value={sit} onChange={(e) => setSit(e.target.value)} style={sel}>{SITUATIONS.map((s) => <option key={s}>{s}</option>)}</select>
            <button style={btn} disabled={busy} onClick={() => void run(async () => setPhrases((await edge<{ phrases: Phrase[] }>('travel-phrases', { language: lang, situation: sit })).phrases))}>Generate phrases</button>
          </div>
          {phrases?.map((p, i) => (
            <div key={i} style={card}><div style={{ color: C.mu, fontSize: 12 }}>{p.english}</div><div style={{ fontSize: 20, margin: '2px 0' }}>{p.local}</div><div style={{ ...mono, color: C.cy }}>{p.romanized}</div></div>))}
          {phrases && <p style={mono}>AI-GENERATED translation. Not verified. For medical or legal matters, confirm with a local person.</p>}
        </>)}

        {tab === 'guardian' && (<>
          <p style={{ fontSize: 13, color: C.mu, margin: '0 0 10px' }}>Checks your saved bookings for overlaps, tight connections and deadlines. Rules only, no AI guessing.</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={jid} onChange={(e) => setJid(e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="">Select a trip…</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.origin} → {j.destination}</option>)}
            </select>
            <button style={btn} disabled={busy} onClick={() => void guard()}>Check trip</button>
          </div>
          {result && (<>
            <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: result.score >= 80 ? C.gr : result.score >= 50 ? C.am : C.red, fontFamily: 'JetBrains Mono, monospace' }}>{result.score}</div>
              <div><div style={{ fontWeight: 700 }}>Trip health score</div><div style={mono}>{result.checked} bookings checked · {result.findings.length} findings</div></div>
            </div>
            {result.checked === 0 && <p style={{ color: C.mu, fontSize: 13 }}>No bookings saved on this trip yet. Add some with the paste or Gmail scan.</p>}
            {result.findings.map((x, i) => (
              <div key={i} style={{ ...card, borderLeft: `3px solid ${x.severity === 'high' ? C.red : x.severity === 'medium' ? C.am : C.gr}` }}>
                <strong style={{ fontSize: 14 }}>{x.title}</strong><div style={{ fontSize: 13, color: C.mu }}>{x.detail}</div><div style={mono}>{x.dataType.toUpperCase()}</div>
              </div>))}
          </>)}
        </>)}
      </div>
    </div>
  );
}
