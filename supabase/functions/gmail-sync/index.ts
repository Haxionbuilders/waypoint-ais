// Gmail bridge. Read-only scan of booking-like emails + creating DRAFTS (never sends).
// The user's Google access token is used for this request only and is never stored or logged.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const QUERY = 'newer_than:60d (subject:(confirmation OR booking OR reservation OR itinerary OR ticket OR flight OR hotel OR "check-in" OR receipt))';

const b64urlToText = (s: string): string => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const textToB64Url = (s: string): string => {
  let bin = '';
  new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const stripHtml = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[] }
const findBody = (p: Part, mime: string): string | null => {
  if (p.mimeType === mime && p.body?.data) return b64urlToText(p.body.data);
  for (const c of p.parts ?? []) { const r = findBody(c, mime); if (r) return r; }
  return null;
};

async function gmail(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (res.status === 401) throw Object.assign(new Error('token_expired'), { code: 401 });
  if (res.status === 403) throw Object.assign(new Error('missing_scope'), { code: 403 });
  if (!res.ok) throw Object.assign(new Error(`gmail_${res.status}`), { code: 502 });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json();
    const token = typeof body.accessToken === 'string' ? body.accessToken : '';
    if (!token) return json({ error: 'missing_token' }, 400);

    if (body.action === 'scan') {
      const list = await gmail(token, `/messages?maxResults=10&q=${encodeURIComponent(QUERY)}`);
      const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
      const emails = await Promise.all(ids.map(async (id) => {
        const m = await gmail(token, `/messages/${id}?format=full`);
        const h = (n: string) => (m.payload?.headers ?? []).find((x: { name: string }) => x.name.toLowerCase() === n)?.value ?? '';
        const text = findBody(m.payload ?? {}, 'text/plain') ?? stripHtml(findBody(m.payload ?? {}, 'text/html') ?? m.snippet ?? '');
        return { id, from: h('from'), subject: h('subject'), date: h('date'), snippet: m.snippet ?? '', text: text.slice(0, 6000) };
      }));
      return json({ emails });
    }

    if (body.action === 'draft') {
      const to = typeof body.to === 'string' ? body.to : '';
      const subject = typeof body.subject === 'string' ? body.subject.slice(0, 300) : '';
      const text = typeof body.body === 'string' ? body.body.slice(0, 20000) : '';
      if (!subject || !text) return json({ error: 'missing_subject_or_body' }, 400);
      const raw = [
        to ? `To: ${to}` : '',
        `Subject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(subject)))}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '', text,
      ].filter((l, i) => l !== '' || i > 2).join('\r\n');
      const d = await gmail(token, '/drafts', { method: 'POST', body: JSON.stringify({ message: { raw: textToB64Url(raw) } }) });
      return json({ draftId: d.id, url: 'https://mail.google.com/mail/u/0/#drafts' });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    const err = e as Error & { code?: number };
    return json({ error: err.message || 'failed' }, err.code ?? 500);
  }
});
