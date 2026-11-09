/* YUGRIND — impostazioni pubbliche del sito.
   supabaseUrl e supabaseAnonKey: dal progetto Supabase (Settings → API). La chiave "anon" è pubblica per costruzione
   (senza login non legge niente: lo vietano le regole in supabase/schema.sql). MAI la chiave "service_role" qui.
   Vuote = area iscritti spenta («in arrivo»). privacyVersione: la data dell'informativa in /it/privacy/. */
window.YG_CONFIG = { supabaseUrl: "", supabaseAnonKey: "", privacyVersione: "2026-11-09" };
