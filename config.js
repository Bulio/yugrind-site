/* YUGRIND — impostazioni pubbliche del sito.
   supabaseUrl e supabaseAnonKey: dal progetto Supabase (Settings → API). La chiave "anon" è pubblica per costruzione
   (senza login non legge niente: lo vietano le regole in supabase/schema.sql). MAI la chiave "service_role" qui.
   Vuote, oppure aperta:false = area iscritti online «In arrivo» (in locale su 127.0.0.1 funziona per le prove). aperta:true = aperta a tutti: lo decide Giuliano. privacyVersione: la data dell'informativa in /it/privacy/. */
window.YG_CONFIG = { supabaseUrl: "https://fsttoyymtdsqesiifsvn.supabase.co", supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdHRveXltdGRzcWVzaWlmc3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNzU2NDksImV4cCI6MjEwOTc1MTY0OX0.uvvMlW4WZEYcfLcPTxBK826tDeEK5CEDqenZBdXqWZk", privacyVersione: "2026-11-09", aperta: false };
