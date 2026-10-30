# Trainly

App web instalable (PWA) para anotar entrenamientos, con acceso para **profesor** y **alumno**.

- **Frontend:** Vite (JS vanilla) → `src/`, `index.html`, `public/` (manifest, service worker, íconos)
- **Datos y login:** Supabase (Auth + Postgres con RLS + Storage + Realtime) → `supabase/schema.sql`
- **IA:** Netlify Function que llama a Groq → `netlify/functions/ai.mts`
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

## Cómo está organizado el código
`src/main.js` arranca la sesión (login, perfil, modo profesor) y llama a `startApp` de `src/app.js`,
que instala cada parte de la app sobre un objeto compartido `app` (el estado común: `app.entries`, `app.rest`, …).

| Archivo | Qué hace |
|---|---|
| `src/app/core.js` | Fecha de hoy y pestañas |
| `src/app/store.js` | Datos: Supabase, cola sin conexión, banco común |
| `src/app/add-exercise.js` | Agregar ejercicio: buscador, imágenes, subidas en segundo plano |
| `src/app/today-list.js` | Hoy: dibujar la lista y reordenar arrastrando |
| `src/app/sets.js` | Series: valores, comparación con lo pedido, récords |
| `src/app/feedback.js` | Avisos, sonido y pantalla encendida |
| `src/app/rest.js` | Descanso entre series |
| `src/app/today-cards.js` | Hoy: tarjeta de sesión, barra "Te toca", tarjetas |
| `src/app/detail.js` | Detalle del ejercicio y ventana para confirmar una serie |
| `src/app/focus.js` | Modo entrenamiento |
| `src/app/days.js` | Navegar entre días: flechas, deslizar, calendario |
| `src/app/summary.js` | Resumen de la sesión para compartir |
| `src/app/routines.js` | Rutinas |
| `src/app/history.js` | Historial: racha, calendario, días |
| `src/app/progress.js` | Progreso: gráfico por ejercicio |
| `src/app/catalog.js` | Ejercicios: músculos, clasificación con IA, grilla, ficha, banco común |
| `src/app/extras.js` | Respaldo CSV, IA, accesos directos, notificaciones del descanso |
| `src/lib/*.js` | Utilidades sin estado: formatos, sesiones, gestos, gráficos, imagen del resumen, CSV |
| `src/theme.js`, `src/layers.js`, `src/media.js` | Apariencia, botón Atrás/foco de ventanas, compresión de videos |

Regla simple: lo que usa una sola pantalla queda como variable local de su archivo;
lo que comparten varias va en `app`. El orden de instalación en `src/app.js` importa.

## Pruebas
```bash
npm test        # revisión del código (ESLint) + 76 pruebas en celular, celular chico, tablet y tablet horizontal
npm run lint    # solo la revisión del código
```
Las pruebas usan un Supabase simulado (`test/mock-supabase.js`), no tocan datos reales,
y corren solas en GitHub con cada cambio (`.github/workflows/pruebas.yml`).
El respaldo semanal de la base está en `.github/workflows/backup.yml`.

## Commits
En inglés y con [Conventional Commits](https://www.conventionalcommits.org/):
`feat:` funcionalidad nueva · `fix:` arreglo · `refactor:` reorganizar sin cambiar comportamiento ·
`style:` diseño o formato · `test:` pruebas · `docs:` documentación · `ci:` GitHub Actions · `chore:` mantenimiento · `perf:` rendimiento.
Opcionalmente con el área entre paréntesis, por ejemplo `fix(calendar): keep swipe inside the card`.
