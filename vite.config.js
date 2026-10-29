import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// VITE_MOCK=1 usa un Supabase simulado en memoria (solo para pruebas locales)
export default defineConfig(({ mode }) => ({
  resolve: process.env.VITE_MOCK ? { alias: { "@supabase/supabase-js": fileURLToPath(new URL("./test/mock-supabase.js", import.meta.url)) } } : {},
  build: { target: "es2020", sourcemap: false }
}));
