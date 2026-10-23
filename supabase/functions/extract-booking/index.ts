import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingExtraction {
  booking_type: string
  provider: string
  confirmation_number: string
  start_time: string
  end_time: string
  location: string
  address: string
  deadline: string
  action_required: string
  confidence: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Please paste a valid booking email or confirmation text (at least 10 characters).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try providers in order: Gemini → Groq → OpenRouter
    const providers = [
      {
        name: 'gemini',
        key: Deno.env.get('GEMINI_API_KEY') || Deno.env.get('gemini_api_key'),
        call: async (apiKey: string) => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: buildPrompt(text) }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 1024,
                  responseMimeType: 'application/json',
                },
              }),
            }
          )
          if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
          const data = await res.json()
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (!raw) throw new Error('No content from Gemini')
          return JSON.parse(raw)
        },
      },
      {
        name: 'groq',
        key: Deno.env.get('GROQ_API_KEY') || Deno.env.get('groq_api_key'),
        call: async (apiKey: string) => {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: 'You extract structured booking data from travel emails. Return ONLY valid JSON.' },
                { role: 'user', content: buildPrompt(text) },
              ],
              temperature: 0.1,
              max_tokens: 1024,
              response_format: { type: 'json_object' },
            }),
          })
          if (!res.ok) throw new Error(`Groq error: ${res.status}`)
          const data = await res.json()
          const raw = data.choices?.[0]?.message?.content
          if (!raw) throw new Error('No content from Groq')
          return JSON.parse(raw)
        },
      },
      {
        name: 'openrouter',
        key: Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('openrouter_api_key'),
        call: async (apiKey: string) => {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.0-flash-exp:free',
              messages: [
                { role: 'system', content: 'You extract structured booking data from travel emails. Return ONLY valid JSON.' },
                { role: 'user', content: buildPrompt(text) },
              ],
              temperature: 0.1,
              max_tokens: 1024,
              response_format: { type: 'json_object' },
            }),
          })
          if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`)
          const data = await res.json()
          const raw = data.choices?.[0]?.message?.content
          if (!raw) throw new Error('No content from OpenRouter')
          return JSON.parse(raw)
        },
      },
    ]

    let extraction: BookingExtraction | null = null
    let usedProvider = 'none'
    const errors: string[] = []

    for (const provider of providers) {
      if (!provider.key) {
        errors.push(`${provider.name}: API key not configured`)
        continue
      }
      try {
        const result = await provider.call(provider.key)
        extraction = validateExtraction(result)
        usedProvider = provider.name
        break
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`)
      }
    }

    if (!extraction) {
      return new Response(JSON.stringify({
        error: 'All LLM providers failed to extract booking data.',
        details: errors,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log to Supabase if available
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey)
        await sb.from('llm_logs').insert({
          provider: usedProvider,
          model: usedProvider === 'gemini' ? 'gemini-2.0-flash' : usedProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-2.0-flash-exp:free',
          task: 'extract-booking',
          success: true,
          timestamp: new Date().toISOString(),
        }).then(() => {}) // fire and forget
      }
    } catch { /* logging is best-effort */ }

    return new Response(JSON.stringify({
      extraction,
      provider: usedProvider,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function buildPrompt(emailText: string): string {
  return `Extract structured booking information from this travel email or confirmation.

Return a JSON object with exactly these fields:
- booking_type: "flight" | "hotel" | "train" | "bus" | "car_rental" | "restaurant" | "event" | "other"
- provider: the airline, hotel chain, or service name
- confirmation_number: booking reference or confirmation code
- start_time: ISO 8601 datetime for check-in, departure, or start
- end_time: ISO 8601 datetime for check-out, arrival, or end
- location: city or venue name
- address: full street address if available, otherwise ""
- deadline: any cancellation deadline or action date in ISO 8601, or ""
- action_required: any action the traveler needs to take, or ""
- confidence: number 0-100 indicating extraction confidence

If a field is not found in the text, use an empty string "" (or 0 for confidence).

EMAIL TEXT:
"""
${emailText.slice(0, 3000)}
"""`
}

function validateExtraction(raw: Record<string, unknown>): BookingExtraction {
  return {
    booking_type: String(raw.booking_type || 'other'),
    provider: String(raw.provider || ''),
    confirmation_number: String(raw.confirmation_number || ''),
    start_time: String(raw.start_time || ''),
    end_time: String(raw.end_time || ''),
    location: String(raw.location || ''),
    address: String(raw.address || ''),
    deadline: String(raw.deadline || ''),
    action_required: String(raw.action_required || ''),
    confidence: Math.min(100, Math.max(0, Number(raw.confidence) || 0)),
  }
}
