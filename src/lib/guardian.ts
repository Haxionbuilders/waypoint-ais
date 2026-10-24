export interface Stop {
  id: string; label: string; booking_type: string; location: string | null;
  start_time: string | null; end_time: string | null; deadline: string | null; action_required: string | null;
  lat: number | null; lng: number | null;
}
export interface Finding { severity: 'high' | 'medium' | 'low'; title: string; detail: string; dataType: 'estimate' | 'user-provided' }
export interface GuardianResult { score: number; findings: Finding[]; checked: number }

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const BUFFER_MIN: Record<string, number> = { flight: 120, train: 45, bus: 30, hotel: 20 };
const t = (s: string | null) => (s ? Date.parse(s) : NaN);
const name = (s: Stop) => s.label || s.location || s.booking_type;

/** Deterministic checks only. Travel time = straight-line km x 1.3 road factor at 45 km/h (an estimate). */
export function analyzeTrip(stops: Stop[], now = Date.now()): GuardianResult {
  const f: Finding[] = [];
  const sorted = [...stops].sort((a, b) => (t(a.start_time) || Infinity) - (t(b.start_time) || Infinity));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const aEnd = t(a.end_time) || t(a.start_time), bStart = t(b.start_time);
    if (!Number.isFinite(aEnd) || !Number.isFinite(bStart)) {
      f.push({ severity: 'low', title: `Missing time: ${name(a)} or ${name(b)}`, detail: 'Add start and end times so the gap can be checked.', dataType: 'user-provided' });
      continue;
    }
    const gap = Math.round((bStart - aEnd) / 60000);
    if (gap < 0) { f.push({ severity: 'high', title: `Overlap: ${name(a)} and ${name(b)}`, detail: `They overlap by ${-gap} min.`, dataType: 'user-provided' }); continue; }
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      const dist = km(a.lat, a.lng, b.lat, b.lng);
      const travel = Math.round((dist * 1.3 / 45) * 60);
      const need = travel + (BUFFER_MIN[b.booking_type] ?? 30);
      if (gap < travel) f.push({ severity: 'high', title: `Likely missed: ${name(a)} to ${name(b)}`, detail: `${gap} min gap, about ${travel} min travel for ${Math.round(dist)} km.`, dataType: 'estimate' });
      else if (gap < need) f.push({ severity: 'medium', title: `Tight: ${name(a)} to ${name(b)}`, detail: `${gap} min gap, about ${need} min needed including check-in buffer.`, dataType: 'estimate' });
    }
  }
  for (const s of sorted) {
    const d = t(s.deadline);
    if (Number.isFinite(d)) {
      const hrs = (d - now) / 3.6e6;
      if (hrs < 0) f.push({ severity: 'medium', title: `Deadline passed: ${name(s)}`, detail: s.action_required ?? 'Check if action is still possible.', dataType: 'user-provided' });
      else if (hrs <= 24) f.push({ severity: 'high', title: `Due within 24h: ${name(s)}`, detail: s.action_required ?? 'Action required before the deadline.', dataType: 'user-provided' });
      else if (hrs <= 72) f.push({ severity: 'medium', title: `Due soon: ${name(s)}`, detail: s.action_required ?? 'Action required.', dataType: 'user-provided' });
    }
    if (s.lat == null || s.lng == null) f.push({ severity: 'low', title: `Not located: ${name(s)}`, detail: 'Verify this booking on the map so travel time can be checked.', dataType: 'user-provided' });
  }
  const w = { high: 30, medium: 15, low: 5 };
  const score = Math.max(0, 100 - f.reduce((n, x) => n + w[x.severity], 0));
  return { score, findings: f.sort((a, b) => 'hml'.indexOf(a.severity[0]) - 'hml'.indexOf(b.severity[0])), checked: stops.length };
}
