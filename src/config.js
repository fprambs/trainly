// Datos PÚBLICOS del proyecto Supabase (Project Settings → API).
// La anon key está hecha para ir en la app; la seguridad la dan las reglas RLS de la base.
// Nunca pongas aquí la service_role key.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
