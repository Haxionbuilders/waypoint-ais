import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type AgentAction =
  | { type: "weather"; location: string; lat?: number; lng?: number }
  | { type: "geocode"; query: string }
  | { type: "search_reports"; query: string }
  | { type: "summarize_inbox" }
  | { type: "create_report"; title: string; place: string; category: string; severity: string }
  | { type: "connect_email" }
  | { type: "book_ticket"; origin: string; destination: string; travel_mode: string; departure_date: string; traveler_count: number }
  | { type: "investigate_journey"; origin: string; destination: string; travel_mode: string; departure_time: string }
  | { type: "save_journey"; origin: string; destination: string; travel_mode: string; departure_time: string }
  | { type: "list_journeys" }
  | { type: "enable_watch"; journey_id: string }
  | { type: "disable_watch"; journey_id: string }
  | { type: "list_reports_near"; lat: number; lng: number; radius_km: number }
  | { type: "chat"; text: string };

type ChatMessage = { role: "user" | "assistant"; content: string };

type ToolActivity = { tool: string; label: string; status: "success" | "error" | "unavailable"; detail: string };

function classifyIntent(input: string): AgentAction {
  const lower = input.toLowerCase().trim();
  if (lower.includes("monitor") || lower.includes("save journey") || lower.includes("save trip") || lower.includes("track journey")) {
    const route = input.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:on|for|tomorrow|today|at)\s+|$)/i);
    return { type: "save_journey", origin: route?.[1]?.trim() || "", destination: route?.[2]?.trim() || "", travel_mode: "driving", departure_time: lower.includes("tomorrow") ? "tomorrow" : lower.includes("today") ? "today" : "" };
  }
  if (lower.includes("enable watch") || lower.includes("start monitoring") || lower.includes("start watch")) {
    return { type: "enable_watch", journey_id: "" };
  }
  if (lower.includes("disable watch") || lower.includes("stop monitoring") || lower.includes("stop watch")) {
    return { type: "disable_watch", journey_id: "" };
  }
  if (lower.includes("my journeys") || lower.includes("saved journeys") || lower.includes("saved trips") || lower.includes("journey list")) {
    return { type: "list_journeys" };
  }
  if (lower.includes("investigate") || lower.includes("check road") || lower.includes("check route") || lower.includes("check journey") || lower.includes("road risk") || lower.includes("plan a journey") || lower.includes("plan a trip")) {
    const route = input.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:on|for|tomorrow|today|at)\s+|$)/i);
    const mode = lower.includes("walk") ? "walking" : lower.includes("bike") || lower.includes("cycl") ? "cycling" : "driving";
    return { type: "investigate_journey", origin: route?.[1]?.trim() || "", destination: route?.[2]?.trim() || "", travel_mode: mode, departure_time: lower.includes("tomorrow") ? "tomorrow" : "" };
  }
  if (lower.includes("report a") || lower.includes("submit a") || lower.includes("log a") || lower.includes("add a report") || lower.includes("new hazard") || lower.includes("report a pothole") || lower.includes("report a flood")) {
    const titleMatch = input.match(/(?:report a|submit a|log a|add a report|new hazard)\s+(.+)/i);
    const title = titleMatch ? titleMatch[1].trim() : "New hazard report";
    const category = lower.includes("pothole") ? "pothole" : lower.includes("flood") ? "flooding" : lower.includes("tree") ? "fallen_tree" : lower.includes("debris") ? "debris" : lower.includes("closure") ? "closure" : lower.includes("accident") ? "accident" : "other";
    return { type: "create_report", title, place: "", category, severity: "moderate" };
  }
  if (lower.includes("connect") && lower.includes("email")) return { type: "connect_email" };
  if (lower.includes("book") || lower.includes("order") || lower.includes("reserve") || lower.includes("ticket")) {
    const route = input.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:on|for)\s+|$)/i);
    const dateMatch = input.match(/(?:on|for)\s+([a-z0-9 ,/-]+)/i);
    const travelerMatch = input.match(/(\d+)\s*(?:traveler|passenger|person)/i);
    const mode = lower.includes("bus") ? "bus" : lower.includes("flight") || lower.includes("plane") ? "flight" : lower.includes("ferry") ? "ferry" : "train";
    const departure = dateMatch ? new Date(dateMatch[1].trim()) : new Date(Date.now() + 86400000 * 7);
    return { type: "book_ticket", origin: route?.[1]?.trim() || "", destination: route?.[2]?.trim() || "", travel_mode: mode, departure_date: Number.isNaN(departure.getTime()) ? new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10) : departure.toISOString().slice(0, 10), traveler_count: Math.min(9, Math.max(1, Number(travelerMatch?.[1] || 1))) };
  }
  if (lower.includes("weather") || lower.includes("rain") || lower.includes("temperature") || lower.includes("forecast") || lower.includes("snow") || lower.includes("wind")) {
    const locMatch = lower.match(/(?:in|at|for|near)\s+([a-z\s,]+)/);
    return { type: "weather", location: locMatch ? locMatch[1].trim() : "current location" };
  }
  if (lower.includes("where is") || lower.includes("find") || lower.includes("locate") || lower.includes("address of") || lower.includes("map of")) {
    const q = lower.replace(/(?:where is|find|locate|address of|map of)\s*/, "").trim() || "New York";
    return { type: "geocode", query: q };
  }
  if (lower.includes("report") || lower.includes("hazard") || lower.includes("road") || lower.includes("signal") || lower.includes("accident") || lower.includes("flood")) {
    return { type: "search_reports", query: lower.replace(/(?:show|find|search|list|get)\s*(?:me\s*)?(?:all\s*)?(?:road\s*)?reports?\s*(?:about|for|near)?\s*/, "").trim() };
  }
  if (lower.includes("inbox") || lower.includes("email") || lower.includes("message") || lower.includes("summar") || lower.includes("travel mail")) {
    return { type: "summarize_inbox" };
  }
  return { type: "chat", text: input };
}

function weatherCodeText(code: number): string {
  const map: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain", 71: "Slight snow", 73: "Moderate snow",
    75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
    82: "Violent showers", 85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
  };
  return map[code] || "Unknown conditions";
}

async function getWeather(lat: number, lng: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
  return await res.json();
}

async function geocode(query: string): Promise<{ lat: number; lng: number; label: string; country?: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;
    const r = data.results[0];
    return { lat: r.latitude, lng: r.longitude, label: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}`, country: r.country };
  } catch { return null; }
}

async function getRoute(originLat: number, originLng: number, destLat: number, destLng: number, profile: string): Promise<{ distance: number; duration: number; geometry: [number, number][] } | null> {
  const profileMap: Record<string, string> = { driving: "driving", walking: "foot", cycling: "bike" };
  const p = profileMap[profile] || "driving";
  const url = `https://router.project-osrm.org/route/v1/${p}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    const route = data.routes[0];
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
    };
  } catch { return null; }
}

async function findReportsNear(supabase: ReturnType<typeof createClient>, lat: number, lng: number, radiusKm: number) {
  try {
    const { data, error } = await supabase.rpc("find_reports_within_radius", { center_lat: lat, center_lng: lng, radius_km: radiusKm });
    if (!error && data) return data as Record<string, unknown>[];
  } catch {}
  try {
    const { data: fallback } = await supabase.from("reports").select("id, title, description, category, severity, status, location_name, latitude, longitude, created_at").order("created_at", { ascending: false }).limit(10);
    return (fallback || []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json() as { messages?: ChatMessage[]; action?: AgentAction; user_lat?: number; user_lng?: number; conversation_id?: string };
    const messages = body.messages || [];
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const action = body.action || (lastUserMsg ? classifyIntent(lastUserMsg.content) : { type: "chat", text: "" } as AgentAction);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token && token.length > 20) {
        try {
          const { data: userData } = await supabase.auth.getUser(token);
          callerUserId = userData?.user?.id || null;
        } catch {}
      }
    }

    let response = "";
    let card_type: string | null = null;
    let card_data: Record<string, unknown> = {};
    const tools: ToolActivity[] = [];

    if (action.type === "investigate_journey") {
      if (!action.origin || !action.destination) {
        response = "Tell me the route to investigate. Try: **Check road risks from Kochi to Munnar tomorrow**.";
      } else {
        const originGeo = await geocode(action.origin);
        const destGeo = await geocode(action.destination);
        if (!originGeo || !destGeo) {
          tools.push({ tool: "geocode_location", label: `Resolving "${action.origin}" and "${action.destination}"`, status: "error", detail: "Could not resolve one or both locations" });
          response = `I couldn't resolve one of the locations. Please check the spelling of **${action.origin}** and **${action.destination}**.`;
          card_type = "tool_activity";
          card_data = { tools };
        } else {
          tools.push({ tool: "geocode_location", label: `Resolved ${originGeo.label} → ${destGeo.label}`, status: "success", detail: `${originGeo.lat.toFixed(3)}, ${originGeo.lng.toFixed(3)} → ${destGeo.lat.toFixed(3)}, ${destGeo.lng.toFixed(3)}` });

          const weather = await getWeather(destGeo.lat, destGeo.lng);
          tools.push({ tool: "get_weather", label: `Weather at ${destGeo.label}`, status: "success", detail: `${weatherCodeText(weather.current.weather_code)}, ${Math.round(weather.current.temperature_2m)}°C` });

          const route = await getRoute(originGeo.lat, originGeo.lng, destGeo.lat, destGeo.lng, action.travel_mode);
          if (route) {
            tools.push({ tool: "get_route_options", label: `Route via OSRM (${action.travel_mode})`, status: "success", detail: `${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min` });
          } else {
            tools.push({ tool: "get_route_options", label: `Route via OSRM (${action.travel_mode})`, status: "unavailable", detail: "Routing service unavailable for this profile or region" });
          }

          const nearbyReports = await findReportsNear(supabase, destGeo.lat, destGeo.lng, 25);
          tools.push({ tool: "search_road_reports", label: `Road reports within 25 km of destination`, status: "success", detail: `${nearbyReports.length} report${nearbyReports.length === 1 ? "" : "s"} found` });

          const reportSummary = nearbyReports.length > 0
            ? nearbyReports.slice(0, 5).map((r: Record<string, unknown>) => `• ${(r.title as string) || "Untitled"} — ${r.category as string || "other"} (${r.severity as string || "unknown"})`).join("\n")
            : "No road reports found near your destination.";
          const routeText = route ? `The ${action.travel_mode} route is approximately **${(route.distance / 1000).toFixed(1)} km** and takes about **${Math.round(route.duration / 60)} minutes**.` : "Route data was unavailable from the routing provider.";

          response = `**Journey investigation: ${originGeo.label} → ${destGeo.label}**\n\n${routeText}\n\n**Weather at destination:** ${weatherCodeText(weather.current.weather_code)}, ${Math.round(weather.current.temperature_2m)}°C (feels ${Math.round(weather.current.apparent_temperature ?? weather.current.temperature_2m)}°C).\n\n**Road reports near destination:**\n${reportSummary}\n\nWould you like me to **save this journey** and enable monitoring? I'll watch for new road reports and weather changes.`;
          card_type = "journey_investigation";
          card_data = {
            tools,
            origin: originGeo, destination: destGeo,
            route: route ? { distance: route.distance, duration: route.duration, geometry: route.geometry } : null,
            weather: {
              condition: weatherCodeText(weather.current.weather_code),
              temp: weather.current.temperature_2m,
              feels_like: weather.current.apparent_temperature ?? weather.current.temperature_2m,
              humidity: weather.current.relative_humidity_2m,
              wind: weather.current.wind_speed_10m,
            },
            reports: nearbyReports.slice(0, 10),
          };
        }
      }
    } else if (action.type === "save_journey") {
      if (!action.origin || !action.destination) {
        response = "Tell me the route to save. Try: **Save my journey from Kochi to Munnar**.";
      } else {
        const originGeo = await geocode(action.origin);
        const destGeo = await geocode(action.destination);
        if (!originGeo || !destGeo) {
          response = `I couldn't resolve one of the locations. Please check the spelling.`;
        } else {
          const route = await getRoute(originGeo.lat, originGeo.lng, destGeo.lat, destGeo.lng, action.travel_mode);
          const departureAt = action.departure_time === "tomorrow" ? new Date(Date.now() + 86400000).toISOString() : action.departure_time === "today" ? new Date().toISOString() : new Date(Date.now() + 86400000).toISOString();
          const { data: journey, error } = await supabase.from("journeys").insert({
            user_id: callerUserId,
            origin: originGeo.label, destination: destGeo.label,
            origin_lat: originGeo.lat, origin_lng: originGeo.lng,
            dest_lat: destGeo.lat, dest_lng: destGeo.lng,
            travel_mode: action.travel_mode, departure_at: departureAt,
            route_data: route ? { distance: route.distance, duration: route.duration, geometry: route.geometry } : null,
          }).select("id, origin, destination, travel_mode, departure_at").single();
          if (error || !journey) throw error || new Error("Could not save journey");
          response = `**Journey saved.** ${originGeo.label} → ${destGeo.label} (${action.travel_mode}). Would you like me to **enable monitoring** for this journey? I'll check for new road reports and weather changes periodically.`;
          card_type = "journey_saved";
          card_data = { journey };
        }
      }
    } else if (action.type === "list_journeys") {
      const { data: journeys, error } = await supabase.from("journeys").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      if (journeys && journeys.length > 0) {
        response = `**Saved journeys (${journeys.length}):**\n` + journeys.map((j: Record<string, unknown>) => `• ${j.origin} → ${j.destination} (${j.travel_mode})`).join("\n");
        card_type = "journey_list";
        card_data = { journeys };
      } else {
        response = "You have no saved journeys yet. Tell me about a trip and I'll save it for monitoring.";
      }
    } else if (action.type === "enable_watch") {
      const { data: latestJourney } = await supabase.from("journeys").select("id, origin, destination").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!latestJourney) {
        response = "You need to save a journey first before enabling monitoring.";
      } else {
        const { data: existing } = await supabase.from("journey_watches").select("id").eq("journey_id", latestJourney.id).maybeSingle();
        if (existing) {
          await supabase.from("journey_watches").update({ enabled: true, next_check_at: new Date(Date.now() + 3600000).toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("journey_watches").insert({ journey_id: latestJourney.id, enabled: true, next_check_at: new Date(Date.now() + 3600000).toISOString() });
        }
        response = `**Monitoring enabled** for ${latestJourney.origin} → ${latestJourney.destination}. I'll check periodically for new road reports and weather warnings near your route. You can stop monitoring anytime.`;
        card_type = "watch_enabled";
        card_data = { journey: latestJourney };
      }
    } else if (action.type === "disable_watch") {
      const { data: latestWatch } = await supabase.from("journey_watches").select("id, journey_id").eq("enabled", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!latestWatch) {
        response = "There are no active journey watches to disable.";
      } else {
        await supabase.from("journey_watches").update({ enabled: false }).eq("id", latestWatch.id);
        response = "**Monitoring stopped.** Your journey watch has been disabled.";
      }
    } else if (action.type === "weather") {
      let lat = action.lat ?? body.user_lat ?? 40.7128;
      let lng = action.lng ?? body.user_lng ?? -74.006;
      let label = action.location;
      if (action.location && action.location !== "current location") {
        const geo = await geocode(action.location);
        if (geo) { lat = geo.lat; lng = geo.lng; label = geo.label; }
      } else { label = "your location"; }
      const weather = await getWeather(lat, lng);
      const c = weather.current;
      response = `**Weather in ${label}** — ${weatherCodeText(c.weather_code)}, ${Math.round(c.temperature_2m)}°C. Humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h.`;
      const d = weather.daily;
      card_type = "weather";
      card_data = {
        location: label, lat, lng,
        current: { temp: c.temperature_2m, humidity: c.relative_humidity_2m, code: c.weather_code, condition: weatherCodeText(c.weather_code), wind: c.wind_speed_10m, feels_like: c.apparent_temperature ?? c.temperature_2m },
        forecast: d.weather_code.map((code: number, i: number) => ({ date: d.time[i], condition: weatherCodeText(code), code, high: d.temperature_2m_max[i], low: d.temperature_2m_min[i], rain_chance: d.precipitation_probability_max[i] })),
      };
    } else if (action.type === "geocode") {
      const geo = await geocode(action.query);
      if (geo) {
        response = `**${geo.label}** is located at ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}${geo.country ? `, ${geo.country}` : ""}.`;
        card_type = "geocode";
        card_data = { ...geo };
      } else {
        response = `I couldn't find a place called "${action.query}". Try a more specific name.`;
      }
    } else if (action.type === "search_reports") {
      let query = supabase.from("reports").select("id, title, description, category, severity, status, location_name, latitude, longitude, created_at").order("created_at", { ascending: false }).limit(10);
      if (action.query) query = query.or(`title.ilike.%${action.query}%,location_name.ilike.%${action.query}%,category.ilike.%${action.query}%`);
      const { data: reports, error } = await query;
      if (error) throw error;
      if (reports && reports.length > 0) {
        const levelFor = (s: string) => s === "severe" ? "High" : s === "moderate" ? "Medium" : "Low";
        response = `**Found ${reports.length} road report${reports.length > 1 ? "s" : ""}**${action.query ? ` matching "${action.query}"` : ""}:\n` + reports.map((r: { title: string; location_name: string; severity: string; category: string }) => `• ${r.title} — ${r.location_name || "Unspecified"} (${levelFor(r.severity)})`).join("\n");
        card_type = "reports";
        card_data = { reports: reports.map((r: Record<string, unknown>) => ({ ...r, level: (r.severity === "severe" ? "High" : r.severity === "moderate" ? "Medium" : "Low") as string })) };
      } else {
        response = `No road reports found${action.query ? ` matching "${action.query}"` : ""}. Want me to log a new one?`;
      }
    } else if (action.type === "create_report") {
      const categoryLabels: Record<string, string> = { pothole: "Pothole", flooding: "Flooding", fallen_tree: "Fallen tree", debris: "Debris", closure: "Road closure", accident: "Accident", other: "Other" };
      const severityLabels: Record<string, string> = { low: "Low", moderate: "Moderate", severe: "Severe" };
      const { data: report, error } = await supabase.from("reports").insert({ title: action.title, location_name: action.place || "Unspecified location", category: action.category, severity: action.severity, status: "Submitted" }).select("id, title, category, severity, status, location_name, created_at").single();
      if (error) throw error;
      response = `**Report submitted.** "${report.title}" has been logged${report.location_name !== "Unspecified location" ? ` at ${report.location_name}` : ""} as a **${categoryLabels[action.category] || action.category}** with **${severityLabels[action.severity] || action.severity}** severity.\n\nReport ID: ${report.id}\nStatus: ${report.status}\n\nYou can check the status anytime by asking "What's the status of my report?"`;
      card_type = "report_created";
      card_data = { report };
    } else if (action.type === "book_ticket") {
      if (!action.origin || !action.destination) {
        response = "Tell me the route and I'll order it through TravBud. Try: **Book a train from Boston to New York on Friday**.";
      } else {
        const confirmationCode = `TB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const fareCents = action.travel_mode === "flight" ? 12900 : action.travel_mode === "bus" ? 4200 : action.travel_mode === "ferry" ? 3500 : 6800;
        const { data: order, error } = await supabase.from("ticket_orders").insert({ user_id: callerUserId, origin: action.origin, destination: action.destination, travel_mode: action.travel_mode, departure_date: action.departure_date, traveler_count: action.traveler_count, fare_cents: fareCents, currency: "USD", status: "confirmed", confirmation_code: confirmationCode }).select("origin, destination, travel_mode, departure_date, traveler_count, fare_cents, currency, confirmation_code").maybeSingle();
        if (error || !order) throw error || new Error("Ticket order could not be created");
        response = `**TravBud ticket confirmed.** Your ${action.travel_mode} from ${order.origin} to ${order.destination} is reserved for ${order.departure_date}. Confirmation **${order.confirmation_code}**.`;
        card_type = "ticket_order";
        card_data = { order };
      }
    } else if (action.type === "connect_email") {
      const { data: existing } = await supabase.from("email_messages").select("id").limit(1);
      if (existing && existing.length > 0) {
        response = "Your email is already connected. I can see your travel messages in the inbox.";
      } else {
        const { error } = await supabase.from("email_messages").insert([
          { sender: "reservations@grandhotel.example", subject: "Booking confirmation — Grand Hotel, 3 nights", body: "Your reservation #GH-88423 is confirmed for check-in Nov 3, check-out Nov 6. Check-in 3:00 PM, check-out 11:00 AM. Address: 200 Harbor Ave.", category: "hotel", is_demo: true },
          { sender: "noreply@railbooker.example", subject: "Your train itinerary — TR-4517", body: "Train TR-4517 departs Central Station at 8:15 AM on Nov 3, arrives Lake City at 11:50 AM. Coach 4, Seat 22.", category: "transit", is_demo: true },
          { sender: "alerts@railbooker.example", subject: "Schedule change notice for TR-4517", body: "Due to track maintenance, train TR-4517 on Nov 3 departs at 9:05 AM, arriving Lake City at 12:40 PM.", category: "change", is_demo: true },
        ]);
        if (error) throw error;
        response = "**Email connected.** I've synced 3 travel messages — a hotel booking, a train itinerary, and a schedule change. Ask me to summarize your inbox to see the highlights.";
      }
    } else if (action.type === "summarize_inbox") {
      const { data: emails, error } = await supabase.from("email_messages").select("sender, subject, body, category, received_at").order("received_at", { ascending: false }).limit(10);
      if (error) throw error;
      if (emails && emails.length > 0) {
        response = `**Travel inbox — ${emails.length} message${emails.length > 1 ? "s" : ""}:**\n` + emails.map((e: { sender: string; subject: string; category: string; body: string }) => `• **${e.subject}** from ${e.sender.split("@")[0]} — ${e.category.toUpperCase()}`).join("\n");
        card_type = "inbox";
        card_data = { emails: emails.map((e: { id?: string; sender: string; subject: string; body: string; category: string; received_at: string }) => ({ sender: e.sender.split("@")[0].split(".").pop() || e.sender, subject: e.subject, preview: e.body.slice(0, 120), category: e.category, received_at: e.received_at })) };
      } else {
        response = "Your travel inbox is empty. Say \"connect my email\" and I'll sync your travel messages.";
      }
    } else {
      const userText = lastUserMsg?.content?.trim() || "";
      const lower = userText.toLowerCase();
      const priorAssistant = [...messages].reverse().find(m => m.role === "assistant")?.content || "";
      const routeContext = messages.some(m => m.role === "assistant" && m.content.toLowerCase().includes("journey investigation"));
      if (!userText || /^(hello|hi|hey|good morning|good evening)\b/i.test(userText)) {
        response = "I’m here and ready. Tell me where you’re going, what you’ve noticed on the road, or what you want to keep an eye on. I’ll check the available evidence and be clear about what I can’t verify.";
      } else if (lower.includes("what can you do") || lower.includes("who are you") || lower.includes("your name")) {
        response = "I’m **WAYPOINT AI** — a road-safety agent that investigates journeys, checks weather and reports, helps structure incident reports, and watches saved trips when you ask me to. I don’t label a road safe just because no report was found.\n\nStart with a place or journey, such as: **Check road risks from Kochi to Munnar tomorrow**.";
      } else if (/^(thanks|thank you|thx)\b/i.test(userText)) {
        response = "You’re welcome. I’ll keep the distinction between confirmed information, community reports, and uncertainty clear whenever we check something together.";
      } else if (routeContext && /^(yes|yeah|okay|ok|do it|please do)\b/i.test(userText)) {
        response = "I can continue with that journey. To take the next step, tell me whether you want to **save it for monitoring** or **prepare a hazard report**. I’ll ask for confirmation before creating anything or sharing information.";
      } else if (priorAssistant && /why|explain|how sure|source|evidence/i.test(lower)) {
        response = "That’s a fair question. I can show which tools were used, when the data was retrieved, and which parts are only estimates. Tell me which finding you want me to unpack.";
      } else if (/^(can you|could you|please|i need|help me)/i.test(userText)) {
        response = `I can help with that. I read your request as: **${userText}**. Give me the location, route, or incident details involved, and I’ll choose the relevant road-safety checks instead of guessing.`;
      } else if (lastUserMsg?.content) {
        response = `I’m following you: **${userText}**. I can investigate a route, check a location’s weather, search reported hazards, or help turn an observation into a report. Which place or journey should I use?`;
      } else {
        response = "I’m ready to help with a road, journey, weather condition, or incident. Tell me what happened and where.";
      }
    }

    return new Response(JSON.stringify({ response, action: action.type, card_type, card_data, tools }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || "Unknown error", response: "I ran into an issue processing that. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
// force redeploy Wed Oct 21 12:28:54 UTC 2026
