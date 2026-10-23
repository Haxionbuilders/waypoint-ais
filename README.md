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
