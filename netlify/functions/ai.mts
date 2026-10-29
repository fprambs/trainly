// Función de IA: recibe pedidos de la app, verifica al usuario con Supabase
// y llama a Groq (o Gemini) con la clave guardada en Netlify (nunca llega al celular).
// Sirve en /.netlify/functions/ai (y en /api/ai por la redirección de netlify.toml).
import type { Context } from "@netlify/functions";

const CATS = ["piernas", "gluteos", "espalda", "pecho", "hombros", "brazos", "core", "cardio", "otro"];
const DAILY_LIMIT = 60; // consultas por persona por día (el plan gratis de la IA es compartido por toda la app)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const keyOf = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "_");

// Proveedor de IA: Groq si hay GROQ_API_KEY (gratis), si no Gemini.
async function llm(prompt: string, asJson: boolean): Promise<string> {
  return Netlify.env.get("GROQ_API_KEY") ? groq(prompt, asJson) : gemini(prompt, asJson);
}
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const busy = () => { const err: any = new Error("La IA está ocupada, intenta en un momento"); err.status = 429; return err; };

async function groq(prompt: string, asJson: boolean): Promise<string> {
  const key = Netlify.env.get("GROQ_API_KEY");
  const model = Netlify.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
  const body: any = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: asJson ? 0.2 : 0.5,
    max_tokens: asJson ? 2000 : 900
  };
  if (asJson) body.response_format = { type: "json_object" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (r.status === 429 || r.status === 503) { await sleep(1500 * (attempt + 1)); continue; }
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Groq ${r.status}`);
    return data?.choices?.[0]?.message?.content || "";
  }
  throw busy();
}

async function gemini(prompt: string, asJson: boolean): Promise<string> {
  const key = Netlify.env.get("GEMINI_API_KEY");
  const model = Netlify.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: asJson ? { responseMimeType: "application/json", temperature: 0.2 } : { temperature: 0.5, maxOutputTokens: 900 }
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify(body)
    });
    if (r.status === 429 || r.status === 503) { await sleep(1500 * (attempt + 1)); continue; }
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
    return (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
  }
  throw busy();
}
const parseJson = (t: string) => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } };

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);
  const SB_URL = Netlify.env.get("VITE_SUPABASE_URL") || Netlify.env.get("SUPABASE_URL");
  const SB_ANON = Netlify.env.get("VITE_SUPABASE_ANON_KEY") || Netlify.env.get("SUPABASE_ANON_KEY");
  if (!Netlify.env.get("GROQ_API_KEY") && !Netlify.env.get("GEMINI_API_KEY")) return json({ error: "Falta configurar GROQ_API_KEY en Netlify" }, 503);
  if (!SB_URL || !SB_ANON) return json({ error: "Falta configurar Supabase en Netlify" }, 503);

  // 1) ¿quién pide? (token de sesión de Supabase)
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Inicia sesión" }, 401);
  const sbHeaders = { apikey: SB_ANON, authorization: auth, "content-type": "application/json" };
  const who = await fetch(`${SB_URL}/auth/v1/user`, { headers: sbHeaders });
  if (!who.ok) return json({ error: "Sesión no válida" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const task = body.task;

  try {
    // 2) clasificar músculos: primero el caché compartido (no gasta cuota)
    if (task === "classify") {
      const names: string[] = (Array.isArray(body.names) ? body.names : []).filter((n: any) => typeof n === "string" && n.trim()).slice(0, 60).map((n: string) => n.slice(0, 100));
      if (!names.length) return json({ result: {} });
      const keys = [...new Set(names.map(keyOf))];
      const cached: Record<string, string> = {};
      const c = await fetch(`${SB_URL}/rest/v1/ai_cache?select=key,category&key=in.(${keys.map(k => `"${k}"`).join(",")})`, { headers: sbHeaders });
      if (c.ok) (await c.json()).forEach((r: any) => { cached[r.key] = r.category; });
      const missing = names.filter(n => !cached[keyOf(n)]);
      if (missing.length) {
        if (!(await take(SB_URL, sbHeaders))) return json({ error: "Llegaste al límite diario de IA" }, 429);
        const prompt = "Eres entrenador de gimnasio. Clasifica cada ejercicio en UN grupo muscular principal, de forma general. " +
          "Grupos (usa solo estas claves): piernas (cuádriceps, isquiotibiales, pantorrillas: sentadillas, prensa, zancadas, curl femoral, extensión de pierna, peso muerto), " +
          "gluteos (hip thrust, puente de glúteo, abducción, patada de glúteo), espalda (remos con peso, jalones, dominadas, pullover, lumbares), pecho (press banca, aperturas, flexiones, fondos de pecho), " +
          "hombros (press militar, elevaciones laterales, pájaros, face pull), brazos (bíceps, tríceps, antebrazo), core (abdominales, planchas, anti-rotación, rueda), " +
          "cardio (remoergómetro, bicicleta, trote, cinta, elíptica, cuerda, burpees), otro (solo movilidad o estiramientos). Evita 'otro' siempre que puedas. " +
          "Responde SOLO un objeto JSON {\"nombre exacto\": \"clave\"}. Ejercicios: " + JSON.stringify(missing);
        const out = parseJson(await llm(prompt, true)) || {};
        const put: Record<string, string> = {};
        missing.forEach(n => {
          const v = out[n] ?? Object.entries(out).find(([k]) => norm(k) === norm(n))?.[1];
          const cat = typeof v === "string" ? norm(v) : "";
          if (CATS.includes(cat)) { cached[keyOf(n)] = cat; put[keyOf(n)] = cat; }
        });
        if (Object.keys(put).length) await fetch(`${SB_URL}/rest/v1/rpc/ai_cache_put`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ items: put }) });
      }
      const result: Record<string, string> = {};
      names.forEach(n => { if (cached[keyOf(n)]) result[n] = cached[keyOf(n)]; });
      return json({ result });
    }

    if (!(await take(SB_URL, sbHeaders))) return json({ error: "Llegaste al límite diario de IA" }, 429);

    // 3) identificar un ejercicio a partir de una descripción
    if (task === "identify") {
      const desc = String(body.desc || "").slice(0, 600);
      if (!desc.trim()) return json({ error: "Falta la descripción" }, 400);
      const prompt = "Eres un entrenador de gimnasio. Identifica el ejercicio que describe la persona. Responde SOLO un objeto JSON con estas claves: " +
        '"nombre" (nombre corto y común en español de Chile, con mayúscula inicial), "en_ingles" (nombre en inglés, útil para buscar imágenes), "trabaja" (músculos principales, máximo 8 palabras), "seguro" (true si estás razonablemente seguro, false si no). ' +
        "Descripción: " + desc;
      return json({ result: parseJson(await llm(prompt, true)) });
    }

    // 4) analizar el progreso (la app envía solo números: sin notas ni nombres)
    if (task === "analyze") {
      const history = String(body.history || "").slice(0, 20000);
      const q = String(body.question || "").slice(0, 300);
      const today = String(body.today || "").slice(0, 10);
      const prompt = "Eres un entrenador personal que revisa la bitácora de entrenamiento de una persona en Chile. Responde en español de Chile, cercano y directo, en máximo 170 palabras. " +
        "Usa viñetas cortas que empiecen con '- '. Cubre: cómo viene en general, ejercicios donde progresa, dónde se estancó o bajó, y 2 o 3 sugerencias concretas para las próximas sesiones (por ejemplo cuánto subir de peso o reps). " +
        "Básate solo en los datos; si hay pocos datos, dilo. No des consejos médicos. Las flechas: ↑ hizo más que lo pedido, ↓ menos. 1RM≈ es el 1RM estimado (Epley): úsalo para juzgar la fuerza; subir peso y bajar reps no es rendir menos si el 1RM≈ sube. Usa el volumen (peso × reps) para juzgar el trabajo total. " +
        (q ? "Además responde esta pregunta: " + q + " " : "") +
        "\n\nHoy es " + today + ". Registros de las últimas 8 semanas (fecha | ejercicio | pedido | series hechas):\n" + history;
      return json({ text: await llm(prompt, false) });
    }

    return json({ error: "Tarea desconocida" }, 400);
  } catch (e: any) {
    console.error("ai error", e);
    return json({ error: e?.message || "Error de IA" }, e?.status || 500);
  }
};

async function take(SB_URL: string, headers: Record<string, string>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/ai_take`, { method: "POST", headers, body: JSON.stringify({ max_per_day: DAILY_LIMIT }) });
  if (!r.ok) return true; // si falla el contador, no bloquear
  return (await r.json()) !== false;
}
