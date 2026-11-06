/* YUGRIND — prototipo. Nessuna dipendenza: dati in data.js (window.PLE_DATA). */
(() => {
  const DATA = window.PLE_DATA || { festivals: [] };
  const FEST = DATA.festivals;
  const DAY_HOURS = 12;            // durata ipotizzata di un Day 1 quando non è pubblicata
  const $app = document.getElementById("app");

  /* ---------- utilità ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;
  const COUNTRY = { IT: "Italia", AT: "Austria", SI: "Slovenia", CZ: "Rep. Ceca", SK: "Slovacchia", MT: "Malta", CY: "Cipro", GB: "Regno Unito", IE: "Irlanda", FR: "Francia", ES: "Spagna", NL: "Paesi Bassi", BE: "Belgio", DE: "Germania", CH: "Svizzera", HR: "Croazia", PT: "Portogallo", MC: "Monaco", PL: "Polonia", HU: "Ungheria" };
  const flag = cc => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : "";
  const eur = n => n == null ? null : "€" + Number(n).toLocaleString("it-IT");
  const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const fmtDate = d => { const [y, m, g] = d.split("-").map(Number); return `${g} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
  const fmtRange = (a, b) => a === b ? fmtDate(a) : `${fmtDate(a).replace(/ \d{4}$/, a.slice(0, 4) === b.slice(0, 4) ? "" : " " + a.slice(0, 4))} – ${fmtDate(b)}`;
  const pad = n => String(n).padStart(2, "0");
  const dur = ms => { ms = Math.max(0, ms); if (ms >= 864e5) { const g = Math.floor(ms / 864e5); return `${g} g ${Math.floor(ms % 864e5 / 3.6e6)} h`; } const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4), s = Math.floor(ms % 6e4 / 1e3); return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
  const durWords = ms => { const h = Math.floor(ms / 3.6e6), m = Math.round(ms % 3.6e6 / 6e4); return h ? `${h} h ${m} min` : `${m} min`; };

  /* ---------- tempo (con "ora simulata" per le prove) ---------- */
  let demoNow = null;
  try { demoNow = sessionStorage.getItem("yg_demo") || null; } catch (e) { }
  const qs = new URLSearchParams(location.search).get("now"); if (qs) demoNow = qs;
  const now = () => demoNow ? new Date(demoNow).getTime() + (Date.now() - bootReal) : Date.now();
  const bootReal = Date.now();

  // "2026-11-26T14:00" nel fuso del casinò -> millisecondi UTC
  function tzOffset(tz, utcMs) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(utcMs).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
  }
  function zonedToUtc(local, tz) {
    const [d, t = "00:00"] = local.split("T"); const [y, m, g] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, g, hh, mm);
    let utc = guess - tzOffset(tz, guess);
    return guess - tzOffset(tz, utc);
  }
  const todayIn = tz => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now());
  const localTime = (ms, tz) => new Intl.DateTimeFormat("it-IT", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);

  /* ---------- stato festival / flight ---------- */
  function festStatus(f) {
    const t = todayIn(f.timezone);
    if (t < f.start_date) { const days = Math.round((Date.parse(f.start_date) - Date.parse(t)) / 864e5); return { k: "soon", label: days === 1 ? "domani" : `tra ${days} giorni`, days }; }
    if (t > f.end_date) return { k: "past", label: "concluso" };
    return { k: "live", label: "in corso" };
  }
  function lateRegLevels(e) {
    const s = (e.late_reg || "").toLowerCase();
    let m = s.match(/(\d+)\s*(livell|level|lvl)/) || s.match(/(livello|level)\s*(\d+)/);
    if (m) return Number(m[1].match(/\d/) ? m[1] : m[2]);
    return null;
  }
  function lateRegHours(e) {
    const m = (e.late_reg || "").toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(ore|hours|hrs|h)\b/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }
  // stima dello stato di un Day: livello e tempo dal calendario pubblicato, senza pause
  function flightState(f, e, fl) {
    if (!fl.start) return { k: "notime" };
    const t0 = zonedToUtc(fl.start, f.timezone), t = now(), el = t - t0;
    const lm = e.level_minutes ? e.level_minutes * 6e4 : null;
    let lrEnd = null;
    const lrl = lateRegLevels(e), lrh = lateRegHours(e);
    const lrt = (e.late_reg || "").match(/\b(\d{1,2}):(\d{2})\b/);
    if (lrl && lm) lrEnd = t0 + lrl * lm; else if (lrh) lrEnd = t0 + lrh * 3.6e6;
    else if (lrt) { // orario di chiusura scritto (es. "closes 20:45"): stesso giorno, o il giorno dopo se passa la mezzanotte
      lrEnd = zonedToUtc(`${fl.start.slice(0, 10)}T${lrt[1].padStart(2, "0")}:${lrt[2]}`, f.timezone);
      if (lrEnd < t0) lrEnd += 864e5;
    }
    const base = { t0, lm, lrEnd, lrl };
    if (el < 0) return { ...base, k: "soon", startsIn: -el };
    if (el > (e.weekly_hours || DAY_HOURS) * 3.6e6) return { ...base, k: "done" };
    const out = { ...base, k: "live", elapsed: el };
    if (lm) { out.level = Math.floor(el / lm) + 1; out.left = lm - (el % lm); }
    return out;
  }
  function allFlights() {
    const out = [];
    FEST.forEach(f => f.events.forEach((e, ei) => e.flights.forEach((fl, i) => out.push({ f, e, ei, fl, i, st: flightState(f, e, fl) }))));
    return out;
  }

  /* ---------- sale e tornei settimanali ---------- */
  const VEN = DATA.venues || [];
  const DAYK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAYIT = { mon: "lunedì", tue: "martedì", wed: "mercoledì", thu: "giovedì", fri: "venerdì", sat: "sabato", sun: "domenica" };
  const weekdayIn = (tz, ms) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(ms).toLowerCase().slice(0, 3);
  VEN.forEach(v => v.weekly.forEach(w => w.weekly_hours = 8)); // un torneo serale dura di solito meno di un Day 1 da festival
  const asFest = v => ({ id: v.id, timezone: v.timezone, venue: v.venue, city: v.city, country: v.country, festival: v.venue });
  // il torneo settimanale di oggi (nel fuso della sala), se oggi è uno dei suoi giorni
  function todayWeekly() {
    const out = [];
    VEN.forEach(v => {
      if (v.status === "closed") return;
      const wd = weekdayIn(v.timezone, now()), d = todayIn(v.timezone);
      v.weekly.forEach((w, wi) => {
        if (!w.days.includes(wd)) return;
        const fl = w.time ? { label: DAYIT[wd], start: `${d}T${w.time}` } : { label: DAYIT[wd], date: d };
        out.push({ v, w, wi, fl, st: flightState(asFest(v), w, fl) });
      });
    });
    return out.sort((a, b) => (a.w.time || "99") < (b.w.time || "99") ? -1 : 1);
  }
  function weeklyCard({ v, w, wi, st }) {
    const b = st.k === "live" ? `<span class="badge live">● in corso</span><span class="badge est">stima</span>` : st.k === "soon" ? `<span class="badge soon">alle ${esc(w.time)}</span>` : st.k === "done" ? `<span class="badge">finito</span>` : `<span class="badge">orario n.d.</span>`;
    const lv = st.k === "live" && st.level ? `<div>Livello ${st.level} · ${dur(st.left)} al cambio</div>` : "";
    return `<a class="card" href="#/w/${v.id}/${wi}"><div class="row">${b}</div>
      <h3>${esc(w.name)}</h3>
      <div class="meta"><span class="flag">${flag(v.country)}</span> ${esc(v.venue)} · ${esc(v.city)}</div>
      ${lv}<div>${eur(w.buy_in_eur) ? `<span class="money">${eur(w.buy_in_eur)}</span>` : "buy-in n.d."}${w.guarantee_eur ? ` · ${eur(w.guarantee_eur)} GTD` : ""}${w.game ? ` · ${esc(w.game)}` : ""}</div></a>`;
  }

  /* ---------- segnalazioni dal tavolo (demo: salvate solo in questo browser) ---------- */
  const repKey = (f, ei, i) => `yg_rep_${f.id}_${ei}_${i}`;
  const getRep = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const setRep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  /* ---------- pezzi di interfaccia ---------- */
  const badge = s => `<span class="badge ${s.k === "live" ? "live" : s.k === "soon" ? "soon" : ""}">${s.k === "live" ? "● " : ""}${esc(s.label)}</span>`;
  const confBadge = c => c === "high" ? `<span class="badge">fonte verificata</span>` : c === "low" ? `<span class="badge low">da verificare</span>` : "";
  function mainEvent(f) { return f.events.find(e => e.is_main) || f.events[0]; }
  function festCard(f) {
    const me = mainEvent(f), s = festStatus(f);
    const bi = me && eur(me.buy_in_eur), gt = me && eur(me.guarantee_eur);
    return `<a class="card" href="#/f/${f.id}">
      <div class="row">${badge(s)} ${confBadge(f.confidence)}</div>
      <h3>${esc(f.festival)}</h3>
      <div class="meta"><span class="flag">${flag(f.country)}</span> ${esc(f.city)} · ${esc(f.venue || "")}</div>
      <div class="meta">${fmtRange(f.start_date, f.end_date)}</div>
      ${me ? `<div>${esc(me.name)}: ${bi ? `<span class="money">${bi}</span>` : "buy-in n.d."}${gt ? ` · ${gt} GTD` : ""}</div>` : `<div class="meta">programma non ancora pubblicato</div>`}
    </a>`;
  }
  function liveLine(x) {
    const { f, e, ei, fl, i, st } = x;
    const lv = st.level ? `Livello ${st.level} · ${dur(st.left)} al cambio` : `iniziato da ${durWords(st.elapsed)}`;
    const lr = st.lrEnd ? (now() < st.lrEnd ? `late reg chiude tra ${durWords(st.lrEnd - now())}` : "late reg chiusa") : "late reg n.d.";
    return `<a class="card" href="#/t/${f.id}/${ei}/${i}">
      <div class="row"><span class="badge live">● live</span><span class="badge est">stima</span></div>
      <h3>${esc(e.name)} — ${esc(fl.label)}</h3>
      <div class="meta"><span class="flag">${flag(f.country)}</span> ${esc(f.festival)} · ${esc(f.city)}</div>
      <div>${lv}</div><div class="meta">${lr}</div></a>`;
  }

  /* ---------- pagine ---------- */
  const state = { q: "", cc: "", month: "", maxbi: "" };
  function viewHome() {
    const flights = allFlights(), liveF = flights.filter(x => x.st.k === "live");
    const countries = [...new Set(FEST.map(f => f.country))].sort();
    const months = [...new Set(FEST.map(f => f.start_date.slice(0, 7)))].sort();
    const shown = FEST.filter(f => {
      if (state.q && !`${f.festival} ${f.city} ${f.venue} ${f.tour}`.toLowerCase().includes(state.q.toLowerCase())) return false;
      if (state.cc && f.country !== state.cc) return false;
      if (state.month && !(f.start_date.slice(0, 7) <= state.month && f.end_date.slice(0, 7) >= state.month)) return false;
      if (state.maxbi) { const me = mainEvent(f); if (!me || me.buy_in_eur == null || me.buy_in_eur > +state.maxbi) return false; }
      return festStatus(f).k !== "past";
    });
    const live = shown.filter(f => festStatus(f).k === "live"), next = shown.filter(f => festStatus(f).k === "soon");
    const byMonth = {}; next.forEach(f => (byMonth[f.start_date.slice(0, 7)] ||= []).push(f));
    $app.innerHTML = `
      <section class="hero">
        <h1>Tutti i tornei di poker live in Europa. Adesso.</h1>
        <p class="sub">Cosa si gioca in questo momento, cosa parte oggi e cosa arriva nei prossimi mesi, con clock, late reg e tutto quello che serve per il viaggio.</p>
        <div class="stats">
          <div><b>${liveF.length}</b>Day in corso ora</div>
          <div><b>${FEST.filter(f => festStatus(f).k === "live").length}</b>festival in corso</div>
          <div><b>${FEST.filter(f => festStatus(f).k !== "past").length}</b>festival in calendario</div>
          <div><b>${countries.length}</b>paesi</div>
        </div>
      </section>
      ${(() => { const tw = todayWeekly().filter(x => x.st.k !== "done"); return tw.length ? `<h2>🃏 Oggi nelle sale</h2><div class="grid">${tw.slice(0, 6).map(weeklyCard).join("")}</div><p><a href="#/oggi">Tutti i tornei di oggi (${tw.length}) →</a></p>` : ""; })()}
      ${liveF.length ? `<h2>🔴 Festival: si gioca adesso</h2><div class="grid">${liveF.slice(0, 6).map(liveLine).join("")}</div>${liveF.length > 6 ? `<p><a href="#/live">Vedi tutti i ${liveF.length} Day in corso →</a></p>` : ""}` : ""}
      <div class="filters">
        <input id="q" placeholder="Cerca festival, città, casinò…" value="${esc(state.q)}">
        <select id="cc"><option value="">Tutti i paesi</option>${countries.map(c => `<option value="${c}" ${state.cc === c ? "selected" : ""}>${flag(c)} ${COUNTRY[c] || c}</option>`).join("")}</select>
        <select id="month"><option value="">Tutti i mesi</option>${months.map(m => `<option value="${m}" ${state.month === m ? "selected" : ""}>${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}</option>`).join("")}</select>
        <select id="maxbi"><option value="">Qualsiasi buy-in</option>${[300, 600, 1100, 2500, 5500].map(v => `<option value="${v}" ${+state.maxbi === v ? "selected" : ""}>Main fino a €${v.toLocaleString("it-IT")}</option>`).join("")}</select>
      </div>
      ${live.length ? `<h2>Festival in corso</h2><div class="grid">${live.map(festCard).join("")}</div>` : ""}
      ${Object.keys(byMonth).sort().map(m => `<h2>${MONTHS[+m.slice(5) - 1][0].toUpperCase() + MONTHS[+m.slice(5) - 1].slice(1)} ${m.slice(0, 4)}</h2><div class="grid">${byMonth[m].map(festCard).join("")}</div>`).join("")}
      ${!live.length && !next.length ? `<div class="empty">Nessun festival con questi filtri.</div>` : ""}`;
    const bind = (id, k) => document.getElementById(id).addEventListener(id === "q" ? "input" : "change", ev => { state[k] = ev.target.value; const pos = ev.target.selectionStart; viewHome(); if (id === "q") { const el = document.getElementById("q"); el.focus(); el.setSelectionRange(pos, pos); } });
    bind("q", "q"); bind("cc", "cc"); bind("month", "month"); bind("maxbi", "maxbi");
  }

  function viewLive() {
    const fl = allFlights(), live = fl.filter(x => x.st.k === "live");
    const soon = fl.filter(x => x.st.k === "soon" && x.st.startsIn < 24 * 3.6e6).sort((a, b) => a.st.startsIn - b.st.startsIn);
    const festLive = FEST.filter(f => festStatus(f).k === "live");
    $app.innerHTML = `<h1>In corso adesso</h1>
      <p class="sub">Livello e tempi sono <b>stimati</b> dall'orario di inizio e dalla durata dei livelli pubblicati (pause escluse). Quando una sala usa il clock YUGRIND o un giocatore manda una foto del tabellone, il dato diventa <b>in diretta</b>.</p>
      ${live.length ? `<div class="grid">${live.map(liveLine).join("")}</div>` : `<div class="empty">Nessun Day con orario pubblicato è in corso in questo momento.</div>`}
      <h2>Partono nelle prossime 24 ore</h2>
      ${soon.length ? `<div class="grid">${soon.map(({ f, e, ei, fl, i, st }) => `<a class="card" href="#/t/${f.id}/${ei}/${i}"><div class="row"><span class="badge soon">tra ${durWords(st.startsIn)}</span></div><h3>${esc(e.name)} — ${esc(fl.label)}</h3><div class="meta">${flag(f.country)} ${esc(f.festival)} · ${localTime(st.t0, f.timezone)} ora locale</div></a>`).join("")}</div>` : `<div class="empty">Nessuna partenza nelle prossime 24 ore.</div>`}
      <h2>Festival in corso (tutti gli eventi)</h2>
      ${festLive.length ? `<div class="grid">${festLive.map(festCard).join("")}</div>` : `<div class="empty">Nessun festival in corso oggi.</div>`}`;
  }

  function travelGuide(f) {
    const place = `${f.venue || ""} ${f.city}`.trim();
    const dated = !!(f.start_date && f.end_date);
    const nights = dated ? Math.max(1, Math.round((Date.parse(f.end_date) - Date.parse(f.start_date)) / 864e5)) : 2;
    const when = dated ? f.start_date : todayIn(f.timezone);
    const L = [
      ["🏨", "Hotel vicino al casinò", `https://www.booking.com/searchresults.html?ss=${enc(place)}${dated ? `&checkin=${f.start_date}&checkout=${f.end_date}` : ""}`, dated ? "Booking · date del festival già impostate" : "Booking"],
      ["✈️", "Voli", `https://www.google.com/travel/flights?q=${enc("voli per " + f.city)}`, "Google Voli"],
      ["🧭", "Come arrivare", `https://www.google.com/maps/dir/?api=1&destination=${enc(place)}`, "Percorso fino al casinò"],
      ["🍝", "Ristoranti vicini", `https://www.google.com/maps/search/${enc("ristoranti vicino " + place)}`, "Google Maps, con recensioni"],
      ["🍸", "Bar e locali", `https://www.google.com/maps/search/${enc("bar cocktail vicino " + place)}`, "Per il dopo-torneo"],
      ["🎟️", "Cosa fare in città", `https://www.getyourguide.com/s/?q=${enc(f.city)}`, "Tour ed esperienze"],
      ["📅", "Eventi in quei giorni", `https://www.google.com/search?q=${enc(`eventi ${f.city} ${MONTHS[+when.slice(5, 7) - 1]} ${when.slice(0, 4)}`)}`, "Concerti, partite, mercatini"],
      ["🚗", "Auto a noleggio", `https://www.google.com/search?q=${enc("noleggio auto " + f.city)}`, "Comodo per Rozvadov, Nova Gorica, Campione"],
    ];
    const me = f.events ? mainEvent(f) : null;
    return `<div class="panel"><h3>🧳 Guida del viaggio — ${esc(f.city)}</h3>
      <p class="meta">Per ora sono collegamenti di ricerca. Nella fase 2 arrivano le schede curate (migliori ristoranti, bar, hotel convenzionati) scritte dall'AI e verificate.</p>
      <div class="guide">${L.map(([i, t, u, s]) => `<a href="${u}" target="_blank" rel="noopener sponsored">${i} <b>${t}</b><small>${s}</small></a>`).join("")}</div></div>
      <div class="panel"><h3>💶 Quanto mi costa il viaggio?</h3>
      <p class="meta">Inserisci i tuoi numeri: il totale si aggiorna da solo.</p>
      <div class="budget" id="budget">
        <div><label>Buy-in (€)</label><input type="number" min="0" data-k="bi" value="${me && me.buy_in_eur != null ? me.buy_in_eur : ""}"></div>
        <div><label>Re-entry previsti</label><input type="number" min="0" data-k="re" value="0"></div>
        <div><label>Notti</label><input type="number" min="0" data-k="n" value="${nights}"></div>
        <div><label>Hotel €/notte</label><input type="number" min="0" data-k="h" placeholder="es. 80"></div>
        <div><label>Viaggio A/R (€)</label><input type="number" min="0" data-k="v" placeholder="es. 150"></div>
        <div><label>Pasti e extra €/giorno</label><input type="number" min="0" data-k="p" placeholder="es. 50"></div>
      </div><div class="total">Totale: <b class="money" id="tot">—</b></div></div>`;
  }
  function bindBudget() {
    const box = document.getElementById("budget"); if (!box) return;
    const calc = () => { const v = {}; box.querySelectorAll("input").forEach(i => v[i.dataset.k] = +i.value || 0); const t = v.bi * (1 + v.re) + v.n * v.h + v.v + (v.n + 1) * v.p; document.getElementById("tot").textContent = t ? eur(Math.round(t)) : "—"; };
    box.addEventListener("input", calc); calc();
  }

  function viewFestival(id) {
    const f = FEST.find(x => x.id === id); if (!f) return notFound();
    const s = festStatus(f);
    const rows = f.events.map((e, ei) => `<tr>
      <td><b>${esc(e.name)}</b>${e.is_main ? ` <span class="badge soon">Main</span>` : ""}</td>
      <td class="money" data-l="Buy-in">${eur(e.buy_in_eur) || "n.d."}</td><td data-l="Garantito">${eur(e.guarantee_eur) || "n.d."}</td>
      <td data-l="Livelli">${e.level_minutes ? e.level_minutes + " min" : "n.d."}</td><td data-l="Stack">${e.starting_stack ? Number(e.starting_stack).toLocaleString("it-IT") : "n.d."}</td>
      <td data-l="Day">${e.flights.length ? e.flights.map((fl, i) => { const st = flightState(f, e, fl); return `<a href="#/t/${f.id}/${ei}/${i}">${esc(fl.label)}</a> <span class="meta">${fl.start ? localTime(zonedToUtc(fl.start, f.timezone), f.timezone) : fmtDate(fl.date) + " (orario n.d.)"}</span>${st.k === "live" ? ` <span class="badge live">● live</span>` : ""}`; }).join("<br>") : `<span class="meta">non pubblicati</span>`}</td></tr>`).join("");
    $app.innerHTML = `<div class="crumbs"><a href="#/">Calendario</a> › ${esc(COUNTRY[f.country] || f.country)} › ${esc(f.city)}</div>
      <div class="row">${badge(s)} ${confBadge(f.confidence)} ${f.tour ? `<span class="badge">${esc(f.tour)}</span>` : ""}</div>
      <h1>${esc(f.festival)}</h1>
      <p class="sub"><span class="flag">${flag(f.country)}</span> ${esc(f.venue || "")}, ${esc(f.city)} · ${fmtRange(f.start_date, f.end_date)}${f.website ? ` · <a href="${esc(f.website)}" target="_blank" rel="noopener">sito ufficiale</a>` : ""}</p>
      <div class="cols"><div>
        <h2 style="margin-top:0">Eventi</h2>
        ${f.events.length ? `<div class="tablewrap"><table><thead><tr><th>Evento</th><th>Buy-in</th><th>Garantito</th><th>Livelli</th><th>Stack</th><th>Day / orari locali</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Programma non ancora pubblicato dall'organizzatore.</div>`}
        ${f.notes ? `<p class="meta">ℹ️ ${esc(f.notes)}</p>` : ""}
        <h2>Organizza il viaggio</h2>${travelGuide(f)}
      </div><aside>
        <div class="panel ai"><h3>Assistente YUGRIND</h3><p class="meta">In arrivo: «Ho 1.500 €, parto da Milano: quali Day mi conviene giocare qui?» · lettura della struttura dal PDF · riassunto di ogni Day.</p></div>
        <div class="panel"><h3>Fonti</h3><div class="sources">${(f.source_urls || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</a>`).join("")}</div>
        <p class="meta">Un dato è sbagliato? <a href="mailto:?subject=${enc("YUGRIND – correzione " + f.festival)}">Segnalacelo</a>.</p></div>
      </aside></div>`;
    bindBudget();
  }

  let timer = null;
  function viewTournament(fid, ei, i) {
    const f = FEST.find(x => x.id === fid), e = f && f.events[+ei], fl = e && e.flights[+i];
    if (!fl) return notFound();
    renderTournament({
      f, e, fl, k: repKey(f, ei, i), title: `${e.name} — ${fl.label}`,
      crumbs: `<a href="#/">Calendario</a> › <a href="#/f/${f.id}">${esc(f.festival)}</a>`,
      others: `<div class="panel"><h3>Altri Day di questo evento</h3>${e.flights.map((x, j) => `<div><a href="#/t/${f.id}/${ei}/${j}">${esc(x.label)}</a> <span class="meta">${x.start ? localTime(zonedToUtc(x.start, f.timezone), f.timezone) : fmtDate(x.date)}</span>${+j === +i ? " ← qui" : ""}</div>`).join("")}</div>`,
      guide: `#/f/${f.id}`, guideLabel: "guida del festival",
    });
  }
  function renderTournament(c) {
    const { f, e, fl, k } = c;
    const draw = () => {
      const st = flightState(f, e, fl), rep = getRep(k);
      let clock;
      if (st.k === "notime") clock = `<div class="lvl">Orario non pubblicato</div><div class="time">—</div><div class="note">Giorno: ${fmtDate(fl.date)}. Appena l'organizzatore pubblica l'orario, il clock parte da solo.</div>`;
      else if (st.k === "soon") clock = `<div class="lvl">Inizia tra</div><div class="time">${dur(st.startsIn)}</div><div class="blinds">${localTime(st.t0, f.timezone)} ora locale</div>`;
      else if (st.k === "done") clock = `<div class="lvl">Day concluso</div><div class="time">—</div><div class="note">Iniziato ${localTime(st.t0, f.timezone)} ora locale.</div>`;
      else clock = st.level
        ? `<div class="lvl">Livello ${st.level} · stima</div><div class="time">${dur(st.left)}</div><div class="blinds">Blind: struttura non ancora caricata</div><div class="note">Stima da orario d'inizio + livelli da ${e.level_minutes} min. Le pause non sono incluse: il torneo reale può essere indietro di qualche livello.</div>`
        : `<div class="lvl">In corso · stima</div><div class="time">${dur(st.elapsed)}</div><div class="note">Tempo trascorso dall'inizio. Durata dei livelli non pubblicata.</div>`;
      const lr = st.lrEnd ? (now() < st.lrEnd ? `chiude tra <b>${durWords(st.lrEnd - now())}</b> (${localTime(st.lrEnd, f.timezone)})` : `chiusa alle ${localTime(st.lrEnd, f.timezone)}`) : (e.late_reg ? esc(e.late_reg) : "n.d.");
      document.getElementById("clock").innerHTML = clock;
      document.getElementById("kpis").innerHTML = `
        <div class="kpi"><span>Buy-in</span><b class="money">${eur(e.buy_in_eur) || "n.d."}</b></div>
        <div class="kpi"><span>Garantito</span><b>${eur(e.guarantee_eur) || "n.d."}</b></div>
        <div class="kpi"><span>Stack iniziale</span><b>${e.starting_stack ? Number(e.starting_stack).toLocaleString("it-IT") : "n.d."}</b></div>
        <div class="kpi"><span>Late registration</span><i>${lr}</i></div>
        <div class="kpi"><span>Entries</span><b>${rep && rep.entries ? rep.entries : "—"}</b>${rep && rep.entries ? `<i> segnalato</i>` : ""}</div>
        <div class="kpi"><span>Giocatori rimasti</span><b>${rep && rep.left ? rep.left : "—"}</b>${rep && rep.left ? `<i> segnalato</i>` : ""}</div>
        <div class="kpi"><span>Stack medio</span><b>${rep && rep.entries && rep.left && e.starting_stack ? Math.round(rep.entries * e.starting_stack / rep.left).toLocaleString("it-IT") : "—"}</b></div>`;
      document.getElementById("repinfo").innerHTML = rep ? `Ultima segnalazione: livello ${esc(rep.level || "?")}, ${esc(rep.entries || "?")} entries, ${esc(rep.left || "?")} rimasti — ${new Date(rep.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} (non verificata, salvata solo in questo browser nella demo)` : "Nessuna segnalazione ancora. Sei in sala? Aiuta gli altri giocatori.";
    };
    $app.innerHTML = `<div class="crumbs">${c.crumbs}</div>
      <h1>${esc(c.title)}</h1>
      <p class="sub"><span class="flag">${flag(f.country)}</span> ${esc(f.venue || "")}, ${esc(f.city)}${e.structure_url ? ` · <a href="${esc(e.structure_url)}" target="_blank" rel="noopener">struttura ufficiale (PDF)</a>` : ""}</p>
      <div class="cols"><div>
        <div class="clock" id="clock"></div>
        <div class="kpis" id="kpis"></div>
        <div class="panel" style="margin-top:14px"><h3>📸 Sei al tavolo? Aggiorna il torneo</h3>
          <p class="meta" id="repinfo"></p>
          <form class="report" id="rep">
            <input name="level" inputmode="numeric" placeholder="Livello">
            <input name="entries" inputmode="numeric" placeholder="Entries">
            <input name="left" inputmode="numeric" placeholder="Rimasti">
            <button class="btn" type="submit">Invia</button>
          </form>
          <p class="meta">In arrivo: scatta una foto allo schermo della sala e l'AI legge livello, blind, entries e rimasti al posto tuo.</p>
        </div>
      </div><aside>
        <div class="panel ai"><h3>Mi conviene entrare adesso?</h3><p class="meta">Con la struttura caricata, YUGRIND calcola con quanti big blind entri adesso, quanto late reg resta e quanto "gioco" ha davvero il torneo. ${e.structure_url ? "Struttura trovata: in elaborazione." : "Manca la struttura di questo evento: caricane il PDF o una foto e la leggiamo noi."}</p></div>
        ${c.others}
        <div class="panel"><h3>🧳 Sei in viaggio?</h3><p class="meta">Hotel, ristoranti, bar e cosa fare a ${esc(f.city)}: <a href="${c.guide}">${c.guideLabel} →</a></p></div>
      </aside></div>`;
    document.getElementById("rep").addEventListener("submit", ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      Object.keys(d).forEach(x => d[x] = String(d[x]).replace(/\D/g, ""));
      if (!d.level && !d.entries && !d.left) return;
      setRep(k, { ...d, at: Date.now() }); ev.target.reset(); draw();
    });
    draw(); timer = setInterval(draw, 1000);
  }

  function viewToday() {
    const t = todayWeekly(), live = t.filter(x => x.st.k === "live"), later = t.filter(x => x.st.k === "soon" || x.st.k === "notime"), done = t.filter(x => x.st.k === "done");
    $app.innerHTML = `<h1>Oggi nelle sale</h1>
      <p class="sub">I tornei settimanali di oggi nei casinò europei, con l'orario della sala. Il livello è una <b>stima</b> da orario e durata dei livelli.</p>
      <h2>In corso</h2>${live.length ? `<div class="grid">${live.map(weeklyCard).join("")}</div>` : `<div class="empty">Nessun torneo settimanale in corso adesso.</div>`}
      <h2>Più tardi</h2>${later.length ? `<div class="grid">${later.map(weeklyCard).join("")}</div>` : `<div class="empty">Nessun altro torneo oggi.</div>`}
      ${done.length ? `<h2>Già finiti</h2><div class="grid">${done.map(weeklyCard).join("")}</div>` : ""}
      <p class="meta">Per ora conosciamo il programma settimanale di ${VEN.filter(v => v.weekly.length).length} sale. <a href="#/sale">Tutte le sale →</a></p>`;
  }
  function viewVenues() {
    const by = {}; VEN.forEach(v => (by[v.country] ||= []).push(v));
    $app.innerHTML = `<h1>Sale da poker in Europa</h1>
      <p class="sub">Casinò e circoli con tornei o cash game. Ogni sala ha la sua fonte; le sale chiuse sono segnalate.</p>
      ${Object.keys(by).sort((a, b) => (COUNTRY[a] || a).localeCompare(COUNTRY[b] || b)).map(cc => `<h2>${flag(cc)} ${COUNTRY[cc] || cc}</h2><div class="grid">${by[cc].map(v => `<a class="card" href="#/v/${v.id}">
        <div class="row">${v.status === "closed" ? `<span class="badge live" style="animation:none">chiusa</span>` : v.weekly.length ? `<span class="badge">${v.weekly.length} tornei settimanali</span>` : `<span class="badge">programma non pubblicato</span>`} ${confBadge(v.confidence)}</div>
        <h3>${esc(v.venue)}</h3><div class="meta">${esc(v.city)}</div>
        ${v.cash_games ? `<div class="meta">Cash: ${esc(v.cash_games)}</div>` : ""}</a>`).join("")}</div>`).join("")}`;
  }
  function viewVenue(id) {
    const v = VEN.find(x => x.id === id); if (!v) return notFound();
    const wd = weekdayIn(v.timezone, now());
    const rows = DAYK.map(d => { const ws = v.weekly.map((w, wi) => [w, wi]).filter(([w]) => w.days.includes(d)); return ws.length ? `<tr${d === wd ? ' style="background:#1d2a25"' : ""}><td><b>${DAYIT[d]}</b>${d === wd ? ` <span class="badge soon">oggi</span>` : ""}</td><td>${ws.map(([w, wi]) => `${w.time ? esc(w.time) : "orario n.d."} · <a href="#/w/${v.id}/${wi}">${esc(w.name)}</a> · ${eur(w.buy_in_eur) || "buy-in n.d."}${w.starting_stack ? ` · stack ${Number(w.starting_stack).toLocaleString("it-IT")}` : ""}${w.level_minutes ? ` · livelli ${w.level_minutes}'` : ""}${w.late_reg ? ` · late reg: ${esc(w.late_reg)}` : ""}`).join("<br>")}</td></tr>` : ""; }).join("");
    $app.innerHTML = `<div class="crumbs"><a href="#/sale">Sale</a> › ${esc(COUNTRY[v.country] || v.country)} › ${esc(v.city)}</div>
      <div class="row">${v.status === "closed" ? `<span class="badge live" style="animation:none">sala chiusa</span>` : ""} ${confBadge(v.confidence)}</div>
      <h1>${esc(v.venue)}</h1>
      <p class="sub"><span class="flag">${flag(v.country)}</span> ${esc(v.city)}${v.poker_page ? ` · <a href="${esc(v.poker_page)}" target="_blank" rel="noopener">pagina poker ufficiale</a>` : ""}${v.website ? ` · <a href="${esc(v.website)}" target="_blank" rel="noopener">sito</a>` : ""}</p>
      ${v.status === "closed" ? `<div class="panel" style="border-color:var(--red)"><h3>⚠️ Attenzione</h3><p>${esc(v.status_note)}</p></div>` : ""}
      <div class="cols"><div>
        <h2 style="margin-top:0">Tornei settimanali</h2>
        ${rows ? `<div class="tablewrap"><table><tbody>${rows}</tbody></table></div>` : `<div class="empty">La sala non pubblica un programma settimanale online. ${v.poker_page ? `Controlla la <a href="${esc(v.poker_page)}" target="_blank" rel="noopener">pagina ufficiale</a>.` : ""}</div>`}
        ${v.cash_games ? `<h2>Cash game</h2><div class="panel">${esc(v.cash_games)}</div>` : ""}
        ${v.notes ? `<p class="meta">ℹ️ ${esc(v.notes)}</p>` : ""}
        ${FEST.some(f => f.venue && v.venue && f.city === v.city) ? `<h2>Festival in questa città</h2><div class="grid">${FEST.filter(f => f.city === v.city && festStatus(f).k !== "past").map(festCard).join("")}</div>` : ""}
        <h2>Organizza il viaggio</h2>${travelGuide(asFest(v))}
      </div><aside>
        <div class="panel"><h3>Fonti</h3><div class="sources">${(v.source_urls || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</a>`).join("")}</div>
        <p class="meta">Lavori in questa sala? Il clock YUGRIND è gratuito e porta i tuoi tornei in diretta qui.</p></div>
      </aside></div>`;
    bindBudget();
  }
  function viewWeekly(vid, wi) {
    const v = VEN.find(x => x.id === vid), w = v && v.weekly[+wi]; if (!w) return notFound();
    // prossima occorrenza: oggi se è uno dei suoi giorni, altrimenti il primo giorno utile
    let fl = null;
    for (let d = 0; d < 7 && !fl; d++) {
      const ms = now() + d * 864e5, wd = weekdayIn(v.timezone, ms);
      if (w.days.includes(wd)) { const ds = new Intl.DateTimeFormat("en-CA", { timeZone: v.timezone }).format(ms); fl = w.time ? { label: DAYIT[wd], start: `${ds}T${w.time}` } : { label: DAYIT[wd], date: ds }; }
    }
    renderTournament({
      f: asFest(v), e: w, fl, k: `yg_rep_w_${v.id}_${wi}_${fl.start || fl.date}`, title: `${w.name} — ${fl.label}`,
      crumbs: `<a href="#/sale">Sale</a> › <a href="#/v/${v.id}">${esc(v.venue)}</a>`,
      others: `<div class="panel"><h3>Si gioca ogni</h3><p>${w.days.map(d => DAYIT[d]).join(", ")}${w.time ? ` alle ${esc(w.time)}` : ""}</p>${w.reentry ? `<p class="meta">Re-entry: ${esc(w.reentry)}</p>` : ""}</div>`,
      guide: `#/v/${v.id}`, guideLabel: "pagina della sala",
    });
  }

  function viewInfo() {
    $app.innerHTML = `<h1>Come funziona YUGRIND</h1>
      <div class="panel"><h3>Da dove vengono i dati</h3><ul class="clean">
        <li><b>Calendario:</b> programmi pubblicati da organizzatori, casinò e media. Ogni festival mostra le sue fonti, con l'etichetta «fonte verificata» o «da verificare».</li>
        <li><b>Clock stimato:</b> calcolato dall'orario d'inizio e dalla durata dei livelli. È segnato sempre come <i>stima</i>.</li>
        <li><b>Dati in diretta:</b> arrivano dalle sale che usano il clock YUGRIND (gratuito) e dalle segnalazioni dei giocatori in sala.</li>
        <li><b>Mai numeri inventati:</b> se un dato manca scriviamo «n.d.».</li></ul></div>
      <div class="panel"><h3>In arrivo</h3><ul class="clean">
        <li>Foto del tabellone → livello, blind, entries e rimasti letti dall'AI</li>
        <li>Strutture lette dai PDF e «mi conviene entrare adesso?»</li>
        <li>Avvisi su Telegram: «late reg chiude tra 30 minuti»</li>
        <li>Guide curate di ogni città del poker: hotel, ristoranti, bar, eventi</li>
        <li>Pianificatore di viaggio AI per budget e date</li></ul></div>`;
  }
  function notFound() { $app.innerHTML = `<div class="empty">Pagina non trovata. <a href="#/">Torna al calendario</a></div>`; }

  /* ---------- router ---------- */
  function route() {
    clearInterval(timer);
    const h = location.hash.replace(/^#\/?/, "").split("/");
    const sect = { "": "home", f: "home", t: "home", live: "live", oggi: "oggi", sale: "sale", v: "sale", w: "sale", info: "info" }[h[0]];
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === sect));
    if (!h[0]) viewHome(); else if (h[0] === "live") viewLive(); else if (h[0] === "info") viewInfo();
    else if (h[0] === "oggi") viewToday(); else if (h[0] === "sale") viewVenues(); else if (h[0] === "v") viewVenue(h[1]); else if (h[0] === "w") viewWeekly(h[1], h[2]);
    else if (h[0] === "f") viewFestival(h[1]); else if (h[0] === "t") viewTournament(h[1], h[2], h[3]); else notFound();
    const n = allFlights().filter(x => x.st.k === "live").length + todayWeekly().filter(x => x.st.k === "live").length, lc = document.getElementById("liveCount");
    lc.hidden = !n; lc.textContent = n;
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- ora simulata ---------- */
  const dn = document.getElementById("demoNow");
  if (demoNow || new URLSearchParams(location.search).has("demo")) document.getElementById("demoBox").hidden = false;
  if (demoNow) dn.value = demoNow.slice(0, 16);
  dn.addEventListener("change", () => { demoNow = dn.value || null; try { demoNow ? sessionStorage.setItem("yg_demo", demoNow) : sessionStorage.removeItem("yg_demo"); } catch (e) { } location.reload(); });
  document.getElementById("demoReset").addEventListener("click", () => { try { sessionStorage.removeItem("yg_demo"); } catch (e) { } location.href = location.pathname + location.hash; });
  document.getElementById("dataStamp").textContent = `Dati aggiornati: ${DATA.generated || "?"}`;
  route();
})();
