/* YUGRIND — contatore anonimo delle persone collegate in questo momento (10/11/2026).
   Usa la «presenza» di Supabase Realtime (stesso progetto UE dell'area iscritti) con un collegamento diretto e leggero:
   niente libreria, niente cookie, niente nomi. Ogni scheda aperta manda solo un codice casuale, che sparisce quando la chiudi
   o dopo 60 secondi in background. Conta «sito» o «sala» secondo <html data-online="...">.
   Chi vuole il numero: window.YG_ONLINE.on(c => ...) con c = { tot, sala }. */
(function () {
  "use strict";
  var C = window.YG_CONFIG || {};
  if (!C.supabaseUrl || !C.supabaseAnonKey || !window.WebSocket) return;
  var where = document.documentElement.getAttribute("data-online") || "sito";
  var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
  var topic = "realtime:yugrind-online";
  var ws = null, ref = 0, joinRef = null, hb = null, hideT = null, retry = 1500, stopped = false, state = {}, subs = [];
  var api = window.YG_ONLINE = { last: null, on: function (f) { subs.push(f); if (api.last) f(api.last); } };

  function counts() {
    var tot = 0, sala = 0;
    for (var k in state) { var m = state[k]; if (!m || !m.length) continue; tot++; for (var i = 0; i < m.length; i++) if (m[i].p === "sala") { sala++; break; } }
    return { tot: tot, sala: sala };
  }
  function emit() { api.last = counts(); for (var i = 0; i < subs.length; i++) { try { subs[i](api.last); } catch (e) { } } }
  function raw(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function connect() {
    if (ws || document.hidden) return;
    stopped = false;
    var url = C.supabaseUrl.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(C.supabaseAnonKey) + "&vsn=1.0.0";
    try { ws = new WebSocket(url); } catch (e) { ws = null; return; }
    ws.onopen = function () {
      retry = 1500; joinRef = String(++ref);
      raw({ topic: topic, event: "phx_join", ref: joinRef, join_ref: joinRef,
        payload: { config: { broadcast: { self: false }, presence: { key: id }, postgres_changes: [] }, access_token: C.supabaseAnonKey } });
      hb = setInterval(function () { raw({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }); }, 25000);
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.topic !== topic) return;
      if (m.event === "phx_reply" && m.ref === joinRef && m.payload && m.payload.status === "ok") {
        raw({ topic: topic, event: "presence", ref: String(++ref), join_ref: joinRef, payload: { type: "presence", event: "track", payload: { p: where } } });
      } else if (m.event === "presence_state") {
        state = {}; for (var k in m.payload) state[k] = (m.payload[k].metas || []).slice(); emit();
      } else if (m.event === "presence_diff") {
        var j = (m.payload && m.payload.joins) || {}, l = (m.payload && m.payload.leaves) || {};
        for (var a in l) { var gone = {}; (l[a].metas || []).forEach(function (x) { gone[x.phx_ref] = 1; }); state[a] = (state[a] || []).filter(function (x) { return !gone[x.phx_ref]; }); if (!state[a].length) delete state[a]; }
        for (var b in j) state[b] = (state[b] || []).concat(j[b].metas || []);
        emit();
      }
    };
    ws.onclose = function () { clearInterval(hb); ws = null; state = {}; if (!stopped && !document.hidden) setTimeout(connect, retry = Math.min(retry * 2, 30000)); };
    ws.onerror = function () { try { ws.close(); } catch (e) { } };
  }
  function disconnect() { stopped = true; clearInterval(hb); if (ws) { try { ws.close(); } catch (e) { } } ws = null; }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hideT = setTimeout(disconnect, 60000); }
    else { clearTimeout(hideT); connect(); }
  });
  window.addEventListener("pagehide", disconnect);
  connect();

  // Nella home e nelle altre pagine dell'app: un piccolo «● N online» accanto al logo. La sala disegna il suo.
  if (where !== "sala") {
    var badge = null;
    api.on(function (c) {
      if (!badge) {
        var brand = document.querySelector(".brand"); if (!brand) return;
        var st = document.createElement("style");
        st.textContent = ".yg-online{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:3px 9px;border-radius:999px;font:600 12px/1.4 system-ui,-apple-system,sans-serif;color:#97A89F;border:1px solid rgba(151,168,159,.35);white-space:nowrap}.yg-online i{width:7px;height:7px;border-radius:50%;background:#27A56E;box-shadow:0 0 6px #27A56E}";
        document.head.appendChild(st);
        badge = document.createElement("span"); badge.className = "yg-online"; badge.setAttribute("aria-live", "polite");
        badge.appendChild(document.createElement("i")); badge.appendChild(document.createTextNode(""));
        brand.insertAdjacentElement("afterend", badge);
      }
      badge.lastChild.nodeValue = c.tot.toLocaleString("it-IT") + " online";
      badge.title = c.tot + " persone sul sito adesso, di cui " + c.sala + " nella Sala 3D";
    });
  }
})();
