# WAYPOINT AI — Autonomous Journey Intelligence & Road-Safety Agent

WAYPOINT AI is a multi-agent journey intelligence and road-safety system built with React 18, TypeScript, Vite, Supabase, and Leaflet.

## Features

1. **"I'm Running Late" Emergency Feasibility Assistant**:
   - Real-time route feasibility assessment combining OSRM road geometry, OpenStreetMap Nominatim geocoding, and Open-Meteo precipitation buffers.
   - Deterministic delay calculation: `delay = estimated arrival time - target arrival time`.
   - Evidence-grounded draft notification requiring explicit user approval (no auto-sending).

2. **Deterministic Evidence Cards**:
   - Every AI-generated conclusion cites verifiable telemetry sources (`official`, `forecast`, `estimate`, `user-provided`).
   - Filter chips: `All`, `Verified only`, `Estimates / Forecasts`.
   - Displays source name, timestamp, confidence badge, and raw reference tokens.

3. **Smart Packing Checklist**:
   - Deterministic rule engine based on destination weather, transit mode, and trip purpose (Client Meeting, Commute, Overnight, Airport, Leisure).
   - Checkable items with Supabase state persistence.

4. **Autonomous Departure Briefing ("Brief Me")**:
   - Concise, evidence-backed departure summary under 120 words.
   - Built-in Web Speech API voice readout (`SpeechSynthesis`).

5. **Paste Booking Email**:
   - Zero-permission travel email parser with structured LLM extraction.
   - On-demand OpenStreetMap Nominatim geocoding with interactive Leaflet map preview.
   - Attach bookings to existing trips or create new journeys.

6. **Provider-Independent Multi-LLM Gateway**:
   - Cascading fallback: Google Gemini → Groq (Llama 3.3) → OpenRouter.
   - Single transient retry on rate-limit/timeout errors.
   - Telemetry logging to Supabase `llm_logs` table.

7. **Operations Dashboard**:
   - Quick action triggers, live GPS telemetry, pending human-in-the-loop approvals, and active hazard feeds.

## Getting Started

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```

## Environment Variables (.env)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase Edge Function Secrets

```bash
supabase secrets set GEMINI_API_KEY=your-gemini-key
supabase secrets set GROQ_API_KEY=your-groq-key
supabase secrets set OPENROUTER_API_KEY=your-openrouter-key
supabase secrets set LLM_PROVIDER_ORDER="gemini,groq,openrouter"
```

## Deploying the backend (fixes CORS and 404 errors)

The site on GitHub Pages only talks to your Supabase project. Both of these must be done once, or you will see
"blocked by CORS policy" and 404 errors in the browser console:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                         # creates conversations, journeys, waypoints, packing_checklists, ...
supabase functions deploy waypoint-agent panic-check extract-booking photo-report --no-verify-jwt
```

Then in Supabase: Authentication > URL Configuration, add your GitHub Pages URL to Site URL and Redirect URLs.
In GitHub: Settings > Secrets > Actions, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Gmail connection (optional)

Waypoint can scan your Gmail for booking emails and save delay notices as **Gmail drafts**. It never sends mail.

1. Google Cloud Console: create a project, enable the **Gmail API**, then OAuth consent screen > add scopes `gmail.readonly` and `gmail.compose`, and add your own address under **Test users**.
2. Credentials > Create OAuth client ID (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > Providers > Google: paste the client ID and secret, enable it.
4. Supabase > Authentication > URL Configuration: add your GitHub Pages URL to the redirect list.
5. `supabase functions deploy gmail-sync --no-verify-jwt`
6. In the app click the inbox icon > Connect Gmail > Scan.

## Traveler toolkit (lifebuoy icon)

- **SOS & Help:** Indian helpline numbers, share-location via WhatsApp/SMS (opens the app, you press send), and the nearest hospitals, pharmacies, police, fuel and ATMs from OpenStreetMap.
- **Phrasebook (AI):** 8 travel phrases in 10 languages with romanized pronunciation. Labelled AI-generated.
- **Trip Guardian:** rule-based check of saved bookings for overlaps, tight connections and deadlines, with a 0-100 health score.

Deploy: `supabase functions deploy nearby-help travel-phrases hazard-scan --no-verify-jwt`
