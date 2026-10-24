// AI phrasebook. The LLM only translates; output is always labelled AI-generated.
import { generateWithFallback } from '../_shared/llm/manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const SITUATIONS: Record<string, string> = {
  emergency: 'emergencies: asking for help, calling police or an ambulance, saying I am lost or hurt',
  transport: 'transport: asking directions, bus or train timings, fares, asking a driver to stop or use the meter',
  food: 'food: ordering, vegetarian options, allergies, asking for water, asking for the bill',
  health: 'health: needing a doctor or pharmacy, describing pain, allergies, medicine names',
  lodging: 'lodging: checking in, room problems, asking for a receipt, late arrival',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const b = await req.json();
    const language = typeof b.language === 'string' ? b.language.trim() : '';
    const situation = typeof b.situation === 'string' ? b.situation : '';
    if (!/^[\p{L} ]{2,30}$/u.test(language) || !SITUATIONS[situation]) return json({ error: 'invalid_input' }, 400);
    const r = await generateWithFallback({
      jsonMode: true, temperature: 0.2, maxTokens: 1200,
      messages: [
        { role: 'system', content: 'You are a careful translator for travelers. Reply with JSON only, no markdown: {"phrases":[{"english":string,"local":string,"romanized":string}]}. Exactly 8 short, polite, commonly used phrases. "local" is in the native script, "romanized" is Latin-letter pronunciation.' },
        { role: 'user', content: `Language: ${language}. Topic: ${SITUATIONS[situation]}.` },
      ],
    });
    const parsed = JSON.parse(r.text.replace(/```json|```/g, '').trim());
    const phrases = (Array.isArray(parsed.phrases) ? parsed.phrases : []).slice(0, 10)
      .filter((p: Record<string, unknown>) => typeof p.english === 'string' && typeof p.local === 'string')
      .map((p: Record<string, string>) => ({ english: p.english, local: p.local, romanized: typeof p.romanized === 'string' ? p.romanized : '' }));
    if (phrases.length === 0) return json({ error: 'invalid_response' }, 502);
    return json({ phrases, language, situation, aiGenerated: true, provider: r.provider, model: r.model });
  } catch (e) {
    return json({ error: (e as Error).message.startsWith('No LLM providers') ? 'no_api_key' : 'ai_unavailable' }, 502);
  }
});
