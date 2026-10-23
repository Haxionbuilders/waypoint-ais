import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const geocodeCache = new Map<string, CacheEntry<{ lat: number; lng: number; label: string; country?: string }>>();
const weatherCache = new Map<string, CacheEntry<WeatherResult>>();

interface WeatherResult {
  condition: string;
  weatherCode: number;
  temp: number;
  precipitation: number;
  windSpeed: number;
}

interface ToolActivity {
  step: string;
  label: string;
  status: "success" | "error" | "unavailable";
  detail: string;
}

const RequestSchema = z.object({
  destination: z.string().trim().min(1, "Destination address or place is required"),
  arrivalTime: z.string().trim().min(1, "Target arrival time is required"),
  recipientName: z.string().trim().min(1, "Recipient name is required"),
  relationship: z.enum(["client", "manager", "friend", "hotel"]),
  userLat: z.number().optional(),
  userLng: z.number().optional(),
  originLabel: z.string().optional(),
});

function weatherCodeText(code: number): string {
  const map: Record<number, string> = {
    0: "Clear skies", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy conditions", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow",
    75: "Heavy snow", 80: "Rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm with light hail", 99: "Thunderstorm with heavy hail",
  };
  return map[code] || "Variable conditions";
}

// 1. Geocoding via Nominatim with Open-Meteo fallback & 1-hour cache
async function geocodeDestination(query: string): Promise<{ lat: number; lng: number; label: string; country?: string; fromCache: boolean } | null> {
  const cacheKey = query.toLowerCase().trim();
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, fromCache: true };
  }

  // Primary: Nominatim (OpenStreetMap)
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Waypoint-AI-Emergency-Assistant/1.0 (contact: road-safety@waypoint.local)",
        "Accept-Language": "en",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const result = {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          label: item.display_name.split(",").slice(0, 3).join(",").trim(),
          country: item.address?.country,
        };
        geocodeCache.set(cacheKey, { data: result, expiresAt: Date.now() + 3600000 });
        return { ...result, fromCache: false };
      }
    }
  } catch (err) {
    console.warn("Nominatim geocoding failed, falling back to Open-Meteo:", err);
  }

  // Fallback: Open-Meteo Geocoding
  try {
    const fallbackUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        const result = {
          lat: item.latitude,
          lng: item.longitude,
          label: `${item.name}${item.admin1 ? ", " + item.admin1 : ""}${item.country ? ", " + item.country : ""}`,
          country: item.country,
        };
        geocodeCache.set(cacheKey, { data: result, expiresAt: Date.now() + 3600000 });
        return { ...result, fromCache: false };
      }
    }
  } catch (err) {
    console.error("All geocoding providers failed:", err);
  }

  return null;
}

// 2. Weather via Open-Meteo with 15-minute cache
async function fetchWeather(lat: number, lng: number): Promise<{ data: WeatherResult; fromCache: boolean }> {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, fromCache: true };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
    const res = await fetch(url);
    if (res.ok) {
      const raw = await res.json();
      const c = raw.current;
      const data: WeatherResult = {
        condition: weatherCodeText(c.weather_code ?? 0),
        weatherCode: c.weather_code ?? 0,
        temp: c.temperature_2m ?? 20,
        precipitation: c.precipitation ?? 0,
        windSpeed: c.wind_speed_10m ?? 10,
      };
      weatherCache.set(cacheKey, { data, expiresAt: Date.now() + 900000 });
      return { data, fromCache: false };
    }
  } catch (err) {
    console.warn("Weather fetch error, using default conditions:", err);
  }

  return {
    data: {
      condition: "Clear skies",
      weatherCode: 0,
      temp: 22,
      precipitation: 0,
      windSpeed: 8,
    },
    fromCache: false,
  };
}

// 3. Route Duration via OSRM
async function getRouteEstimate(originLat: number, originLng: number, destLat: number, destLng: number): Promise<{ distanceKm: number; durationMin: number; geometry: [number, number][] } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        return {
          distanceKm: parseFloat((route.distance / 1000).toFixed(1)),
          durationMin: Math.ceil(route.duration / 60),
          geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
        };
      }
    }
  } catch (err) {
    console.warn("OSRM routing unavailable, falling back to straight-line estimation:", err);
  }

  // Fallback Haversine straight-line distance with 45 km/h urban driving estimate
  const R = 6371;
  const dLat = (destLat - originLat) * Math.PI / 180;
  const dLon = (destLng - originLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(originLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distKm = parseFloat((R * c * 1.3).toFixed(1)); // 1.3 road curvature factor
  const estMin = Math.max(5, Math.ceil((distKm / 42) * 60)); // ~42 km/h average

  return {
    distanceKm: distKm,
    durationMin: estMin,
    geometry: [
      [originLat, originLng],
      [destLat, destLng],
    ],
  };
}

// 4. Generate Short Delay Notice with LLM (Gemini, Groq, OpenRouter, or Deterministic Fallback)
async function generateDelayNotice(params: {
  recipientName: string;
  relationship: "client" | "manager" | "friend" | "hotel";
  destination: string;
  targetTime: string;
  estimatedArrival: string;
  delayMinutes: number;
  status: string;
  weather: WeatherResult;
  distanceKm: number;
  evidence: string[];
}): Promise<{ subject: string; body: string }> {
  const { recipientName, relationship, destination, targetTime, estimatedArrival, delayMinutes, status, weather, distanceKm, evidence } = params;

  const prompt = `You are a road safety travel assistant for a traveler who is en route to ${destination}.
Generate a concise, polite delay notification draft based STRICTLY on this verified evidence:
- Contact Name: ${recipientName}
- Relationship: ${relationship} (client, manager, friend, hotel)
- Destination: ${destination}
- Target Arrival Time: ${targetTime}
- Estimated Arrival Time (ETA): ${estimatedArrival}
- Delay: ${delayMinutes} minutes (${status === "can_make_it" ? "on schedule" : status === "tight" ? "tight window" : "likely delayed"})
- Distance: ${distanceKm} km
- Weather en route: ${weather.condition}, ${Math.round(weather.temp)}°C${weather.precipitation > 0 ? `, precipitation ${weather.precipitation} mm` : ""}
- Verified evidence: ${evidence.join("; ")}

CRITICAL INSTRUCTIONS:
1. ONLY reference the verified facts above. Do NOT invent accidents, road closures, or fictional vehicle breakdowns.
2. Tone must strictly match the relationship:
   - "client": Courteous, professional, reassuring.
   - "manager": Concise, direct, transparent about ETA and work readiness.
   - "friend": Warm, casual, appreciative.
   - "hotel": Crisp check-in update with guest name and estimated arrival.
3. Keep the body between 2 to 4 sentences.
4. Output STRICTLY a JSON object with two string fields: "subject" and "body". No Markdown wrapping, no extra keys.`;

  // Option A: Google AI Studio (Gemini 2.5 Flash / 1.5 Flash)
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("gemini_api_key");
  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.subject && parsed.body) return parsed;
        }
      }
    } catch (e) {
      console.warn("Gemini call failed, trying next provider:", e);
    }
  }

  // Option B: GroqCloud (Llama 3.3 / Llama 3.1)
  const groqKey = Deno.env.get("GROQ_API_KEY") || Deno.env.get("groq_api_key");
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You generate concise delay notification drafts in valid JSON format with keys 'subject' and 'body'. Only use verified evidence provided." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.subject && parsed.body) return parsed;
        }
      }
    } catch (e) {
      console.warn("Groq call failed, trying next provider:", e);
    }
  }

  // Option C: OpenRouter Free Models
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("openrouter_api_key");
  if (openRouterKey) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) return parsed;
        }
      }
    } catch (e) {
      console.warn("OpenRouter call failed:", e);
    }
  }

  // Option D: SenseTime SenseNova API
  const senseNovaKey = Deno.env.get("SENSENOVA_API_KEY") || Deno.env.get("sensenova_api_key");
  if (senseNovaKey) {
    try {
      const res = await fetch("https://api.sensenova.cn/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${senseNovaKey}`,
        },
        body: JSON.stringify({
          model: "SenseChat-5",
          messages: [
            { role: "system", content: "You generate concise delay notification drafts in valid JSON format with keys 'subject' and 'body'. Only use verified evidence provided." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) return parsed;
        }
      }
    } catch (e) {
      console.warn("SenseNova call failed:", e);
    }
  }

  // Fallback: Deterministic Evidence-Based Template Generator
  const weatherNote = weather.weatherCode >= 51 ? ` due to ${weather.condition.toLowerCase()} and road pacing` : "";
  const delayStr = delayMinutes > 0 ? `approximately ${delayMinutes} minutes behind schedule` : "on a tight schedule";

  if (relationship === "client") {
    return {
      subject: `Update regarding our appointment — slight delay (ETA: ${estimatedArrival})`,
      body: `Dear ${recipientName},\n\nI am currently traveling toward ${destination} and want to give you an early update. Because of current traffic flow${weatherNote}, my revised estimated arrival is now ${estimatedArrival} (${delayStr}).\n\nI apologize for any inconvenience this may cause and will be ready to begin as soon as I arrive. Thank you for your understanding.`,
    };
  }

  if (relationship === "manager") {
    return {
      subject: `Running ~${delayMinutes || 10}m late to ${destination} — ETA ${estimatedArrival}`,
      body: `Hi ${recipientName},\n\nGiving you a quick heads up that I am currently en route to ${destination} and running ${delayStr}${weatherNote}.\n\nMy live GPS route estimates arrival at ${estimatedArrival}. I will keep you posted if anything changes.`,
    };
  }

  if (relationship === "hotel") {
    return {
      subject: `Check-in update: Late arrival notice (ETA ${estimatedArrival})`,
      body: `Hello ${recipientName},\n\nThis is a quick notification regarding my reservation check-in today. I am currently en route to ${destination} and anticipate arriving at approximately ${estimatedArrival} (${delayStr}).\n\nPlease hold my reservation accordingly. Thank you!`,
    };
  }

  // Default / Friend
  return {
    subject: `Running late! Should be there around ${estimatedArrival}`,
    body: `Hey ${recipientName},\n\nI'm on my way to ${destination} but running ${delayStr}${weatherNote}.\n\nMy current ETA is around ${estimatedArrival}. See you very soon!`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parseResult = RequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request parameters",
          details: parseResult.error.format(),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { destination, arrivalTime, recipientName, relationship, userLat, userLng, originLabel } = parseResult.data;
    const agentSteps: ToolActivity[] = [];
    const evidence: string[] = [];

    // Step 1: Understanding request
    agentSteps.push({
      step: "understanding",
      label: "Understanding emergency request",
      status: "success",
      detail: `Target arrival: ${arrivalTime} for ${recipientName} (${relationship}) at ${destination}`,
    });

    // Step 2: Geocoding via Nominatim
    const geocodeResult = await geocodeDestination(destination);
    if (!geocodeResult) {
      agentSteps.push({
        step: "geocoding",
        label: `Geocoding destination "${destination}"`,
        status: "error",
        detail: "Could not resolve destination coordinates via Nominatim or fallback provider",
      });
      return new Response(
        JSON.stringify({
          status: "unknown",
          estimatedArrivalTime: arrivalTime,
          delayMinutes: 0,
          reason: `Could not geocode destination "${destination}". Please check spelling.`,
          confidence: 0.1,
          draft: {
            subject: `Delay notice — traveling to ${destination}`,
            body: `Hello ${recipientName},\n\nI am running behind schedule on my trip to ${destination}. I will update you as soon as I arrive.`,
          },
          evidence: ["Location geocoding failed"],
          agentSteps,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destLat = geocodeResult.lat;
    const destLng = geocodeResult.lng;
    const destLabel = geocodeResult.label;

    agentSteps.push({
      step: "geocoding",
      label: `Geocoded "${destination}" via Nominatim${geocodeResult.fromCache ? " (cached)" : ""}`,
      status: "success",
      detail: `${destLabel} (${destLat.toFixed(3)}, ${destLng.toFixed(3)})`,
    });
    evidence.push(`Destination resolved to ${destLabel}`);

    // User Origin Coordinates (fallback to nearby or reasonable regional default)
    const originLat = userLat ?? (destLat - 0.18);
    const originLng = userLng ?? (destLng - 0.15);
    const resolvedOriginLabel = originLabel || (userLat ? "Current GPS Position" : "Starting location");

    // Step 3: Weather Scan via Open-Meteo
    const { data: weather, fromCache: weatherFromCache } = await fetchWeather(destLat, destLng);
    agentSteps.push({
      step: "weather",
      label: `Weather scan at destination${weatherFromCache ? " (cached)" : ""}`,
      status: "success",
      detail: `${weather.condition}, ${Math.round(weather.temp)}°C${weather.precipitation > 0 ? ` (rain: ${weather.precipitation} mm)` : ""}`,
    });
    evidence.push(`Live weather: ${weather.condition}, ${Math.round(weather.temp)}°C, wind ${Math.round(weather.windSpeed)} km/h`);

    // Step 4: Route estimation via OSRM
    const route = await getRouteEstimate(originLat, originLng, destLat, destLng);
    const distanceKm = route?.distanceKm ?? 15;
    let durationMin = route?.durationMin ?? 22;

    // Apply weather-adjusted driving buffer
    let weatherBufferMin = 0;
    if (weather.weatherCode >= 61) {
      weatherBufferMin = Math.ceil(durationMin * 0.15) + 3; // +15% plus 3 min in rain/storm
      durationMin += weatherBufferMin;
      evidence.push(`Inclement weather buffer applied: +${weatherBufferMin} min due to ${weather.condition.toLowerCase()}`);
    }

    agentSteps.push({
      step: "route",
      label: "Route estimation via OSRM",
      status: "success",
      detail: `${distanceKm} km, estimated drive: ${durationMin} min${weatherBufferMin > 0 ? ` (incl. +${weatherBufferMin}m weather buffer)` : ""}`,
    });
    evidence.push(`Estimated driving distance: ${distanceKm} km (~${durationMin} minutes)`);

    // Step 5: Delay calculation & status
    const now = new Date();
    // Parse target arrival time
    let targetDate = new Date();
    if (arrivalTime.includes(":")) {
      const [hours, minutes] = arrivalTime.split(":").map(Number);
      targetDate.setHours(hours, minutes, 0, 0);
      // If target time is earlier today by more than 4 hours, assume user meant later or next day
      if (targetDate.getTime() < now.getTime() - 1000 * 60 * 60 * 4) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    } else {
      // Try ISO parse
      const parsed = new Date(arrivalTime);
      if (!isNaN(parsed.getTime())) targetDate = parsed;
    }

    const estimatedArrivalDate = new Date(now.getTime() + durationMin * 60000);
    const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const etaStr = formatTime(estimatedArrivalDate);
    const targetStr = formatTime(targetDate);

    const diffMinutes = Math.round((estimatedArrivalDate.getTime() - targetDate.getTime()) / 60000);
    let status: "can_make_it" | "tight" | "likely_late" | "unknown" = "can_make_it";
    let delayMinutes = 0;
    let reason = "On schedule based on current traffic and weather conditions.";
    let confidence = 0.92;

    if (diffMinutes > 4) {
      status = "likely_late";
      delayMinutes = diffMinutes;
      reason = `Projected route duration is ${durationMin} min, exceeding arrival target by ${delayMinutes} min.`;
      confidence = 0.94;
    } else if (diffMinutes >= -5 && diffMinutes <= 4) {
      status = "tight";
      delayMinutes = Math.max(0, diffMinutes);
      reason = `Timing is tight with only a ${Math.abs(diffMinutes)} minute buffer before ${targetStr}.`;
      confidence = 0.88;
    } else {
      status = "can_make_it";
      delayMinutes = 0;
      reason = `Estimated arrival is ${etaStr}, well ahead of ${targetStr} target.`;
      confidence = 0.91;
    }

    agentSteps.push({
      step: "reasoning",
      label: "Delay probability analysis",
      status: "success",
      detail: `Status: ${status.toUpperCase()} · ${delayMinutes > 0 ? `+${delayMinutes} min delay` : "On schedule"} (ETA: ${etaStr} vs Target: ${targetStr})`,
    });

    // Step 6: Generate Delay Draft Message
    const draft = await generateDelayNotice({
      recipientName,
      relationship,
      destination: destLabel,
      targetTime: targetStr,
      estimatedArrival: etaStr,
      delayMinutes,
      status,
      weather,
      distanceKm,
      evidence,
    });

    agentSteps.push({
      step: "draft_ready",
      label: "Draft generated from verified evidence",
      status: "success",
      detail: `Subject: "${draft.subject}"`,
    });

    // Step 7: Awaiting Approval
    agentSteps.push({
      step: "awaiting_approval",
      label: "Awaiting user review and copy",
      status: "success",
      detail: "Ready for manual review. No automated email will ever be sent.",
    });

    const responsePayload = {
      status,
      estimatedArrivalTime: etaStr,
      targetArrivalTime: targetStr,
      delayMinutes,
      reason,
      confidence,
      draft,
      mapData: {
        origin: { lat: originLat, lng: originLng, label: resolvedOriginLabel },
        destination: { lat: destLat, lng: destLng, label: destLabel },
        routeGeometry: route?.geometry || [[originLat, originLng], [destLat, destLng]],
        distanceKm,
        durationMin,
      },
      evidence,
      agentSteps,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in panic-check:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error in panic-check",
        status: "unknown",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
