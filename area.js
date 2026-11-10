/* YUGRIND — Area iscritti (#/area). Accesso con link via email (niente password), piano e diario salvati nell'account.
   Spenta finché config.js non ha url e chiave pubblica del progetto Supabase (regione UE).
   Privacy: la libreria Supabase sta sul NOSTRO sito (vendor/), si carica solo aprendo l'area; nessun cookie di profilazione,
   solo la sessione di accesso nel browser (strumento tecnico). Newsletter: consenso separato, facoltativo, revocabile. */
(function () {
  "use strict";
  const C = window.YG_CONFIG || {};
  // aperta: l'interruttore di Giuliano. Finché è false l'area online mostra «In arrivo»; sull'anteprima locale (127.0.0.1) si prova lo stesso.
  const LOCALE = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const ATTIVA = !!(C.supabaseUrl && C.supabaseAnonKey && (C.aperta || LOCALE));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  let sb = null, caricamento = null;
  // testo del consenso newsletter: se cambia, cambia anche NL_VERSIONE (si salva col consenso, art. 7.1 GDPR)
  const NL_VERSIONE = "nl-2026-11-10";
  const NL_TESTO = "Voglio ricevere via email «I tornei del weekend» e gli avvisi sui festival. Posso revocare quando voglio togliendo la spunta qui o dal link in ogni email.";

  function carica() {
    if (sb) return Promise.resolve(sb);
    if (caricamento) return caricamento;
    caricamento = new Promise((ok, ko) => {
      const s = document.createElement("script"); s.src = "/vendor/supabase-2.45.4.js";
      // impronta del file ufficiale npm 2.45.4 (controllata il 10/11/2026): se qualcuno lo altera, il browser non lo esegue
      s.integrity = "sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"; s.crossOrigin = "anonymous";
      s.onload = () => {
        sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
          auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, storageKey: "yg_sessione" }
        });
        ok(sb);
      };
      s.onerror = () => ko(new Error("libreria non caricata"));
      document.head.appendChild(s);
    });
    return caricamento;
  }

  // CAPTCHA anti-robot (Cloudflare Turnstile) — SPENTO finché config.js non ha turnstileSiteKey. Per accenderlo vedi SICUREZZA.md:
  // serve anche la chiave segreta nel pannello Supabase (la mette Giuliano) e il dominio challenges.cloudflare.com nella CSP di index.html.
  let captcha = null;
  function preparaCaptcha(posto) {
    if (!C.turnstileSiteKey) return Promise.resolve(null);
    return new Promise(ok => {
      const disegna = () => { captcha = null; window.turnstile.render(posto, { sitekey: C.turnstileSiteKey, language: "it", callback: t => { captcha = t; }, "expired-callback": () => { captcha = null; } }); ok(true); };
      if (window.turnstile) return disegna();
      const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = disegna; s.onerror = () => ok(false); document.head.appendChild(s);
    });
  }

  // unione senza doppioni: il piano è una lista di chiavi, il diario una lista di oggetti
  const unisci = (a, b) => { const v = new Map(); [...(a || []), ...(b || [])].forEach(x => v.set(typeof x === "string" ? x : JSON.stringify(x), x)); return [...v.values()]; };

  async function sincronizza(user) {
    const { data, error } = await sb.from("dati_utente").select("piano,diario").eq("id", user.id).maybeSingle();
    if (error) throw error;
    const piano = unisci(ls.get("yg_fav", []), data && data.piano), diario = unisci(ls.get("yg_diary", []), data && data.diario);
    const { error: e2 } = await sb.from("dati_utente").upsert({ id: user.id, piano, diario, aggiornato_il: new Date().toISOString() });
    if (e2) throw e2;
    ls.set("yg_fav", piano); ls.set("yg_diary", diario);
    return { piano: piano.length, diario: diario.length };
  }

  async function primoAccesso(user) {
    const dich = ls.get("yg_dichiarazioni", null);
    const { data } = await sb.from("profili").select("*").eq("id", user.id).maybeSingle();
    if (!data) {
      await sb.from("profili").insert({ id: user.id, maggiorenne_dichiarato_il: dich && dich.at, privacy_letta_il: dich && dich.at, privacy_versione: dich && dich.v });
    }
    ls.del("yg_dichiarazioni");
    const r = await sb.from("profili").select("*").eq("id", user.id).maybeSingle();
    return r.data;
  }

  function scarica(nome, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  }

  const box = (t, corpo) => `<section class="panel" style="padding:18px;margin:14px 0"><h2 style="margin:0 0 10px;font-size:20px">${t}</h2>${corpo}</section>`;
  const PRIVACY = `<a href="/it/privacy/" target="_blank" rel="noopener">informativa privacy</a>`;

  async function view(app) {
    const testa = `<div class="crumbs"><a href="#/">YUGRIND</a><span>·</span>Area iscritti</div><h1>Area iscritti</h1>`;
    if (!ATTIVA) {
      app.innerHTML = testa + box("In arrivo", `<p class="meta" style="margin:0">Presto potrai salvare il tuo piano dei tornei e il diario nel tuo account e ritrovarli su ogni telefono. Per ora restano salvati solo in questo browser.</p>`);
      return;
    }
    app.innerHTML = testa + `<p class="meta">Caricamento…</p>`;
    try { await carica(); } catch (e) { app.innerHTML = testa + box("Non disponibile", `<p class="meta">L'area non si è caricata. Riprova tra poco.</p>`); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + "#/area");
    if (!session) return login(app, testa);
    return account(app, testa, session.user);
  }

  function login(app, testa) {
    app.innerHTML = testa + `<p class="lead">Salva il tuo piano dei tornei e il diario dei risultati nel tuo account e ritrovali su qualsiasi dispositivo. Gratis.</p>` +
      box("Entra con la tua email", `<form id="ygLogin" novalidate>
        <label class="meta" for="ygEmail">Email</label>
        <input id="ygEmail" type="email" autocomplete="email" required style="display:block;width:100%;margin:6px 0 12px;padding:12px;border-radius:12px;border:1px solid var(--line,#ccc);background:var(--panel);color:var(--text);font-size:16px">
        <label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0"><input id="ygOk" type="checkbox" required style="margin-top:4px"><span>Ho almeno 18 anni e ho letto l'${PRIVACY}.</span></label>
        <div id="ygCaptcha" style="margin:8px 0"></div>
        <button class="btn" type="submit" style="margin-top:8px">Mandami il link di accesso</button>
        <p class="meta" style="margin-top:12px">Niente password: ti mandiamo un link valido per poco tempo. Aprilo <b>su questo stesso dispositivo e browser</b>. Usiamo la tua email solo per l'accesso; la newsletter è a parte e la scegli tu dopo.</p>
        <p id="ygMsg" class="meta" role="status"></p></form>`);
    preparaCaptcha(document.getElementById("ygCaptcha"));
    document.getElementById("ygLogin").addEventListener("submit", async ev => {
      ev.preventDefault();
      const email = document.getElementById("ygEmail").value.trim(), msg = document.getElementById("ygMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "Controlla l'indirizzo email."; return; }
      if (!document.getElementById("ygOk").checked) { msg.textContent = "Spunta la casella per continuare."; return; }
      if (C.turnstileSiteKey && !captcha) { msg.textContent = "Completa il controllo anti-robot qui sopra."; return; }
      ls.set("yg_dichiarazioni", { at: new Date().toISOString(), v: C.privacyVersione || "" });
      msg.textContent = "Invio in corso…";
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/#/area", shouldCreateUser: true, ...(captcha ? { captchaToken: captcha } : {}) } });
      if (captcha && window.turnstile) { window.turnstile.reset(); captcha = null; }
      msg.textContent = error ? "Errore: " + error.message : "Fatto. Controlla la posta (anche lo spam) e apri il link da qui.";
    });
  }

  async function account(app, testa, user) {
    let prof = null, sync = null, err = "";
    try { prof = await primoAccesso(user); sync = await sincronizza(user); } catch (e) { err = e.message || String(e); }
    const nl = !!(prof && prof.newsletter);
    app.innerHTML = testa + `<p class="lead">Sei dentro come <b>${esc(user.email)}</b>.</p>` +
      box("Il tuo piano e il tuo diario", sync
        ? `<p class="meta" style="margin:0 0 10px">Salvati nel tuo account: ${sync.piano} tornei nel piano, ${sync.diario} righe nel diario. Si aggiornano ogni volta che apri questa pagina.</p>
           <a class="btn" href="#/piano">Apri il piano</a> <a class="btn ghost" href="#/diario">Apri il diario</a> <button class="btn ghost" id="ygSync" type="button">Salva adesso</button>`
        : `<p class="meta">Non riesco a sincronizzare adesso${err ? " (" + esc(err) + ")" : ""}. I tuoi dati restano in questo browser.</p>`) +
      box("Newsletter (facoltativa)", `<label style="display:flex;gap:10px;align-items:flex-start"><input id="ygNl" type="checkbox" ${nl ? "checked" : ""} style="margin-top:4px">
        <span>${esc(NL_TESTO)}</span></label>`) +
      box("I tuoi dati", `<p class="meta" style="margin:0 0 10px">Puoi scaricare una copia di tutto quello che abbiamo su di te, uscire o cancellare l'account. Dettagli nell'${PRIVACY}.</p>
        <button class="btn ghost" id="ygExport" type="button">Scarica i miei dati</button> <button class="btn ghost" id="ygOut" type="button">Esci</button>
        <button class="btn ghost" id="ygDel" type="button" style="color:#c0392b;border-color:#c0392b">Cancella il mio account</button>`);
    const q = id => document.getElementById(id);
    if (q("ygSync")) q("ygSync").onclick = async () => { try { await sincronizza(user); account(app, testa, user); } catch (e) { alert("Errore: " + e.message); } };
    q("ygNl").onchange = async ev => {
      const si = ev.target.checked, ora = new Date().toISOString();
      const { error } = await sb.from("profili").update(si ? { newsletter: true, newsletter_consenso_il: ora, newsletter_revoca_il: null, newsletter_versione: NL_VERSIONE } : { newsletter: false, newsletter_revoca_il: ora }).eq("id", user.id);
      if (error) { alert("Errore: " + error.message); ev.target.checked = !si; }
    };
    q("ygExport").onclick = async () => {
      const p = await sb.from("profili").select("*").eq("id", user.id).maybeSingle(), d = await sb.from("dati_utente").select("*").eq("id", user.id).maybeSingle();
      scarica("yugrind_miei_dati.json", { email: user.email, account_creato_il: user.created_at, ultimo_accesso: user.last_sign_in_at, profilo: p.data, dati: d.data, esportato_il: new Date().toISOString() });
    };
    q("ygOut").onclick = async () => { await sb.auth.signOut(); view(app); };
    q("ygDel").onclick = async () => {
      if (!confirm("Cancellare l'account? Email, piano, diario e consensi salvati da noi vengono eliminati e non si recuperano. Il piano e il diario restano solo in questo browser.")) return;
      const { error } = await sb.rpc("cancella_il_mio_account");
      if (error) { alert("Errore: " + error.message + ". Scrivi a info@yugrind.com e lo cancelliamo a mano."); return; }
      await sb.auth.signOut(); alert("Account cancellato."); view(app);
    };
  }

  window.YG_AREA = { view, attiva: ATTIVA };
  // ritorno dal link email (?code=...): si apre l'area per completare l'accesso
  if (ATTIVA && /[?&]code=/.test(location.search) && !location.hash.startsWith("#/area")) location.hash = "#/area";
})();
