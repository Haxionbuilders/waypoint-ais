// Auto hazard scan: USGS earthquakes + NASA EONET open events + Open-Meteo severe-weather forecast.
// Every item is labelled official or forecast with its source URL. No LLM involved.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Kind = 'earthquake' | 'wildfire' | 'flood' | 'storm' | 'volcano' | 'other';
interface Hazard {
  id: string; kind: Kind; title: string; severity: 'low' | 'medium' | 'high'; distanceKm: number | null;
  lat: number | null; lng: number | null; time: string; url: string; source: string;
  dataType: 'official' | 'forecast'; confidence: 'high' | 'medium';
}

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
};
const get = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

async function usgs(lat: number, lng: number, radius: number): Promise<Hazard[]> {
  const start = new Date(Date.now() - 7 * 864e5).toISOString();
  const d = await get(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=${radius}&starttime=${start}&minmagnitude=2.5&orderby=time&limit=15`);
  return (d.features ?? []).map((f: { id: string; properties: { mag: number; place: string; time: number; url: string }; geometry: { coordinates: number[] } }) => {
    const [eLng, eLat] = f.geometry.coordinates, m = f.properties.mag;
    return {
      id: `usgs-${f.id}`, kind: 'earthquake' as Kind, title: `M${m.toFixed(1)} earthquake, ${f.properties.place}`,
      severity: m >= 6 ? 'high' : m >= 4.5 ? 'medium' : 'low', distanceKm: km(lat, lng, eLat, eLng), lat: eLat, lng: eLng,
      time: new Date(f.properties.time).toISOString(), url: f.properties.url, source: 'USGS Earthquake Hazards Program',
      dataType: 'official' as const, confidence: 'high' as const,
    };
  });
}

const EONET_KIND: Record<string, Kind> = { wildfires: 'wildfire', floods: 'flood', severeStorms: 'storm', volcanoes: 'volcano' };
async function eonet(lat: number, lng: number, radius: number): Promise<Hazard[]> {
  const dLat = radius / 111, dLng = radius / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
  const bbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(3)).join(',');
  const d = await get(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&bbox=${bbox}`);
  const out: Hazard[] = [];
  for (const e of d.events ?? []) {
    const g = e.geometry?.[e.geometry.length - 1];
    if (!g || g.type !== 'Point') continue;
    const [eLng, eLat] = g.coordinates, dist = km(lat, lng, eLat, eLng);
    if (dist > radius) continue;
    const cat = e.categories?.[0]?.id as string | undefined;
    out.push({
      id: `eonet-${e.id}`, kind: EONET_KIND[cat ?? ''] ?? 'other', title: e.title,
      severity: dist <= 50 ? 'high' : dist <= radius / 2 ? 'medium' : 'low', distanceKm: dist, lat: eLat, lng: eLng,
      time: g.date, url: e.link ?? 'https://eonet.gsfc.nasa.gov/', source: 'NASA EONET', dataType: 'official', confidence: 'medium',
    });
  }
  return out;
}

async function weather(lat: number, lng: number): Promise<Hazard[]> {
  const d = await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=weathercode,precipitation,windgusts_10m&forecast_days=2&timezone=UTC`);
  const h = d.hourly, out: Hazard[] = [];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`;
  const now = Date.now();
  const idx = (h.time as string[]).map((t, i) => ({ t: Date.parse(t + 'Z'), i })).filter((x) => x.t >= now - 36e5).map((x) => x.i);
  const pick = (test: (i: number) => boolean) => idx.find(test);
  const mk = (id: string, kind: Kind, title: string, sev: Hazard['severity'], i: number): Hazard => ({
    id, kind, title, severity: sev, distanceKm: 0, lat, lng, time: new Date(Date.parse(h.time[i] + 'Z')).toISOString(),
    url, source: 'Open-Meteo forecast', dataType: 'forecast', confidence: 'medium',
  });
  const ts = pick((i) => h.weathercode[i] >= 95);
  if (ts !== undefined) out.push(mk('wx-thunder', 'storm', 'Thunderstorm forecast', 'high', ts));
  const rain = pick((i) => h.precipitation[i] >= 8);
  if (rain !== undefined) out.push(mk('wx-rain', 'flood', `Heavy rain forecast (${h.precipitation[rain]} mm/h), flooding possible`, 'medium', rain));
  const wind = pick((i) => h.windgusts_10m[i] >= 60);
  if (wind !== undefined) out.push(mk('wx-wind', 'storm', `Strong wind gusts forecast (${Math.round(h.windgusts_10m[wind])} km/h)`, h.windgusts_10m[wind] >= 80 ? 'high' : 'medium', wind));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const b = await req.json();
    const lat = Number(b.lat), lng = Number(b.lng);
    const radius = Math.min(Math.max(Number(b.radiusKm) || 150, 10), 500);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: 'invalid_coordinates' }, 400);
    const jobs = { usgs: usgs(lat, lng, radius), eonet: eonet(lat, lng, radius), weather: weather(lat, lng) };
    const names = Object.keys(jobs) as (keyof typeof jobs)[];
    const settled = await Promise.allSettled(Object.values(jobs));
    const sources: Record<string, 'ok' | 'unavailable'> = {};
    const hazards: Hazard[] = [];
    settled.forEach((r, i) => { sources[names[i]] = r.status === 'fulfilled' ? 'ok' : 'unavailable'; if (r.status === 'fulfilled') hazards.push(...r.value); });
    const rank = { high: 0, medium: 1, low: 2 };
    hazards.sort((a, c) => rank[a.severity] - rank[c.severity] || (a.distanceKm ?? 0) - (c.distanceKm ?? 0));
    return json({ hazards, sources, radiusKm: radius, checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
});
