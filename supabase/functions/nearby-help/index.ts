// Nearest hospitals, clinics, pharmacies, police, fuel and ATMs from OpenStreetMap (Overpass).
// Distances are computed here. OSM is community data, so every item is labelled "estimate".
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const KINDS = ['hospital', 'clinic', 'pharmacy', 'police', 'fuel', 'atm'] as const;
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)) * 10) / 10;
};

interface El { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const b = await req.json();
    const lat = Number(b.lat), lng = Number(b.lng);
    const radius = Math.min(Math.max(Number(b.radiusM) || 8000, 1000), 20000);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: 'invalid_coordinates' }, 400);
    const q = `[out:json][timeout:12];(${KINDS.map((k) => `nwr(around:${radius},${lat},${lng})[amenity=${k}];`).join('')});out center 120;`;
    let data: { elements: El[] } | null = null;
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(14000) });
        if (res.ok) { data = await res.json(); break; }
      } catch { /* try next mirror */ }
    }
    if (!data) return json({ error: 'source_unavailable' }, 502);
    const groups: Record<string, unknown[]> = {};
    for (const k of KINDS) groups[k] = [];
    for (const e of data.elements) {
      const eLat = e.lat ?? e.center?.lat, eLng = e.lon ?? e.center?.lon, kind = e.tags?.amenity;
      if (eLat == null || eLng == null || !kind || !groups[kind]) continue;
      groups[kind].push({
        id: `${e.type}-${e.id}`, kind, name: e.tags?.name ?? `Unnamed ${kind}`, distanceKm: km(lat, lng, eLat, eLng), lat: eLat, lng: eLng,
        phone: e.tags?.phone ?? e.tags?.['contact:phone'] ?? null, hours: e.tags?.opening_hours ?? null,
      });
    }
    for (const k of KINDS) groups[k] = (groups[k] as { distanceKm: number }[]).sort((a, c) => a.distanceKm - c.distanceKm).slice(0, 4);
    return json({ places: groups, radiusM: radius, source: 'OpenStreetMap via Overpass', dataType: 'estimate', checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
});
