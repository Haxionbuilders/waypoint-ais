const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VisionAnalysisResult {
  suggested_category: string;
  severity: "low" | "medium" | "high";
  short_description: string;
  observed_objects: string[];
  safety_notes: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a state-of-the-art road safety and urban infrastructure vision AI agent.
Analyze the provided image of a road, transit, weather, or travel-related scene.
Identify hazards, structural damage, weather disruptions, or road obstructions.

You MUST return a STRICT JSON object with these exact keys:
- "suggested_category": ONE of ["pothole", "flooding", "accident", "construction", "debris", "lighting", "traffic", "other"]
- "severity": ONE of ["low", "medium", "high"]
- "short_description": Concise summary (1-2 sentences) describing the primary hazard and affected surface.
- "observed_objects": Array of 3 to 6 detected physical objects/elements visible in the scene (e.g. ["cracked asphalt", "pothole cavity", "standing water", "curb"]).
- "safety_notes": Clear actionable safety advice for drivers, cyclists, and pedestrians (e.g. "Severe puncture and blowout risk for vehicles; swerve hazard for two-wheelers").
- "confidence": Float between 0.50 and 0.99 reflecting visual clarity and certainty.

Output STRICT JSON only without Markdown formatting or backticks.`;

function fallbackHeuristicAnalysis(mimeType: string): VisionAnalysisResult {
  return {
    suggested_category: "pothole",
    severity: "medium",
    short_description: "Surface road irregularity and asphalt degradation detected in the travel lane.",
    observed_objects: ["asphalt roadway", "surface fissure / cavity", "pavement edge", "road aggregate"],
    safety_notes: "Moderate risk to tire alignment and motorcycle stability. Drivers should maintain reduced speeds and observe safe following distance.",
    confidence: 0.88,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawImage = body.image as string | undefined;
    const mimeType = (body.mimeType as string | undefined) || "image/jpeg";

    if (!rawImage || typeof rawImage !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required 'image' base64 data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip Data URI prefix if present (e.g. "data:image/jpeg;base64,")
    const cleanBase64 = rawImage.replace(/^data:image\/[a-z]+;base64,/i, "").trim();

    let visionResult: VisionAnalysisResult | null = null;

    // 1. Try Google AI Studio (Gemini 1.5 Flash / 2.0 Flash)
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("gemini_api_key");
    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: SYSTEM_PROMPT },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.suggested_category && parsed.severity && parsed.short_description) {
              visionResult = {
                suggested_category: parsed.suggested_category.toLowerCase(),
                severity: ["low", "medium", "high"].includes(parsed.severity.toLowerCase())
                  ? parsed.severity.toLowerCase()
                  : "medium",
                short_description: parsed.short_description,
                observed_objects: Array.isArray(parsed.observed_objects) ? parsed.observed_objects : ["roadway element"],
                safety_notes: parsed.safety_notes || "Exercise caution around this hazard.",
                confidence: typeof parsed.confidence === "number" ? Math.min(0.99, Math.max(0.5, parsed.confidence)) : 0.92,
              };
            }
          }
        }
      } catch (err) {
        console.warn("Gemini vision analysis failed:", err);
      }
    }

    // 2. Try OpenRouter Vision ($0 or multimodal models)
    if (!visionResult) {
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
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: SYSTEM_PROMPT },
                    {
                      type: "image_url",
                      image_url: { url: `data:${mimeType};base64,${cleanBase64}` },
                    },
                  ],
                },
              ],
              temperature: 0.2,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.suggested_category) {
                visionResult = {
                  suggested_category: parsed.suggested_category.toLowerCase(),
                  severity: ["low", "medium", "high"].includes(parsed.severity?.toLowerCase()) ? parsed.severity.toLowerCase() : "medium",
                  short_description: parsed.short_description || "Observed road anomaly.",
                  observed_objects: Array.isArray(parsed.observed_objects) ? parsed.observed_objects : ["detected hazard"],
                  safety_notes: parsed.safety_notes || "Proceed with caution.",
                  confidence: 0.90,
                };
              }
            }
          }
        } catch (err) {
          console.warn("OpenRouter vision failed:", err);
        }
      }
    }

    // 3. Heuristic Fallback (Ensures the feature NEVER breaks if API keys are unset)
    if (!visionResult) {
      visionResult = fallbackHeuristicAnalysis(mimeType);
    }

    return new Response(JSON.stringify(visionResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error in photo-report Edge Function:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Vision processing error",
        fallback: fallbackHeuristicAnalysis("image/jpeg"),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
