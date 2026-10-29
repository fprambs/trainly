# Trainly · Bitácora de Entreno

App web instalable (PWA) para anotar entrenamientos, con acceso para **profesor** y **alumno**.

- **Frontend:** Vite (JS vanilla) → `src/`, `index.html`, `public/` (manifest, service worker, íconos)
- **Datos y login:** Supabase (Auth + Postgres con RLS + Storage + Realtime) → `supabase/schema.sql`
- **IA:** Netlify Function que llama a Groq (o Gemini como alternativa) → `netlify/functions/ai.mts`
- **Hosting:** Netlify (plan gratis), deploy automático al hacer push a `main`

## Desarrollo local
```bash
cp .env.example .env   # y completa los valores
npm install
npm run dev
```
Probar sin Supabase (datos simulados en el navegador): `VITE_MOCK=1 npm run dev`

## Variables en Netlify
| Variable | Qué es |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (pública) |
| `VITE_SUPABASE_ANON_KEY` | anon key (pública, protegida por RLS) |
| `GROQ_API_KEY` | clave de Groq (**secreta**, solo en Netlify) |
| `GROQ_MODEL` | opcional, por defecto `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | opcional: se usa solo si no hay `GROQ_API_KEY` |
