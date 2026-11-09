/* YUGRIND — sito statico senza librerie. Dati in data.js (window.PLE_DATA). v2: 7/11/2026 */
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
  const DATED = (DATA.dated || []).map((x, i) => ({ ...x, i, weekly_hours: 8 }));
  const VBYID = Object.fromEntries(VEN.map(v => [v.id, v]));
  // tornei datati (calendario ufficiale della sala) di un giorno, come "flight" del clock
  const datedFl = x => x.time ? { label: fmtDate(x.date), start: `${x.date}T${x.time}` } : { label: fmtDate(x.date), date: x.date };
  function todayWeekly() {
    const out = [];
    VEN.forEach(v => {
      if (v.status === "closed") return;
      const wd = weekdayIn(v.timezone, now()), d = todayIn(v.timezone);
      if (v.dated_source) { // la sala pubblica il calendario vero: si usa quello, non lo schema settimanale
        DATED.filter(x => x.venue_id === v.id && x.date === d && x.kind !== "cash").forEach(x => {
          const fl = datedFl(x); out.push({ v, w: x, wi: "d" + x.i, href: `#/d/${x.i}`, fl, st: flightState(asFest(v), x, fl) });
        });
        return;
      }
      v.weekly.forEach((w, wi) => {
        if (!w.days.includes(wd)) return;
        const fl = w.time ? { label: DAYIT[wd], start: `${d}T${w.time}` } : { label: DAYIT[wd], date: d };
        out.push({ v, w, wi, fl, st: flightState(asFest(v), w, fl) });
      });
    });
    return out.sort((a, b) => (a.w.time || "99") < (b.w.time || "99") ? -1 : 1);
  }

  /* ================== interfaccia v2 (7/11/2026) ================== */
  // icone SVG (tratto 2px, stile Lucide disegnato a mano): niente emoji come icone
  const IC = {
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sale: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M20 17v4H6.5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
    food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
    bar: '<path d="M8 22h8M12 11v11M19 3H5l7 8 7-8z"/>',
    nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 5H6.3a2 2 0 0 0-1.6.9L2 10v6c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    spark: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    spade: '<path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 7 2.6V18l-2 3h6l-2-3v-2.4A4 4 0 0 0 20 13c0-4.5-5-7-8-11z"/>',
  };
  const icon = (k, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ""}</svg>`;

  /* ---------- preferenze locali: tema, preferiti, diario ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
  const FAV = () => store.get("yg_fav", []);            // ["f:<id>", "t:<fid>|<ei>|<i>", "w:<vid>|<wi>"]
  const isFav = k => FAV().includes(k);
  function toggleFav(k) { const a = FAV(), i = a.indexOf(k); i >= 0 ? a.splice(i, 1) : a.push(k); store.set("yg_fav", a); toast(i >= 0 ? "Tolto dal tuo piano" : "Aggiunto al tuo piano"); return i < 0; }
  const starBtn = k => `<button class="star ${isFav(k) ? "on" : ""}" data-fav="${esc(k)}" aria-label="${isFav(k) ? "Togli dal piano" : "Salva nel piano"}" aria-pressed="${isFav(k)}">${icon("star")}</button>`;
  let toastT = null;
  function toast(msg) { let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
  // un clic su qualunque stella, ovunque, senza aprire la card che la contiene
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-fav]"); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const on = toggleFav(b.dataset.fav); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
  }, true);

  /* ---------- calendario: file .ics per il telefono ---------- */
  const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  function icsEvent(o) {
    return ["BEGIN:VEVENT", `UID:${o.uid}@yugrind.com`, `DTSTAMP:${icsDate(Date.now())}`,
      o.allDay ? `DTSTART;VALUE=DATE:${o.d1.replace(/-/g, "")}` : `DTSTART:${icsDate(o.t0)}`,
      o.allDay ? `DTEND;VALUE=DATE:${o.d2.replace(/-/g, "")}` : `DTEND:${icsDate(o.t1)}`,
      `SUMMARY:${o.title.replace(/[,;]/g, " ")}`, `LOCATION:${(o.loc || "").replace(/[,;]/g, " ")}`,
      `URL:${location.origin}${location.pathname}${o.hash}`, "END:VEVENT"].join("\r\n");
  }
  function downloadIcs(events, name) {
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YUGRIND//IT", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast("Calendario scaricato: aprilo per aggiungerlo");
  }
  function flightIcs(f, e, fl, hash) {
    if (fl.start) { const t0 = zonedToUtc(fl.start, f.timezone); return icsEvent({ uid: hash.replace(/\W/g, ""), t0, t1: t0 + 8 * 3.6e6, title: `${e.name} ${fl.label} – ${f.festival}`, loc: `${f.venue || ""} ${f.city}`, hash }); }
    const d = fl.date; const n = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
    return icsEvent({ uid: hash.replace(/\W/g, ""), allDay: true, d1: d, d2: n, title: `${e.name} ${fl.label} – ${f.festival}`, loc: `${f.venue || ""} ${f.city}`, hash });
  }
  const festIcs = f => icsEvent({ uid: "f" + f.id, allDay: true, d1: f.start_date, d2: new Date(Date.parse(f.end_date) + 864e5).toISOString().slice(0, 10), title: f.festival, loc: `${f.venue || ""} ${f.city}`, hash: `#/f/${f.id}` });
  async function share(title) {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copiato"); } catch (e) { toast(url); }
  }

  /* ---------- pezzi di interfaccia ---------- */
  const badge = s => `<span class="badge ${s.k === "live" ? "live" : s.k === "soon" ? "soon" : ""}">${esc(s.label)}</span>`;
  const confBadge = c => c === "high" ? `<span class="badge ok">${icon("check")}verificato</span>` : c === "low" ? `<span class="badge warn">da verificare</span>` : "";
  function mainEvent(f) { return (f.events || []).find(e => e.is_main) || (f.events || [])[0]; }
  const money = n => n == null ? `<span class="faint">n.d.</span>` : `<span class="money">${eur(n)}</span>`;
  const shortMoney = n => n == null ? null : n >= 1e6 ? `${(n / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);

  function festCard(f) {
    const me = mainEvent(f), s = festStatus(f);
    const gt = me && me.guarantee_eur ? ` · ${shortMoney(me.guarantee_eur)} GTD` : "";
    return `<a class="card" href="#/f/${f.id}">
      ${starBtn("f:" + f.id)}
      <div class="row">${badge(s)} ${confBadge(f.confidence)}</div>
      <h3 style="padding-right:36px">${esc(f.festival)}</h3>
      <div class="venue"><span>${flag(f.country)}</span><span>${esc(f.venue || "")} · ${esc(f.city)}</span></div>
      <div class="foot"><span class="meta">${icon("cal")} ${fmtRange(f.start_date, f.end_date)}</span>
        ${me && me.buy_in_eur != null ? `<span class="money">Main ${eur(me.buy_in_eur)}${gt}</span>` : `<span class="faint">programma n.d.</span>`}</div>
    </a>`;
  }
  function liveCard(x) {
    const { f, e, ei, fl, i, st } = x;
    const p = st.lm ? Math.round((1 - st.left / st.lm) * 100) : null;
    const lr = st.lrEnd ? (now() < st.lrEnd ? `Late reg chiude tra ${durWords(st.lrEnd - now())}` : "Late reg chiusa") : "Late reg n.d.";
    return `<a class="card" href="#/t/${f.id}/${ei}/${i}">
      <div class="row"><span class="badge live">in corso</span><span class="badge est">stima</span></div>
      <h3>${esc(e.name)} — ${esc(fl.label)}</h3>
      <div class="venue"><span>${flag(f.country)}</span><span>${esc(f.venue || f.festival)} · ${esc(f.city)}</span></div>
      ${st.level ? `<div class="lvl"><span>Livello ${st.level}</span><span class="time">${dur(st.left)}</span></div><div class="bar"><i style="width:${p}%"></i></div>` : `<div class="lvl"><span>In corso da</span><span class="time">${durWords(st.elapsed)}</span></div>`}
      <div class="foot"><span class="meta">${icon("clock")} ${lr}</span>${e.buy_in_eur != null ? `<span class="money">${eur(e.buy_in_eur)}</span>` : ""}</div>
    </a>`;
  }
  function weeklyRow({ v, w, wi, st, href }) {
    const cls = st.k === "live" ? "live" : st.k === "done" ? "done" : "";
    const t = w.time ? `${esc(w.time)}${st.k === "live" ? "<small>in corso</small>" : st.k === "done" ? "<small>finito</small>" : ""}` : `<small>orario<br>n.d.</small>`;
    return `<a class="li ${cls}" href="${href || `#/w/${v.id}/${wi}`}"><span class="t">${t}</span>
      <span class="n"><b>${esc(w.series ? w.series + " · " : "")}${esc(w.name)}</b><span>${flag(v.country)} ${esc(v.venue)} · ${esc(v.city)}</span></span>
      <span>${w.buy_in_eur != null ? `<span class="money">${eur(w.buy_in_eur)}</span>` : `<span class="faint">n.d.</span>`}</span></a>`;
  }

  /* ---------- HOME: adesso ---------- */
  const state = { q: "", cc: "", month: "", maxbi: "" };
  function viewHome() {
    const flights = allFlights(), liveF = flights.filter(x => x.st.k === "live");
    const tw = todayWeekly(), twOpen = tw.filter(x => x.st.k !== "done");
    const countries = [...new Set(FEST.map(f => f.country))].sort();
    const months = [...new Set(FEST.filter(f => festStatus(f).k !== "past").map(f => f.start_date.slice(0, 7)))].sort();
    const shown = FEST.filter(f => {
      if (festStatus(f).k === "past") return false;
      if (state.q && !`${f.festival} ${f.city} ${f.venue} ${f.tour}`.toLowerCase().includes(state.q.toLowerCase())) return false;
      if (state.cc && f.country !== state.cc) return false;
      if (state.month && !(f.start_date.slice(0, 7) <= state.month && f.end_date.slice(0, 7) >= state.month)) return false;
      if (state.maxbi) { const me = mainEvent(f); if (!me || me.buy_in_eur == null || me.buy_in_eur > +state.maxbi) return false; }
      return true;
    });
    const byMonth = {}; shown.forEach(f => { const k = festStatus(f).k === "live" ? "0000-live" : f.start_date.slice(0, 7); (byMonth[k] ||= []).push(f); });
    const mLabel = k => k === "0000-live" ? "In corso adesso" : `${MONTHS[+k.slice(5) - 1][0].toUpperCase()}${MONTHS[+k.slice(5) - 1].slice(1)} ${k.slice(0, 4)}`;
    $app.innerHTML = `
      <section class="panel hero">
        <span class="eyebrow">${icon("live")} ${liveF.length + tw.filter(x => x.st.k === "live").length} tornei in corso in questo momento</span>
        <h1>Ogni torneo live in Europa. <em>Adesso.</em></h1>
        <p class="lead">Festival, tornei settimanali dei casinò, clock e late reg in tempo reale. E tutto quello che serve per il viaggio.</p>
        <label class="search">${icon("search")}<span class="sr">Cerca</span><input id="q" type="search" placeholder="Cerca festival, città o casinò" value="${esc(state.q)}" autocomplete="off"></label>
        <div class="stats">
          <div><b class="num">${FEST.filter(f => festStatus(f).k !== "past").length}</b>festival in calendario</div>
          <div><b class="num">${VEN.length}</b>sale da poker</div>
          <div><b class="num">${countries.length}</b>paesi</div>
        </div>
      </section>
      <a class="panel gioco-box" href="/gioco/"><span class="gioco-ico" aria-hidden="true">🃏</span><span><b>Impara giocando</b><small>Quiz sulle mani, test Poker IQ e sfide. Gratis, senza soldi veri.</small></span><span class="gioco-go" aria-hidden="true">›</span></a>
      <div class="layout home" style="margin-top:24px"><div>
        ${liveF.length ? `<section class="sec" style="margin-top:0"><div class="sec-h"><h2>Festival in gioco</h2><a class="meta" href="#/live">Vedi tutti (${liveF.length})</a></div>
          <div class="scroller">${liveF.slice(0, 10).map(liveCard).join("")}</div></section>` : ""}
        <section class="sec"><div class="sec-h"><h2>Calendario festival</h2><span class="meta">${shown.length} risultati</span></div>
          <div class="chips" role="group" aria-label="Filtri">
            <select class="chip" id="cc" aria-label="Paese"><option value="">Tutti i paesi</option>${countries.map(c => `<option value="${c}" ${state.cc === c ? "selected" : ""}>${flag(c)} ${COUNTRY[c] || c}</option>`).join("")}</select>
            <select class="chip" id="month" aria-label="Mese"><option value="">Tutti i mesi</option>${months.map(m => `<option value="${m}" ${state.month === m ? "selected" : ""}>${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}</option>`).join("")}</select>
            ${[300, 600, 1100, 2500].map(v => `<button class="chip ${+state.maxbi === v ? "on" : ""}" data-bi="${v}">Main ≤ €${v.toLocaleString("it-IT")}</button>`).join("")}
            ${state.cc || state.month || state.maxbi || state.q ? `<button class="chip" id="reset">Azzera</button>` : ""}
          </div>
          ${Object.keys(byMonth).sort().map(k => `<h3 style="margin:18px 0 10px">${mLabel(k)}</h3><div class="grid">${byMonth[k].map(festCard).join("")}</div>`).join("") || `<div class="empty">Nessun festival con questi filtri.</div>`}
        </section>
      </div><aside>
        <section><div class="sec-h"><h2>Stasera nelle sale</h2><a class="meta" href="#/oggi">Tutti (${tw.length})</a></div>
          ${twOpen.length ? `<div class="list">${twOpen.slice(0, 8).map(weeklyRow).join("")}</div>` : `<div class="empty">Nessun torneo settimanale ancora da giocare oggi.</div>`}
        </section>
        <div class="box ai" style="margin-top:16px"><h3>${icon("spark")} In arrivo con l'AI</h3><p class="meta" style="margin:0">Fotografa il tabellone della sala e il torneo si aggiorna per tutti. Strutture lette dai PDF. «Mi conviene entrare adesso?»</p></div>
      </aside></div>`;
    const q = document.getElementById("q");
    q.addEventListener("input", ev => { state.q = ev.target.value; const pos = ev.target.selectionStart; viewHome(); const el = document.getElementById("q"); el.focus(); el.setSelectionRange(pos, pos); });
    document.getElementById("cc").addEventListener("change", ev => { state.cc = ev.target.value; viewHome(); });
    document.getElementById("month").addEventListener("change", ev => { state.month = ev.target.value; viewHome(); });
    document.querySelectorAll("[data-bi]").forEach(b => b.addEventListener("click", () => { state.maxbi = state.maxbi == b.dataset.bi ? "" : b.dataset.bi; viewHome(); }));
    const r = document.getElementById("reset"); if (r) r.addEventListener("click", () => { Object.assign(state, { q: "", cc: "", month: "", maxbi: "" }); viewHome(); });
  }

  function viewLive() {
    const fl = allFlights(), live = fl.filter(x => x.st.k === "live");
    const tw = todayWeekly(), twLive = tw.filter(x => x.st.k === "live");
    const soon = fl.filter(x => x.st.k === "soon" && x.st.startsIn < 24 * 3.6e6).sort((a, b) => a.st.startsIn - b.st.startsIn);
    $app.innerHTML = `<h1>In corso <em>adesso</em></h1>
      <p class="lead">Livello e tempi sono <b>stimati</b> dall'orario di inizio e dalla durata dei livelli (pause escluse). Quando una sala usa il clock YUGRIND o un giocatore fotografa il tabellone, il dato diventa in diretta.</p>
      <section class="sec"><div class="sec-h"><h2>Festival</h2><span class="meta">${live.length}</span></div>
        ${live.length ? `<div class="grid">${live.map(liveCard).join("")}</div>` : `<div class="empty">Nessun Day con orario pubblicato è in corso.</div>`}</section>
      <section class="sec"><div class="sec-h"><h2>Tornei nelle sale</h2><span class="meta">${twLive.length}</span></div>
        ${twLive.length ? `<div class="list">${twLive.map(weeklyRow).join("")}</div>` : `<div class="empty">Nessun torneo settimanale in corso.</div>`}</section>
      <section class="sec"><div class="sec-h"><h2>Partono nelle prossime 24 ore</h2></div>
        ${soon.length ? `<div class="list">${soon.map(({ f, e, ei, fl, i, st }) => `<a class="li" href="#/t/${f.id}/${ei}/${i}"><span class="t">${new Intl.DateTimeFormat("it-IT", { timeZone: f.timezone, hour: "2-digit", minute: "2-digit" }).format(st.t0)}<small>tra ${durWords(st.startsIn)}</small></span><span class="n"><b>${esc(e.name)} — ${esc(fl.label)}</b><span>${flag(f.country)} ${esc(f.festival)} · ${esc(f.city)}</span></span><span>${e.buy_in_eur != null ? `<span class="money">${eur(e.buy_in_eur)}</span>` : ""}</span></a>`).join("")}</div>` : `<div class="empty">Nessuna partenza nelle prossime 24 ore.</div>`}</section>`;
  }

  /* ---------- guida del viaggio ---------- */
  function travelGuide(f) {
    const place = `${f.venue || ""} ${f.city}`.trim();
    const dated = !!(f.start_date && f.end_date);
    const nights = dated ? Math.max(1, Math.round((Date.parse(f.end_date) - Date.parse(f.start_date)) / 864e5)) : 2;
    const when = dated ? f.start_date : todayIn(f.timezone);
    const L = [
      ["bed", "Hotel vicini", `https://www.booking.com/searchresults.html?ss=${enc(place)}${dated ? `&checkin=${f.start_date}&checkout=${f.end_date}` : ""}`, dated ? "Date del festival già impostate" : "Booking"],
      ["plane", "Voli", `https://www.google.com/travel/flights?q=${enc("voli per " + f.city)}`, "Google Voli"],
      ["nav", "Come arrivare", `https://www.google.com/maps/dir/?api=1&destination=${enc(place)}`, "Percorso fino al casinò"],
      ["food", "Ristoranti", `https://www.google.com/maps/search/${enc("ristoranti vicino " + place)}`, "Con recensioni"],
      ["bar", "Bar e locali", `https://www.google.com/maps/search/${enc("cocktail bar vicino " + place)}`, "Per il dopo-torneo"],
      ["ticket", "Cosa fare", `https://www.getyourguide.com/s/?q=${enc(f.city)}`, "Tour ed esperienze"],
      ["cal", "Eventi in città", `https://www.google.com/search?q=${enc(`eventi ${f.city} ${MONTHS[+when.slice(5, 7) - 1]} ${when.slice(0, 4)}`)}`, "Concerti, partite, mercatini"],
      ["car", "Auto a noleggio", `https://www.google.com/search?q=${enc("noleggio auto " + f.city)}`, "Comodo per i casinò fuori città"],
    ];
    const me = f.events ? mainEvent(f) : null;
    return `<div class="actions">${L.map(([i, t, u, s]) => `<a class="action" href="${u}" target="_blank" rel="noopener sponsored">${icon(i)}<b>${t}</b><small>${s}</small></a>`).join("")}</div>
      <div class="box" style="margin-top:12px"><h3>${icon("ticket")} Quanto mi costa il viaggio?</h3>
        <form class="grid2" id="budget" onsubmit="return false">
          <label class="f">Buy-in €<input type="number" inputmode="numeric" min="0" data-k="bi" value="${me && me.buy_in_eur != null ? me.buy_in_eur : ""}"></label>
          <label class="f">Re-entry<input type="number" inputmode="numeric" min="0" data-k="re" value="0"></label>
          <label class="f">Notti<input type="number" inputmode="numeric" min="0" data-k="n" value="${nights}"></label>
          <label class="f">Hotel €/notte<input type="number" inputmode="numeric" min="0" data-k="h" placeholder="80"></label>
          <label class="f">Viaggio A/R €<input type="number" inputmode="numeric" min="0" data-k="v" placeholder="150"></label>
          <label class="f">Pasti €/giorno<input type="number" inputmode="numeric" min="0" data-k="p" placeholder="50"></label>
        </form><div class="total">Totale <span class="money" id="tot">—</span></div>
        <p class="meta" style="margin:4px 0 0">I numeri sono tuoi: restano su questo dispositivo.</p></div>`;
  }
  function bindBudget() {
    const box = document.getElementById("budget"); if (!box) return;
    const calc = () => { const v = {}; box.querySelectorAll("input").forEach(i => v[i.dataset.k] = +i.value || 0); const t = v.bi * (1 + v.re) + v.n * v.h + v.v + (v.n + 1) * v.p; document.getElementById("tot").textContent = t ? eur(Math.round(t)) : "—"; };
    box.addEventListener("input", calc); calc();
  }
  const sourcesBox = urls => `<div class="box"><h3>${icon("link")} Fonti</h3><div class="sources">${(urls || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 64))}</a>`).join("")}</div>
    <p class="meta" style="margin:8px 0 0">Un dato è sbagliato? <a href="mailto:info@yugrind.com?subject=${enc("Correzione dati")}">Scrivici</a>.</p></div>`;

  /* ---------- pagina festival ---------- */
  function viewFestival(id) {
    const f = FEST.find(x => x.id === id); if (!f) return notFound();
    const s = festStatus(f);
    const evs = f.events.map((e, ei) => `<div class="card">
      <div class="row" style="justify-content:space-between"><h3>${esc(e.name)}</h3>${e.is_main ? `<span class="badge soon">Main</span>` : ""}</div>
      <div class="row meta"><span>Buy-in ${money(e.buy_in_eur)}</span><span>· Garantito ${e.guarantee_eur ? `<b>${eur(e.guarantee_eur)}</b>` : "n.d."}</span><span>· Livelli ${e.level_minutes ? e.level_minutes + "'" : "n.d."}</span><span>· Stack ${e.starting_stack ? Number(e.starting_stack).toLocaleString("it-IT") : "n.d."}</span></div>
      ${e.flights.length ? `<div class="flights">${e.flights.map((fl, i) => { const st = flightState(f, e, fl); return `<a class="flight" href="#/t/${f.id}/${ei}/${i}"><b>${esc(fl.label)}</b><span class="when">${fl.start ? localTime(zonedToUtc(fl.start, f.timezone), f.timezone) : fmtDate(fl.date) + " · orario n.d."}</span>${st.k === "live" ? `<span class="badge live">live</span>` : ""}</a>`; }).join("")}</div>` : `<p class="meta" style="margin:0">Day non ancora pubblicati.</p>`}
    </div>`).join("");
    $app.innerHTML = `<div class="crumbs"><a href="#/">${icon("back")} Calendario</a><span>·</span>${esc(COUNTRY[f.country] || f.country)}<span>·</span>${esc(f.city)}</div>
      <div class="row">${badge(s)} ${confBadge(f.confidence)} ${f.tour ? `<span class="badge">${esc(f.tour)}</span>` : ""}</div>
      <h1 style="margin-top:10px">${esc(f.festival)}</h1>
      <p class="lead">${flag(f.country)} ${esc(f.venue || "")}, ${esc(f.city)} · ${fmtRange(f.start_date, f.end_date)}</p>
      <div class="btns" style="margin-bottom:8px">
        <button class="btn ${isFav("f:" + f.id) ? "" : "ghost"}" id="favF">${icon("star")} ${isFav("f:" + f.id) ? "Nel tuo piano" : "Salva nel piano"}</button>
        <button class="btn ghost" id="icsF">${icon("cal")} Aggiungi al calendario</button>
        <button class="btn ghost" id="shareF">${icon("share")} Condividi</button>
        ${f.website ? `<a class="btn ghost" href="${esc(f.website)}" target="_blank" rel="noopener">${icon("link")} Sito ufficiale</a>` : ""}
      </div>
      <div class="layout" style="margin-top:16px"><div>
        <section><div class="sec-h"><h2>Eventi e Day</h2></div>
          ${f.events.length ? `<div class="ev">${evs}</div>` : `<div class="empty">Programma non ancora pubblicato dall'organizzatore.</div>`}
          ${f.notes ? `<p class="meta">${icon("info")} ${esc(f.notes)}</p>` : ""}</section>
        <section class="sec"><div class="sec-h"><h2>Organizza il viaggio</h2></div>${travelGuide(f)}</section>
      </div><aside>
        <div class="box ai"><h3>${icon("spark")} Assistente YUGRIND</h3><p class="meta" style="margin:0">In arrivo: «Ho 1.500 €, parto da Milano: quali Day mi conviene giocare qui?», struttura letta dal PDF, riassunto di ogni Day.</p></div>
        ${sourcesBox(f.source_urls)}
      </aside></div>`;
    bindBudget();
    document.getElementById("favF").addEventListener("click", () => { toggleFav("f:" + f.id); viewFestival(id); });
    document.getElementById("icsF").addEventListener("click", () => downloadIcs([festIcs(f), ...f.events.flatMap((e, ei) => e.flights.map((fl, i) => flightIcs(f, e, fl, `#/t/${f.id}/${ei}/${i}`)))], `${f.id}.ics`));
    document.getElementById("shareF").addEventListener("click", () => share(f.festival));
  }

  /* ---------- pagina torneo (festival o settimanale) ---------- */
  let timer = null;
  function viewTournament(fid, ei, i) {
    const f = FEST.find(x => x.id === fid), e = f && f.events[+ei], fl = e && e.flights[+i];
    if (!fl) return notFound();
    renderTournament({
      f, e, fl, k: `yg_rep_${f.id}_${ei}_${i}`, fav: `t:${f.id}|${ei}|${i}`, title: `${e.name} — ${fl.label}`, hash: `#/t/${f.id}/${ei}/${i}`,
      crumbs: `<a href="#/f/${f.id}">${icon("back")} ${esc(f.festival)}</a>`,
      others: e.flights.length > 1 ? `<div class="box"><h3>${icon("cal")} Altri Day</h3><div class="flights">${e.flights.map((x, j) => `<a class="flight" href="#/t/${f.id}/${ei}/${j}" ${+j === +i ? 'aria-current="page"' : ""}><b>${esc(x.label)}${+j === +i ? " · qui" : ""}</b><span class="when">${x.start ? localTime(zonedToUtc(x.start, f.timezone), f.timezone) : fmtDate(x.date)}</span></a>`).join("")}</div></div>` : "",
      guide: `#/f/${f.id}`,
    });
  }
  function renderTournament(c) {
    const { f, e, fl, k } = c;
    const draw = () => {
      const st = flightState(f, e, fl), rep = store.get(k, null);
      let clock;
      if (st.k === "notime") clock = `<div class="lv">Orario non pubblicato</div><div class="time">—</div><div class="note">Giorno: ${fmtDate(fl.date)}. Appena l'organizzatore pubblica l'orario, il clock parte da solo.</div>`;
      else if (st.k === "soon") clock = `<div class="lv">Inizia tra</div><div class="time">${dur(st.startsIn)}</div><div class="blinds">${localTime(st.t0, f.timezone)} ora locale</div>`;
      else if (st.k === "done") clock = `<div class="lv">Concluso</div><div class="time">—</div><div class="note">Iniziato ${localTime(st.t0, f.timezone)} ora locale.</div>`;
      else if (st.level) { const p = Math.round((1 - st.left / st.lm) * 100); clock = `<div class="lv">Livello ${st.level} <span class="badge est">stima</span></div><div class="time">${dur(st.left)}</div><div class="blinds">Blind: struttura non ancora caricata</div><div class="bar"><i style="width:${p}%"></i></div><div class="note">Stima da orario d'inizio e livelli da ${e.level_minutes}'. Pause escluse: il torneo reale può essere qualche livello indietro.</div>`; }
      else clock = `<div class="lv">In corso <span class="badge est">stima</span></div><div class="time">${dur(st.elapsed)}</div><div class="note">Tempo trascorso dall'inizio. Durata dei livelli non pubblicata.</div>`;
      const lr = st.lrEnd ? (now() < st.lrEnd ? `<b>${durWords(st.lrEnd - now())}</b><i>chiude ${localTime(st.lrEnd, f.timezone)}</i>` : `<b>chiusa</b><i>${localTime(st.lrEnd, f.timezone)}</i>`) : `<b>n.d.</b><i>${esc(e.late_reg || "non pubblicata")}</i>`;
      const avg = rep && rep.entries && rep.left && e.starting_stack ? Math.round(rep.entries * e.starting_stack / rep.left) : null;
      document.getElementById("clock").innerHTML = clock;
      document.getElementById("kpis").innerHTML = `
        <div class="kpi"><span>Buy-in</span><b>${money(e.buy_in_eur)}</b></div>
        <div class="kpi"><span>Garantito</span><b>${e.guarantee_eur ? eur(e.guarantee_eur) : "n.d."}</b></div>
        <div class="kpi"><span>Late reg</span>${lr}</div>
        <div class="kpi"><span>Stack iniziale</span><b>${e.starting_stack ? Number(e.starting_stack).toLocaleString("it-IT") : "n.d."}</b></div>
        <div class="kpi"><span>Entries</span><b>${rep && rep.entries ? rep.entries : "—"}</b><i>${rep && rep.entries ? "segnalato" : "nessun dato in diretta"}</i></div>
        <div class="kpi"><span>Rimasti</span><b>${rep && rep.left ? rep.left : "—"}</b><i>${rep && rep.left ? "segnalato" : "nessun dato in diretta"}</i></div>
        <div class="kpi"><span>Stack medio</span><b>${avg ? avg.toLocaleString("it-IT") : "—"}</b><i>${avg ? "calcolato" : "serve entries + rimasti"}</i></div>
        <div class="kpi"><span>Re-entry</span><b style="font-size:16px">${esc(e.reentry || "n.d.")}</b></div>`;
      document.getElementById("repinfo").textContent = rep ? `Ultima segnalazione: livello ${rep.level || "?"}, ${rep.entries || "?"} entries, ${rep.left || "?"} rimasti alle ${new Date(rep.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}. Non verificata; nella prova resta solo su questo dispositivo.` : "Sei in sala? Bastano tre numeri dal tabellone e il torneo si aggiorna.";
    };
    $app.innerHTML = `<div class="crumbs">${c.crumbs}</div>
      <h1>${esc(c.title)}</h1>
      <p class="lead">${flag(f.country)} ${esc(f.venue || "")}, ${esc(f.city)}${e.structure_url ? ` · <a href="${esc(e.structure_url)}" target="_blank" rel="noopener">struttura ufficiale</a>` : ""}</p>
      <div class="btns" style="margin-bottom:16px">
        <button class="btn ${isFav(c.fav) ? "" : "ghost"}" id="favT">${icon("star")} ${isFav(c.fav) ? "Nel tuo piano" : "Salva"}</button>
        ${fl.start || fl.date ? `<button class="btn ghost" id="icsT">${icon("cal")} Calendario</button>` : ""}
        <button class="btn ghost" id="shareT">${icon("share")} Condividi</button>
      </div>
      <div class="layout"><div>
        <div class="clock" id="clock" aria-live="off"></div>
        <div class="kpis" id="kpis"></div>
        <div class="box" style="margin-top:12px"><h3>${icon("camera")} Sei al tavolo?</h3>
          <p class="meta" id="repinfo" style="margin:0 0 10px"></p>
          <form class="grid2" id="rep">
            <label class="f">Livello<input name="level" inputmode="numeric" autocomplete="off"></label>
            <label class="f">Entries<input name="entries" inputmode="numeric" autocomplete="off"></label>
            <label class="f">Rimasti<input name="left" inputmode="numeric" autocomplete="off"></label>
            <button class="btn" type="submit" style="align-self:end">Aggiorna</button>
          </form>
          <p class="meta" style="margin:10px 0 0">${icon("spark")} In arrivo: fotografi lo schermo della sala e l'AI legge livello, blind, entries e rimasti al posto tuo.</p>
        </div>
      </div><aside>
        <div class="box ai"><h3>${icon("spark")} Mi conviene entrare adesso?</h3><p class="meta" style="margin:0">Con la struttura caricata calcoliamo con quanti big blind entri adesso, quanto late reg resta e quanto «gioco» ha il torneo. ${e.structure_url ? "Struttura trovata: in elaborazione." : "Manca la struttura di questo evento."}</p></div>
        ${c.others}
        <div class="box"><h3>${icon("bed")} Sei in viaggio?</h3><p class="meta" style="margin:0 0 10px">Hotel, ristoranti, bar e cosa fare a ${esc(f.city)}.</p><a class="btn ghost block" href="${c.guide}">Apri la guida</a></div>
      </aside></div>`;
    document.getElementById("rep").addEventListener("submit", ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      Object.keys(d).forEach(x => d[x] = String(d[x]).replace(/\D/g, ""));
      if (!d.level && !d.entries && !d.left) return;
      store.set(k, { ...d, at: Date.now() }); ev.target.reset(); draw(); toast("Grazie: torneo aggiornato");
    });
    document.getElementById("favT").addEventListener("click", ev => { const on = toggleFav(c.fav); ev.currentTarget.className = "btn " + (on ? "" : "ghost"); ev.currentTarget.innerHTML = `${icon("star")} ${on ? "Nel tuo piano" : "Salva"}`; });
    const ic = document.getElementById("icsT"); if (ic) ic.addEventListener("click", () => downloadIcs([flightIcs(f, e, fl, c.hash)], "torneo.ics"));
    document.getElementById("shareT").addEventListener("click", () => share(c.title));
    draw(); timer = setInterval(draw, 1000);
  }

  /* ---------- sale ---------- */
  function viewToday() {
    const t = todayWeekly(), live = t.filter(x => x.st.k === "live"), later = t.filter(x => x.st.k === "soon" || x.st.k === "notime"), done = t.filter(x => x.st.k === "done");
    $app.innerHTML = `<h1>Oggi nelle <em>sale</em></h1>
      <p class="lead">I tornei settimanali di oggi nei casinò europei, con l'ora della sala. Il livello è una stima da orario e durata dei livelli.</p>
      <section class="sec"><div class="sec-h"><h2>In corso</h2><span class="meta">${live.length}</span></div>${live.length ? `<div class="list">${live.map(weeklyRow).join("")}</div>` : `<div class="empty">Nessun torneo settimanale in corso adesso.</div>`}</section>
      <section class="sec"><div class="sec-h"><h2>Più tardi</h2><span class="meta">${later.length}</span></div>${later.length ? `<div class="list">${later.map(weeklyRow).join("")}</div>` : `<div class="empty">Nessun altro torneo oggi.</div>`}</section>
      ${done.length ? `<section class="sec"><div class="sec-h"><h2>Già finiti</h2></div><div class="list">${done.map(weeklyRow).join("")}</div></section>` : ""}
      <p class="meta" style="margin-top:20px">Conosciamo il programma settimanale di ${VEN.filter(v => v.weekly.length).length} sale su ${VEN.length}. <a href="#/sale">Tutte le sale</a></p>`;
  }
  function viewVenues() {
    const by = {}; VEN.forEach(v => (by[v.country] ||= []).push(v));
    $app.innerHTML = `<h1>Sale da poker in <em>Europa</em></h1>
      <p class="lead">Casinò e circoli con tornei o cash game. Ogni sala ha la sua fonte, e quelle chiuse sono segnalate.</p>
      ${Object.keys(by).sort((a, b) => (COUNTRY[a] || a).localeCompare(COUNTRY[b] || b)).map(cc => `<section class="sec"><div class="sec-h"><h2>${flag(cc)} ${COUNTRY[cc] || cc}</h2><span class="meta">${by[cc].length}</span></div><div class="grid">${by[cc].map(v => `<a class="card" href="#/v/${v.id}">
        <div class="row">${v.status === "closed" ? `<span class="badge closed">chiusa</span>` : v.weekly.length ? `<span class="badge ok">${v.weekly.length} tornei a settimana</span>` : `<span class="badge">programma non online</span>`} ${confBadge(v.confidence)}</div>
        <h3>${esc(v.venue)}</h3><div class="venue">${icon("pin")}<span>${esc(v.city)}</span></div>
        ${v.cash_games ? `<div class="foot"><span class="meta">Cash: ${esc(v.cash_games)}</span></div>` : ""}</a>`).join("")}</div></section>`).join("")}`;
  }
  function viewVenue(id) {
    const v = VEN.find(x => x.id === id); if (!v) return notFound();
    const wd = weekdayIn(v.timezone, now());
    const rows = DAYK.map(d => { const ws = v.weekly.map((w, wi) => [w, wi]).filter(([w]) => w.days.includes(d)); return ws.length ? `<tr class="${d === wd ? "today" : ""}"><td><b>${DAYIT[d]}</b>${d === wd ? ` <span class="badge ok">oggi</span>` : ""}</td><td>${ws.map(([w, wi]) => `<a href="#/w/${v.id}/${wi}"><b>${w.time ? esc(w.time) : "orario n.d."}</b> · ${esc(w.name)}</a> · ${money(w.buy_in_eur)}${w.starting_stack ? ` · stack ${Number(w.starting_stack).toLocaleString("it-IT")}` : ""}${w.level_minutes ? ` · livelli ${w.level_minutes}'` : ""}`).join("<br>")}</td></tr>` : ""; }).join("");
    $app.innerHTML = `<div class="crumbs"><a href="#/sale">${icon("back")} Sale</a><span>·</span>${esc(COUNTRY[v.country] || v.country)}</div>
      <div class="row">${v.status === "closed" ? `<span class="badge closed">sala chiusa</span>` : ""} ${confBadge(v.confidence)}</div>
      <h1 style="margin-top:10px">${esc(v.venue)}</h1>
      <p class="lead">${flag(v.country)} ${esc(v.city)}</p>
      <div class="btns">${v.poker_page ? `<a class="btn ghost" href="${esc(v.poker_page)}" target="_blank" rel="noopener">${icon("link")} Pagina poker ufficiale</a>` : ""}<a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${enc(v.venue + " " + v.city)}" target="_blank" rel="noopener">${icon("nav")} Indicazioni</a></div>
      ${v.status === "closed" ? `<div class="box warn" style="margin-top:16px"><h3>Attenzione</h3><p style="margin:0">${esc(v.status_note)}</p></div>` : ""}
      <div class="layout" style="margin-top:16px"><div>
        ${v.dated_source ? (() => { const d0 = todayIn(v.timezone); const up = DATED.filter(x => x.venue_id === v.id && x.date >= d0 && x.kind !== "cash").slice(0, 30);
          return `<section><div class="sec-h"><h2>Prossimi tornei</h2><span class="meta">calendario ufficiale ${esc(v.dated_source)}</span></div>${up.length ? `<div class="list">${up.map(x => `<a class="li" href="#/d/${x.i}"><span class="t" style="font-size:15px">${x.date === d0 ? "oggi" : fmtDate(x.date).replace(/ \d{4}$/, "")}<small>${esc(x.time || "")}</small></span><span class="n"><b>${esc(x.series ? x.series + " · " : "")}${esc(x.name)}</b><span>${esc(x.buy_in_text || "")}</span></span><span>${x.buy_in_eur != null ? `<span class="money">${eur(x.buy_in_eur)}</span>` : ""}</span></a>`).join("")}</div>` : `<div class="empty">Nessun torneo nei prossimi giorni.</div>`}</section>`; })()
        : `<section><div class="sec-h"><h2>Tornei della settimana</h2></div>
          ${rows ? `<div class="tablewrap"><table><tbody>${rows}</tbody></table></div>` : `<div class="empty">La sala non pubblica un programma settimanale online.</div>`}</section>`}
        ${v.cash_games ? `<section class="sec"><div class="sec-h"><h2>Cash game</h2></div><div class="box">${esc(v.cash_games)}</div></section>` : ""}
        ${FEST.some(f => f.city === v.city && festStatus(f).k !== "past") ? `<section class="sec"><div class="sec-h"><h2>Festival a ${esc(v.city)}</h2></div><div class="grid">${FEST.filter(f => f.city === v.city && festStatus(f).k !== "past").map(festCard).join("")}</div></section>` : ""}
        <section class="sec"><div class="sec-h"><h2>Organizza il viaggio</h2></div>${travelGuide(asFest(v))}</section>
        ${v.notes ? `<p class="meta">${icon("info")} ${esc(v.notes)}</p>` : ""}
      </div><aside>
        ${sourcesBox(v.source_urls)}
        <div class="box"><h3>${icon("clock")} Lavori in questa sala?</h3><p class="meta" style="margin:0">Il clock YUGRIND è gratuito: lo proietti in sala e i tuoi tornei appaiono qui in diretta.</p></div>
      </aside></div>`;
    bindBudget();
  }
  function viewWeekly(vid, wi) {
    const v = VEN.find(x => x.id === vid), w = v && v.weekly[+wi]; if (!w) return notFound();
    let fl = null;
    for (let d = 0; d < 7 && !fl; d++) {
      const ms = now() + d * 864e5, wd = weekdayIn(v.timezone, ms);
      if (w.days.includes(wd)) { const ds = new Intl.DateTimeFormat("en-CA", { timeZone: v.timezone }).format(ms); fl = w.time ? { label: DAYIT[wd], start: `${ds}T${w.time}` } : { label: DAYIT[wd], date: ds }; }
    }
    renderTournament({
      f: asFest(v), e: w, fl, k: `yg_rep_w_${v.id}_${wi}_${fl.start || fl.date}`, fav: `w:${v.id}|${wi}`, title: w.name, hash: `#/w/${v.id}/${wi}`,
      crumbs: `<a href="#/v/${v.id}">${icon("back")} ${esc(v.venue)}</a>`,
      others: `<div class="box"><h3>${icon("cal")} Si gioca ogni</h3><p style="margin:0">${w.days.map(d => DAYIT[d]).join(", ")}${w.time ? ` alle ${esc(w.time)}` : ""}</p></div>`,
      guide: `#/v/${v.id}`,
    });
  }

  // torneo datato del calendario ufficiale di una sala
  function viewDated(i) {
    const x = DATED[+i], v = x && VBYID[x.venue_id]; if (!x || !v) return notFound();
    const fl = datedFl(x);
    renderTournament({
      f: asFest(v), e: x, fl, k: `yg_rep_d_${x.venue_id}_${x.date}_${x.time}_${x.name}`, fav: `d:${x.venue_id}|${x.date}|${x.time}|${x.name}`, title: `${x.series ? x.series + " · " : ""}${x.name}`, hash: `#/d/${i}`,
      crumbs: `<a href="#/v/${v.id}">${icon("back")} ${esc(v.venue)}</a>`,
      others: `<div class="box"><h3>${icon("cal")} Dal calendario ufficiale</h3><p class="meta" style="margin:0 0 10px">${esc(v.dated_source)} · ${fmtDate(x.date)}${x.time ? " alle " + esc(x.time) : ""}${x.buy_in_text ? " · buy-in " + esc(x.buy_in_text) : ""}</p>${x.url ? `<a class="btn ghost block" href="${esc(x.url)}" target="_blank" rel="noopener">${icon("link")} Scheda ufficiale</a>` : ""}</div>`,
      guide: `#/v/${v.id}`,
    });
  }

  /* ---------- il mio piano (preferiti) ---------- */
  function viewPlan() {
    const items = FAV().map(k => {
      const [t, rest] = [k.slice(0, 1), k.slice(2)];
      if (t === "f") { const f = FEST.find(x => x.id === rest); return f && { k, sort: f.start_date, html: festCard(f), ics: festIcs(f) }; }
      if (t === "t") { const [fid, ei, i] = rest.split("|"); const f = FEST.find(x => x.id === fid), e = f && f.events[+ei], fl = e && e.flights[+i]; if (!fl) return null; const hash = `#/t/${fid}/${ei}/${i}`;
        return { k, sort: fl.start || fl.date, html: `<a class="card" href="${hash}">${starBtn(k)}<h3 style="padding-right:36px">${esc(e.name)} — ${esc(fl.label)}</h3><div class="venue"><span>${flag(f.country)}</span><span>${esc(f.festival)} · ${esc(f.city)}</span></div><div class="foot"><span class="meta">${icon("clock")} ${fl.start ? localTime(zonedToUtc(fl.start, f.timezone), f.timezone) : fmtDate(fl.date)}</span>${e.buy_in_eur != null ? `<span class="money">${eur(e.buy_in_eur)}</span>` : ""}</div></a>`, ics: flightIcs(f, e, fl, hash) }; }
      if (t === "d") { const [vid, date, time, ...nm] = rest.split("|"); const x = DATED.find(y => y.venue_id === vid && y.date === date && (y.time || "") === time && y.name === nm.join("|")); const v = x && VBYID[vid]; if (!x || !v) return null; const fl = datedFl(x), f = asFest(v);
        return { k, sort: x.date, html: `<a class="card" href="#/d/${x.i}">${starBtn(k)}<h3 style="padding-right:36px">${esc(x.name)}</h3><div class="venue"><span>${flag(v.country)}</span><span>${esc(v.venue)} · ${esc(v.city)}</span></div><div class="foot"><span class="meta">${icon("clock")} ${fmtDate(x.date)}${x.time ? " · " + esc(x.time) : ""}</span>${x.buy_in_eur != null ? `<span class="money">${eur(x.buy_in_eur)}</span>` : ""}</div></a>`, ics: flightIcs(f, x, fl, `#/d/${x.i}`) }; }
      if (t === "w") { const [vid, wi] = rest.split("|"); const v = VEN.find(x => x.id === vid), w = v && v.weekly[+wi]; if (!w) return null;
        return { k, sort: "9999", html: `<a class="card" href="#/w/${vid}/${wi}">${starBtn(k)}<h3 style="padding-right:36px">${esc(w.name)}</h3><div class="venue"><span>${flag(v.country)}</span><span>${esc(v.venue)} · ${esc(v.city)}</span></div><div class="foot"><span class="meta">${icon("cal")} ogni ${w.days.map(d => DAYIT[d]).join(", ")}${w.time ? " · " + esc(w.time) : ""}</span>${w.buy_in_eur != null ? `<span class="money">${eur(w.buy_in_eur)}</span>` : ""}</div></a>`, ics: null }; }
      return null;
    }).filter(Boolean).sort((a, b) => a.sort < b.sort ? -1 : 1);
    $app.innerHTML = `<h1>Il tuo <em>piano</em></h1>
      <p class="lead">Festival e tornei che hai salvato con la stella. Esportali nel calendario del telefono con un tocco.</p>
      ${items.length ? `<div class="btns" style="margin-bottom:16px"><button class="btn" id="icsAll">${icon("cal")} Aggiungi tutto al calendario</button></div><div class="grid">${items.map(x => x.html).join("")}</div>`
        : `<div class="empty">${icon("star")}<br>Ancora niente. Tocca la stella su un festival o un torneo per salvarlo qui.<br><br><a class="btn" href="#/">Sfoglia il calendario</a></div>`}
      <p class="meta" style="margin-top:20px">Il piano resta su questo dispositivo, senza account. Con l'account (in arrivo) lo ritrovi su tutti i dispositivi, con avvisi su late reg e cambi di programma.</p>`;
    const b = document.getElementById("icsAll"); if (b) b.addEventListener("click", () => downloadIcs(items.map(x => x.ics).filter(Boolean), "yugrind-piano.ics"));
    document.querySelectorAll("[data-fav]").forEach(s => s.addEventListener("click", () => setTimeout(viewPlan, 0)));
  }

  /* ---------- diario dei risultati (tracker) ---------- */
  function viewDiary() {
    const rows = store.get("yg_diary", []).sort((a, b) => a.date < b.date ? 1 : -1);
    const inv = rows.reduce((s, r) => s + (+r.buyin || 0) * (1 + (+r.reentry || 0)) + (+r.costs || 0), 0);
    const won = rows.reduce((s, r) => s + (+r.cash || 0), 0);
    const itm = rows.filter(r => +r.cash > 0).length;
    const pnl = won - inv, roi = inv ? pnl / inv * 100 : 0;
    const fmt = n => (n < 0 ? "−" : "") + "€" + Math.abs(Math.round(n)).toLocaleString("it-IT");
    $app.innerHTML = `<h1>Il tuo <em>diario</em></h1>
      <p class="lead">Segna buy-in, re-entry, spese e vincite dei tornei live: YUGRIND calcola profitto, ROI e piazzamenti a premio. I dati restano solo su questo dispositivo.</p>
      <div class="kpis" style="margin-bottom:16px">
        <div class="kpi"><span>Tornei</span><b>${rows.length}</b></div>
        <div class="kpi"><span>Investito</span><b>${fmt(inv)}</b><i>buy-in, re-entry e spese</i></div>
        <div class="kpi"><span>Profitto</span><b class="${pnl >= 0 ? "pnl-pos" : "pnl-neg"}">${fmt(pnl)}</b></div>
        <div class="kpi"><span>ROI · ITM</span><b class="${roi >= 0 ? "pnl-pos" : "pnl-neg"}">${rows.length ? roi.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : "—"}</b><i>${rows.length ? `${itm} a premio su ${rows.length} (${Math.round(itm / rows.length * 100)}%)` : "nessun dato"}</i></div>
      </div>
      <div class="layout"><div>
        <div class="box"><h3>${icon("plus")} Aggiungi un torneo</h3>
          <form class="grid2" id="dForm">
            <label class="f">Data<input type="date" name="date" required value="${todayIn("Europe/Rome")}"></label>
            <label class="f" style="grid-column:span 2">Torneo e sala<input name="name" required placeholder="es. Main Event · Nova Gorica"></label>
            <label class="f">Buy-in €<input name="buyin" type="number" inputmode="decimal" min="0" step="any" required></label>
            <label class="f">Re-entry<input name="reentry" type="number" inputmode="numeric" min="0" value="0"></label>
            <label class="f">Spese €<input name="costs" type="number" inputmode="decimal" min="0" step="any" value="0"></label>
            <label class="f">Vincita €<input name="cash" type="number" inputmode="decimal" min="0" step="any" value="0"></label>
            <button class="btn" type="submit" style="align-self:end">${icon("check")} Salva</button>
          </form></div>
        <section class="sec"><div class="sec-h"><h2>Storico</h2>${rows.length ? `<button class="btn ghost" id="csv">${icon("down")} Esporta CSV</button>` : ""}</div>
          ${rows.length ? `<div class="list">${rows.map((r, idx) => { const p = (+r.cash || 0) - (+r.buyin || 0) * (1 + (+r.reentry || 0)) - (+r.costs || 0); return `<div class="li"><span class="t" style="font-size:14px">${fmtDate(r.date).replace(/ \d{4}$/, "")}<small>${r.date.slice(0, 4)}</small></span><span class="n"><b>${esc(r.name)}</b><span>Buy-in ${eur(+r.buyin)}${+r.reentry ? ` ×${1 + +r.reentry}` : ""}${+r.costs ? ` · spese ${eur(+r.costs)}` : ""}${+r.cash ? ` · vinti ${eur(+r.cash)}` : ""}</span></span><span class="row"><b class="${p >= 0 ? "pnl-pos" : "pnl-neg"}">${fmt(p)}</b><button class="iconbtn" data-del="${idx}" aria-label="Elimina">${icon("trash")}</button></span></div>`; }).join("")}</div>` : `<div class="empty">Nessun torneo segnato.</div>`}</section>
      </div><aside>
        <div class="box"><h3>${icon("info")} Perché tenerlo</h3><p class="meta" style="margin:0">Il ROI vero di un giocatore live include viaggio e hotel: qui li segni insieme al buy-in. L'export CSV va bene per il commercialista o per un foglio di calcolo.</p></div>
        <div class="box ai"><h3>${icon("spark")} In arrivo</h3><p class="meta" style="margin:0">Fotografa la ricevuta del buy-in e il torneo si segna da solo. Statistiche per sala, buy-in e tipo di torneo.</p></div>
      </aside></div>`;
    document.getElementById("dForm").addEventListener("submit", ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target));
      const all = store.get("yg_diary", []); all.push(d); store.set("yg_diary", all); toast("Torneo salvato"); viewDiary();
    });
    document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Eliminare questo torneo dal diario?")) return;
      const keep = rows.filter((_, i) => i !== +b.dataset.del); store.set("yg_diary", keep); viewDiary();
    }));
    const c = document.getElementById("csv"); if (c) c.addEventListener("click", () => {
      const head = "data;torneo;buy_in;re_entry;spese;vincita;profitto\n";
      const body = rows.map(r => [r.date, `"${String(r.name).replace(/"/g, '""')}"`, r.buyin, r.reentry, r.costs, r.cash, ((+r.cash || 0) - (+r.buyin || 0) * (1 + (+r.reentry || 0)) - (+r.costs || 0)).toFixed(2)].join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + head + body], { type: "text/csv" })); a.download = "yugrind-diario.csv"; a.click();
    });
  }

  /* ---------- info + FAQ ---------- */
  function viewInfo() {
    const faq = [
      ["YUGRIND è gratis?", "Sì. Calendario, tornei in corso, clock e guide di viaggio sono gratis e lo resteranno. In futuro arriveranno funzioni in più (assistente AI, avvisi personalizzati) per chi le vuole."],
      ["Da dove vengono i dati?", "Dai programmi pubblicati da organizzatori, casinò e media. Ogni festival e ogni sala mostrano le loro fonti, con l'etichetta «verificato» o «da verificare». Se un dato manca scriviamo «n.d.»: mai un numero inventato."],
      ["Cosa vuol dire «stima» sul clock?", "Il livello è calcolato dall'orario d'inizio e dalla durata dei livelli pubblicata. Le pause non sono note, quindi il torneo reale può essere un po' indietro. Quando arriva un dato dalla sala o da un giocatore, la stima si corregge."],
      ["Serve un account?", "No. Piano e diario restano su questo dispositivo. L'account, quando arriverà, servirà solo a ritrovarli su altri dispositivi e a ricevere avvisi."],
      ["Gestisco una sala: come appaio in diretta?", "Il clock YUGRIND per le sale è gratuito: lo proietti sullo schermo e i tuoi tornei appaiono qui con livello, entries e rimasti in tempo reale. Scrivici a info@yugrind.com."],
      ["YUGRIND organizza tornei o accetta scommesse?", "No. Siamo un calendario indipendente: non vendiamo posti nei tornei e non abbiamo rapporti con siti di gioco online."],
    ];
    $app.innerHTML = `<section class="panel hero"><span class="eyebrow">${icon("spade")} Chi siamo</span><h1>Fatto da un giocatore, <em>per i giocatori.</em></h1>
      <p class="lead">YUGRIND raccoglie in un posto solo tutti i tornei di poker live d'Europa: quelli in corso, quelli di stasera e quelli dei prossimi mesi. Senza pubblicità invadente e senza obbligo di registrazione.</p></section>
      <div class="layout" style="margin-top:24px"><div>
        <section><div class="sec-h"><h2>Domande frequenti</h2></div><div class="box">${faq.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></section>
      </div><aside>
        <div class="box"><h3>${icon("spark")} In arrivo</h3><ul class="facts">
          <li>${icon("camera")} Foto del tabellone → dati live letti dall'AI</li>
          <li>${icon("ticket")} Strutture lette dai PDF e «mi conviene entrare?»</li>
          <li>${icon("live")} Avvisi Telegram: «late reg chiude tra 30'»</li>
          <li>${icon("bed")} Guide curate di ogni città del poker</li></ul></div>
        <div class="box"><h3>${icon("info")} Contatti</h3><p class="meta" style="margin:0"><a href="mailto:info@yugrind.com">info@yugrind.com</a></p></div>
      </aside></div>`;
  }
  function notFound() { $app.innerHTML = `<div class="empty">Pagina non trovata.<br><br><a class="btn" href="#/">Torna al calendario</a></div>`; }

  /* ---------- router, titoli, tema ---------- */
  const TITLES = { "": "Tutti i tornei di poker live in Europa", live: "In corso adesso", oggi: "Oggi nelle sale", sale: "Sale da poker in Europa", piano: "Il tuo piano", diario: "Il tuo diario", info: "Chi siamo e domande frequenti", area: "Area iscritti" };
  function route() {
    clearInterval(timer);
    const h = location.hash.replace(/^#\/?/, "").split("/");
    const sect = { "": "home", f: "home", t: "home", live: "home", oggi: "sale", sale: "sale", v: "sale", w: "sale", d: "sale", piano: "piano", diario: "diario", info: "info", area: "area" }[h[0]] || "home";
    document.querySelectorAll("[data-nav]").forEach(a => { const on = a.dataset.nav === sect; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    if (!h[0]) viewHome(); else if (h[0] === "live") viewLive(); else if (h[0] === "info") viewInfo();
    else if (h[0] === "oggi") viewToday(); else if (h[0] === "sale") viewVenues(); else if (h[0] === "v") viewVenue(h[1]); else if (h[0] === "w") viewWeekly(h[1], h[2]); else if (h[0] === "d") viewDated(h[1]);
    else if (h[0] === "piano") viewPlan(); else if (h[0] === "diario") viewDiary();
    else if (h[0] === "area" && window.YG_AREA) window.YG_AREA.view($app);
    else if (h[0] === "f") viewFestival(h[1]); else if (h[0] === "t") viewTournament(h[1], h[2], h[3]); else notFound();
    const h1 = $app.querySelector("h1");
    document.title = `${TITLES[h[0]] || (h1 ? h1.textContent : "YUGRIND")} · YUGRIND`;
    const n = allFlights().filter(x => x.st.k === "live").length + todayWeekly().filter(x => x.st.k === "live").length;
    document.querySelectorAll(".liveCount").forEach(lc => { lc.hidden = !n; lc.textContent = n; });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  const themeBtn = document.getElementById("theme");
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    themeBtn.innerHTML = icon(dark ? "sun" : "moon"); themeBtn.setAttribute("aria-label", dark ? "Passa al tema chiaro" : "Passa al tema scuro");
  }
  applyTheme(store.get("yg_theme", null));
  themeBtn.addEventListener("click", () => { const dark = document.documentElement.getAttribute("data-theme") ? document.documentElement.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; const t = dark ? "light" : "dark"; store.set("yg_theme", t); applyTheme(t); });

  /* ---------- ora simulata (solo per le prove: ?demo=1) ---------- */
  const dn = document.getElementById("demoNow");
  if (demoNow || new URLSearchParams(location.search).has("demo")) document.getElementById("demoBox").hidden = false;
  if (demoNow) dn.value = demoNow.slice(0, 16);
  dn.addEventListener("change", () => { demoNow = dn.value || null; try { demoNow ? sessionStorage.setItem("yg_demo", demoNow) : sessionStorage.removeItem("yg_demo"); } catch (e) { } location.reload(); });
  document.getElementById("demoReset").addEventListener("click", () => { try { sessionStorage.removeItem("yg_demo"); } catch (e) { } location.href = location.pathname + location.hash; });
  document.getElementById("dataStamp").textContent = `Dati aggiornati: ${DATA.generated || "?"}` + (DATA.sources || []).map(s => ` · ${s.label} letto ${String(s.fetched_at || "?").replace("T", " ")}`).join("");
  route();
})();
