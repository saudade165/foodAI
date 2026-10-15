import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const expectedCode = Deno.env.get("APP_ACCESS_CODE");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!expectedCode || !apiKey) return json({ error: "Server is not configured. Set APP_ACCESS_CODE and GEMINI_API_KEY." }, 503);
  if (req.headers.get("x-app-code") !== expectedCode) return json({ error: "Invalid access code. Check your AI settings." }, 401);

  try {
    const body = await req.json();
    const mimeType = String(body.mimeType || "");
    const data = String(body.imageBase64 || "");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(mimeType)) return json({ error: "Unsupported image format. Use JPG, PNG, or WEBP." }, 400);
    if (!data || data.length > 14_000_000) return json({ error: "Image is empty or too large. Try a smaller photo." }, 413);

    const prompt = `You are a careful nutrition-estimation assistant. Inspect this photo of a meal. Identify visible food components and estimate the edible portion in grams for each component. Return ONLY JSON matching the schema. Nutrition values must be estimated per 100 g of the prepared food (not for the whole serving). Prefer typical values for cooked food; account for visible sauces/oil where plausible, but do not claim certainty. If food or portion is ambiguous, say so in notes and use conservative estimates. Do not invent exact ingredients that cannot be seen. Use Russian language for names and notes. The sum of item calories should be broadly consistent with macros (4 kcal/g protein, 9 fat, 4 carbs), but real food databases can differ. Give a concise overall dish name.`;
    const schema = {
      type: "OBJECT", properties: {
        mealName: { type: "STRING" },
        notes: { type: "STRING" },
        items: { type: "ARRAY", items: { type: "OBJECT", properties: {
          name: { type: "STRING" }, grams: { type: "NUMBER" }, kcal100: { type: "NUMBER" },
          protein100: { type: "NUMBER" }, fat100: { type: "NUMBER" }, carbs100: { type: "NUMBER" }, confidence: { type: "STRING", enum: ["низкая", "средняя", "высокая"] }
        }, required: ["name", "grams", "kcal100", "protein100", "fat100", "carbs100", "confidence"] } }
      }, required: ["mealName", "notes", "items"]
    };
    // Google периодически отключает старые модели, поэтому пробуем несколько по очереди.
    const models = (Deno.env.get("GEMINI_MODEL") ? [Deno.env.get("GEMINI_MODEL") as string] : []).concat(["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"]);
    const reqBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 8192 }
    });
    let payload: any = null;
    let lastStatus = 502;
    let lastMessage = "Vision API request failed.";
    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: reqBody
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { payload = body; break; }
      lastStatus = response.status;
      lastMessage = body?.error?.message || lastMessage;
      if (![404, 429, 503].includes(response.status)) break;
    }
    if (!payload) return json({ error: `Gemini API: ${lastMessage}` }, lastStatus === 429 ? 429 : 502);
    const rawText = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
    const raw = rawText ? rawText.trim().replace(/^```(?:json)?\s*|\s*```$/g, "") : "";
    if (!raw) return json({ error: "AI returned no result. Try a clearer photo." }, 502);
    const result = JSON.parse(raw);
    if (!Array.isArray(result.items) || result.items.length === 0) return json({ error: "No food items were identified. Try another photo." }, 422);
    result.items = result.items.slice(0, 20).map((x: Record<string, unknown>) => ({
      name: String(x.name || "Продукт").slice(0, 100),
      grams: clamp(x.grams, 1, 2000, 100),
      kcal100: clamp(x.kcal100, 0, 1000, 0),
      protein100: clamp(x.protein100, 0, 100, 0),
      fat100: clamp(x.fat100, 0, 100, 0),
      carbs100: clamp(x.carbs100, 0, 100, 0),
      confidence: ["низкая", "средняя", "высокая"].includes(String(x.confidence)) ? x.confidence : "средняя"
    }));
    return json({ mealName: String(result.mealName || "Блюдо").slice(0, 120), notes: String(result.notes || "Оценка приблизительная.").slice(0, 500), items: result.items });
  } catch (error) {
    console.error("analyze-food error", error);
    return json({ error: "Could not analyze the photo. Check the connection and try again." }, 500);
  }
});
function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
