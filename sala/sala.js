// La Sala YUGRIND — prototipo (fase 1). Tutto disegnato qui: geometrie e scritte su canvas, nessun file esterno.
// I dati vengono SOLO da ../data.js (window.PLE_DATA), lo stesso file del sito. Niente soldi, niente premi, niente marchi.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const D = window.PLE_DATA || { festivals: [], venues: [], dated: [] };
const $ = s => document.querySelector(s);
const SITE = "../"; // la sala vive in /sala/, il sito un livello sopra

// ---------------------------------------------------------------- dati
const ymd = tz => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dm = s => s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "n.d.";
const eur = n => (n == null || n === "") ? "n.d." : Number(n).toLocaleString("it-IT") + " €";
const flag = cc => { if (!cc || cc.length !== 2) return ""; return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); };
let regionNames = null; try { regionNames = new Intl.DisplayNames(["it"], { type: "region" }); } catch (e) {}
const country = cc => { try { return regionNames ? regionNames.of(cc) : cc; } catch (e) { return cc; } };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mainEvent = f => (f.events || []).find(e => e.is_main) || (f.events || [])[0] || null;
const VENUE = Object.fromEntries((D.venues || []).map(v => [v.id, v]));

const festNow = [], festNext = [];
for (const f of D.festivals || []) {
  const t = ymd(f.timezone);
  if (!f.start_date) continue;
  const end = f.end_date || f.start_date;
  if (f.start_date <= t && end >= t) festNow.push(f);
  else if (f.start_date > t && f.start_date <= addDays(t, 30)) festNext.push(f);
}
festNow.sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));
festNext.sort((a, b) => a.start_date.localeCompare(b.start_date));
const NOW = festNow.slice(0, 5), NEXT = festNext.slice(0, 10);

const tonight = (D.dated || []).filter(x => { const v = VENUE[x.venue_id]; return v && x.date === ymd(v.timezone); })
  .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));

const byCountry = {};
for (const v of D.venues || []) (byCountry[v.country] = byCountry[v.country] || []).push(v);
const COUNTRIES = Object.keys(byCountry).sort((a, b) => country(a).localeCompare(country(b), "it"));

// ---------------------------------------------------------------- 3D: avvio
const canvas = $("#c");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  $("#loading").innerHTML = `<div><b>La Sala YUGRIND</b>Questo telefono non riesce a mostrare la sala in 3D.<br><br><a href="${SITE}">Vai alla versione semplice</a></div>`;
  throw e;
}
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Lezione di Lux: Safari dichiara al massimo 4 processori, quindi su iPhone non si giudica «debole» dai processori.
const LOWEND = !IOS && (navigator.hardwareConcurrency || 8) <= 4;
const TOUCH0 = matchMedia("(pointer:coarse)").matches;
let pr = Math.min(window.devicePixelRatio || 1, LOWEND ? 1.25 : TOUCH0 ? 1.75 : 2);
renderer.setPixelRatio(pr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B110F);
scene.fog = new THREE.Fog(0x0B110F, 20, 46);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 80);
camera.rotation.order = "YXZ";

renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .45; pm.dispose(); }
scene.add(new THREE.HemisphereLight(0xffe6c0, 0x1c2a22, 1.05));
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6); sun.position.set(5, 14, 7); sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH0 ? 1024 : 2048, TOUCH0 ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 19, bottom: -19, near: 1, far: 40 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
scene.add(sun);

// ---------------------------------------------------------------- texture su canvas
function cv(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l + "…"; }
  return lines;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function carpetTex() {
  const [c, x] = cv(256, 256);
  x.fillStyle = "#173326"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${20 + Math.random() * 30},${40 + Math.random() * 30},${30 + Math.random() * 20},.5)`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  x.strokeStyle = "rgba(233,185,73,.16)"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(128, 8); x.lineTo(248, 128); x.lineTo(128, 248); x.lineTo(8, 128); x.closePath(); x.stroke();
  x.fillStyle = "rgba(233,185,73,.22)"; x.beginPath(); x.arc(128, 128, 6, 0, 7); x.fill();
  return tex(c, [14, 16]);
}
function woodTex() {
  const [c, x] = cv(512, 512);
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, "#2a1c12"); g.addColorStop(1, "#3d2818"); x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { x.strokeStyle = `rgba(0,0,0,${Math.random() * .18})`; x.lineWidth = 1 + Math.random() * 2; const xx = Math.random() * 512; x.beginPath(); x.moveTo(xx, 0); x.bezierCurveTo(xx + 8, 170, xx - 8, 340, xx + 4, 512); x.stroke(); }
  x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 4; for (let k = 0; k <= 512; k += 128) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 512); x.stroke(); }
  x.fillStyle = "rgba(233,185,73,.55)"; x.fillRect(0, 300, 512, 6); x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, 306, 512, 4);
  return tex(c, [8, 1]);
}
function poolTex() {
  const [c, x] = cv(128, 128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,214,150,.28)"); g.addColorStop(.5, "rgba(255,190,110,.09)"); g.addColorStop(1, "rgba(255,190,110,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return tex(c);
}
function feltGlow() { const [c, x] = cv(128, 128); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "#fff"); g.addColorStop(.55, "#555"); g.addColorStop(1, "#000"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return tex(c); }
function label(lines, opt = {}) {
  // lines: [{t, size, color, weight, chip:{text,color}}]
  const W = opt.w || 1024, H = opt.h || 256, [c, x] = cv(W, H);
  if (opt.bg !== false) { x.fillStyle = opt.bg || "rgba(11,17,15,.82)"; rrect(x, 4, 4, W - 8, H - 8, 28); x.fill(); x.strokeStyle = opt.border || "rgba(233,185,73,.55)"; x.lineWidth = 4; x.stroke(); }
  let y = opt.pad || 34;
  for (const l of lines) {
    if (l.chip) {
      x.font = `700 ${l.size || 34}px ${FONT}`; const tw = x.measureText(l.chip.text).width + 64, ch = (l.size || 34) + 22;
      const cx = (W - tw) / 2; x.fillStyle = l.chip.bg; rrect(x, cx, y, tw, ch, ch / 2); x.fill();
      x.fillStyle = l.chip.color; x.beginPath(); x.arc(cx + 26, y + ch / 2, 8, 0, 7); x.fill();
      x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(l.chip.text, cx + 44, y + ch / 2 + 1); y += ch + 14; continue;
    }
    x.font = `${l.weight || 700} ${l.size || 56}px ${FONT}`; x.fillStyle = l.color || "#ECF2EE"; x.textAlign = "center"; x.textBaseline = "top";
    for (const s of wrap(x, l.t, W - 70, l.max || 2)) { x.fillText(s, W / 2, y); y += (l.size || 56) * 1.18; }
    y += l.gap || 6;
  }
  return tex(c);
}
function sprite(t, w, h) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(w, h, 1); return s; }

// ---------------------------------------------------------------- la stanza
const RX = 15, RZ = 17, WALL_H = 5.2;
function marbleTex() {
  const [c, x] = cv(1024, 1024); x.fillStyle = "#e8e0d0"; x.fillRect(0, 0, 1024, 1024);
  let r = 11; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${150 + rnd() * 60},${140 + rnd() * 50},${120 + rnd() * 40},.06)`; x.beginPath(); x.arc(rnd() * 1024, rnd() * 1024, 2 + rnd() * 10, 0, 7); x.fill(); }
  for (let v = 0; v < 14; v++) { x.strokeStyle = `rgba(110,98,82,${.12 + rnd() * .25})`; x.lineWidth = .6 + rnd() * 2.2; x.beginPath(); let px = rnd() * 1024, py = rnd() * 1024; x.moveTo(px, py);
    for (let k = 0; k < 30; k++) { px += (rnd() - .3) * 60; py += (rnd() - .5) * 60; x.lineTo(px, py); } x.stroke(); }
  x.strokeStyle = "rgba(90,74,52,.55)"; x.lineWidth = 3; for (let k = 0; k <= 1024; k += 512) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 1024); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(1024, k); x.stroke(); }
  return tex(c, [7.5, 8.5]);
}
function ceilTex(em) {
  const [c, x] = cv(256, 256);
  if (em) { x.fillStyle = "#000"; x.fillRect(0, 0, 256, 256); x.strokeStyle = "#ffd59a"; x.lineWidth = 5; x.strokeRect(36, 36, 184, 184); return tex(c, [10, 11]); }
  x.fillStyle = "#3a2618"; x.fillRect(0, 0, 256, 256);
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#1c120b"); g.addColorStop(1, "#2a1a10"); x.fillStyle = g; x.fillRect(30, 30, 196, 196);
  x.strokeStyle = "#b8902f"; x.lineWidth = 4; x.strokeRect(30, 30, 196, 196); x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 8; x.strokeRect(4, 4, 248, 248);
  x.fillStyle = "#c9a043"; x.beginPath(); x.arc(128, 128, 9, 0, 7); x.fill();
  return tex(c, [10, 11]);
}
const marble = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshPhysicalMaterial({ map: marbleTex(), color: 0xbdb3a1, roughness: .2, clearcoat: .8, clearcoatRoughness: .12, envMapIntensity: .7 }));
marble.rotation.x = -Math.PI / 2; marble.receiveShadow = true; scene.add(marble);
const carpet = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2 - 3.2, RZ * 2 - 6.4), new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 1 }));
carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, .006, -.6); carpet.name = "floor"; carpet.receiveShadow = true; scene.add(carpet);
{ const b = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2 - 2.9, RZ * 2 - 6.1), new THREE.MeshStandardMaterial({ color: 0xb8902f, metalness: 1, roughness: .3 })); b.rotation.x = -Math.PI / 2; b.position.set(0, .004, -.6); scene.add(b); }
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshStandardMaterial({ map: ceilTex(false), emissiveMap: ceilTex(true), emissive: 0xffc27a, emissiveIntensity: 1.1, roughness: .7 }));
ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; scene.add(ceil);
const wallMat = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .8 });
for (const [px, pz, ry, len] of [[0, -RZ, 0, RX * 2], [0, RZ, Math.PI, RX * 2], [-RX, 0, Math.PI / 2, RZ * 2], [RX, 0, -Math.PI / 2, RZ * 2]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H), wallMat); m.position.set(px, WALL_H / 2, pz); m.rotation.y = ry; scene.add(m);
}
// scritta sulla parete nord
{ const t = label([{ t: "LA SALA YUGRIND", size: 92, color: "#E9B949", weight: 800 }], { w: 1400, h: 150, bg: false, pad: 22 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9.3, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(0, 4.45, -RZ + 0.03); scene.add(m); }

const LABELS = []; // etichette dei tavoli, mostrate solo da vicino
const INTER = []; // oggetti toccabili: {id, kind, group, center:Vector3, radius, approach(), sheet()}
const OBST = []; // ostacoli ellittici per camminare: {x,z,a,b}
const poolMat = new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function pool(x, z, s, root = scene) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), poolMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); root.add(m); }

// ---------------------------------------------------------------- tavoli
const G = {
  ped: new THREE.CylinderGeometry(.32, .5, .72, 20),
  body: new THREE.CylinderGeometry(1, 1, .14, 48),
  felt: new THREE.CylinderGeometry(1, 1, .03, 48),
  rail: new THREE.TorusGeometry(1, .085, 10, 56),
  card: new THREE.BoxGeometry(.1, .004, .14),
  shade: new THREE.CylinderGeometry(.42, .8, .32, 28, 1, true),
  bulb: new THREE.CircleGeometry(.62, 28),
  cord: new THREE.CylinderGeometry(.012, .012, 1, 6),
  seat: new THREE.BoxGeometry(.5, .1, .48),
  back: new THREE.BoxGeometry(.5, .62, .08),
  leg: new THREE.CylinderGeometry(.05, .07, .42, 8),
};
const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: .6, metalness: .1 }),
  wood: new THREE.MeshPhysicalMaterial({ color: 0x4a2c18, roughness: .38, clearcoat: .6, clearcoatRoughness: .25 }),
  rail: new THREE.MeshPhysicalMaterial({ color: 0x15100d, roughness: .42, clearcoat: .35, clearcoatRoughness: .4 }),
  felt: new THREE.MeshPhysicalMaterial({ color: 0x1F8A5B, roughness: .92, sheen: 1, sheenColor: 0x6fe0a8, sheenRoughness: .6, emissive: 0x2fa36a, emissiveIntensity: .45, emissiveMap: feltGlow() }),
  feltT: new THREE.MeshPhysicalMaterial({ color: 0x176b47, roughness: .92, sheen: 1, sheenColor: 0x5cc995, sheenRoughness: .6, emissive: 0x2a8f5d, emissiveIntensity: .4, emissiveMap: feltGlow() }),
  card: new THREE.MeshStandardMaterial({ color: 0x7a1d2a, roughness: .5 }),
  shade: new THREE.MeshStandardMaterial({ color: 0x0f3a26, roughness: .5, metalness: .3, side: THREE.DoubleSide, emissive: 0x3a2a10, emissiveIntensity: .25 }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: .28, metalness: 1 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: .7 }),
};
const seats = [], backs = [];

function table(x, z, opt) {
  const a = opt.a || 1.55, b = opt.b || .9, g = new THREE.Group(); g.position.set(x, 0, z);
  const ped = new THREE.Mesh(G.ped, M.dark); ped.position.y = .36; ped.castShadow = true; g.add(ped);
  const body = new THREE.Mesh(G.body, M.wood); body.scale.set(a + .12, 1, b + .12); body.position.y = .76; body.castShadow = true; g.add(body);
  const felt = new THREE.Mesh(G.felt, opt.feltMat || M.felt); felt.scale.set(a, 1, b); felt.position.y = .84; felt.receiveShadow = true; g.add(felt);
  const rail = new THREE.Mesh(G.rail, M.rail); rail.rotation.x = -Math.PI / 2; rail.scale.set(a + .06, b + .06, 1); rail.position.y = .86; g.add(rail);
  // scritta stampata sul panno (nome del festival / tavolo)
  if (opt.feltText) { const p = new THREE.Mesh(new THREE.PlaneGeometry(a * 1.45, b * .95), new THREE.MeshBasicMaterial({ map: opt.feltText, transparent: true, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.y = .857; g.add(p); }
  // cinque carte coperte al centro, niente fiches (regola del progetto)
  for (let i = 0; i < 5; i++) { const cd = new THREE.Mesh(G.card, M.card); cd.position.set((i - 2) * .13, .858, b * .55); g.add(cd); }
  // lampada sopra il tavolo
  const sh = new THREE.Mesh(G.shade, M.shade); sh.position.y = 3.35; g.add(sh);
  const bl = new THREE.Mesh(G.bulb, M.bulb); bl.rotation.x = Math.PI / 2; bl.position.y = 3.2; g.add(bl);
  const cord = new THREE.Mesh(G.cord, M.brass); cord.scale.y = WALL_H - 3.5; cord.position.y = 3.5 + (WALL_H - 3.5) / 2; g.add(cord);
  // sedie (instanced alla fine)
  const n = opt.chairs || 8;
  for (let i = 0; i < n; i++) {
    const ang = (i + .5) / n * Math.PI * 2, cx = Math.cos(ang) * (a + .62), cz = Math.sin(ang) * (b + .62);
    const m1 = new THREE.Matrix4().compose(new THREE.Vector3(x + cx, .5, z + cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-cx, -cz), 0)), new THREE.Vector3(1, 1, 1));
    (opt.seats || seats).push(m1);
    const off = new THREE.Vector3(0, .34, -.24).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-cx, -cz), 0)));
    (opt.backs || backs).push(new THREE.Matrix4().compose(new THREE.Vector3(x + cx + off.x, .5 + off.y, z + cz + off.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-cx, -cz), 0)), new THREE.Vector3(1, 1, 1)));
  }
  pool(x, z, 7.5, opt.root || scene);
  (opt.root || scene).add(g);
  OBST.push({ x, z, a: a + 1.05, b: b + 1.05, tag: opt.tag });
  return { g, a, b };
}

function feltTex(name, line2) {
  const [c, x] = cv(1024, 512);
  x.textAlign = "center"; x.textBaseline = "middle";
  x.strokeStyle = "rgba(233,185,73,.35)"; x.lineWidth = 6; x.beginPath(); x.ellipse(512, 256, 470, 220, 0, 0, 7); x.stroke();
  x.font = `800 64px ${FONT}`; x.fillStyle = "rgba(236,242,238,.82)";
  const ls = wrap(x, name, 760, 2); ls.forEach((s, i) => x.fillText(s, 512, 205 + (i - (ls.length - 1) / 2) * 74));
  x.font = `700 44px ${FONT}`; x.fillStyle = "rgba(233,185,73,.9)"; x.fillText(line2, 512, 340);
  x.font = `800 30px ${FONT}`; x.fillStyle = "rgba(236,242,238,.35)"; x.fillText("YUGRIND", 512, 420);
  return tex(c);
}

// semaforo dell'affidabilità: stesse parole del sito (high = verificato, low = da verificare)
function conf(c) {
  if (c === "high") return { col: "#27A56E", t: "Verificato", d: "Date e numeri controllati sulla fonte." };
  if (c === "low") return { col: "#E8833A", t: "Da verificare", d: "Dati incompleti o discordanti tra le fonti: controlla prima di partire." };
  return { col: "#E9B949", t: "Non ancora verificato a fondo", d: "Dati presi dalle fonti ma non ancora controllati uno per uno." };
}
const AGG = D.generated ? `${D.generated.slice(8, 10)}/${D.generated.slice(5, 7)} alle ${D.generated.slice(11, 16)}` : "n.d.";
function addFestival(f, x, z, live, root, st, bk) {
  const span = `${dm(f.start_date)} – ${dm(f.end_date || f.start_date)}`;
  const t = table(x, z, { feltText: feltTex(f.festival || f.tour, span), root, seats: st, backs: bk, tag: "fest" }), cf = conf(f.confidence);
  const lab = sprite(label([
    live ? { chip: { text: "IN CORSO", color: "#EF4444", bg: "rgba(239,68,68,.16)" }, size: 30 } : { chip: { text: "DAL " + dm(f.start_date), color: "#60A5FA", bg: "rgba(96,165,250,.14)" }, size: 30 },
    { t: f.festival || f.tour, size: 46, max: 2 },
    { t: `${flag(f.country)} ${f.city || ""}`, size: 34, color: "#97A89F", weight: 500, max: 1 },
    { t: "● " + cf.t, size: 30, color: cf.col, weight: 700, max: 1 },
  ], { h: 350 }), 2.1, .72);
  lab.position.set(0, 2.15, 0); t.g.add(lab); LABELS.push({ s: lab, x, z });
  INTER.push({ id: "f:" + f.id, kind: "festival", data: f, live, ta: t.a, tb: t.b, group: t.g, center: new THREE.Vector3(x, 0, z), radius: 3.0, name: f.festival || f.tour,
    approach: from => approachRound(x, z, t.b + 1.9, from), sheet: () => sheetFestival(f, live) });
}

// file di tavoli
const COLS = [-11.2, -5.6, 0, 5.6, 11.2];
function rowX(n, i) { const span = Math.min(n, 5); const start = (5 - span) / 2; return COLS[Math.round(start + i)] ?? COLS[i % 5]; }
const ROWZ = [-4.4, 1.1, 6.6];
// cartelli delle file
function floorSign(text, color, x, z, root = scene) { const s = sprite(label([{ t: text, size: 40, color, weight: 800 }], { w: 900, h: 110, pad: 26 }), 3.2, .39); s.position.set(x, 1.55, z); root.add(s); }

// tavolo d'allenamento (gioco gratuito, senza soldi)
{
  const x = 11.2, z = 12.4, t = table(x, z, { a: 1.1, b: 1.1, chairs: 6, feltMat: M.feltT, feltText: feltTex("Allenati gratis", "senza soldi") });
  const s = sprite(label([{ t: "Tavolo d'allenamento", size: 46 }, { t: "gioco gratuito · nessun premio", size: 32, color: "#97A89F", weight: 500 }], { h: 210 }), 2.6, .53);
  s.position.set(0, 2.3, 0); t.g.add(s);
  INTER.push({ id: "train", kind: "train", group: t.g, center: new THREE.Vector3(x, 0, z), radius: 3, name: "Tavolo d'allenamento",
    approach: from => approachRound(x, z, 3, from), sheet: sheetTrain });
}

// leggio «tutto il calendario»
{
  const x = -11.2, z = 12.4, g = new THREE.Group(); g.position.set(x, 0, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.3, 8), M.brass); post.position.y = .65; g.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, .05, 20), M.brass); foot.position.y = .025; g.add(foot);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), new THREE.MeshBasicMaterial({ map: label([{ t: "Tutto il calendario", size: 70 }, { t: `${(D.festivals || []).length} festival in Europa`, size: 46, color: "#E9B949" }, { t: "data, luogo e fonte", size: 40, color: "#97A89F", weight: 500 }], { w: 640, h: 790, pad: 120 }) }));
  board.position.set(0, 1.75, 0); board.rotation.x = -.15; g.add(board);
  g.rotation.y = Math.PI / 5; scene.add(g); pool(x, z, 4);
  OBST.push({ x, z, a: .7, b: .7 });
  INTER.push({ id: "cal", kind: "cal", group: g, center: new THREE.Vector3(x, 0, z), radius: 2.6, name: "Tutto il calendario",
    approach: from => approachRound(x, z, 2.2, from), sheet: sheetCal });
}

// ---------------------------------------------------------------- tabellone di oggi
const BOARD = { x: 0, y: 3.15, z: -12.6, w: 8, h: 2.6 };
const boardCv = cv(1600, 516), boardTex = tex(boardCv[0]); let boardPage = 0;
function drawBoard() {
  const [c, x] = boardCv, W = c.width, H = c.height;
  x.fillStyle = "#050807"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#0f1a15"; x.fillRect(0, 0, W, 86);
  x.textBaseline = "middle"; x.textAlign = "left"; x.font = `800 46px ${FONT}`; x.fillStyle = "#ECF2EE";
  x.fillText("OGGI NELLE SALE", 40, 44);
  x.textAlign = "right"; x.font = `600 34px ui-monospace, Menlo, monospace`; x.fillStyle = "#97A89F";
  const pages = Math.max(1, Math.ceil(tonight.length / 6));
  x.fillText(`${dm(ymd("Europe/Rome"))} · ${tonight.length} in programma${pages > 1 ? ` · ${boardPage + 1}/${pages}` : ""}`, W - 40, 44);
  if (!tonight.length) { x.textAlign = "center"; x.font = `600 44px ${FONT}`; x.fillStyle = "#97A89F"; x.fillText("Oggi le nostre fonti non segnano tornei nelle sale.", W / 2, 290); boardTex.needsUpdate = true; return; }
  const rows = tonight.slice(boardPage * 6, boardPage * 6 + 6);
  rows.forEach((r, i) => {
    const y = 128 + i * 66, v = VENUE[r.venue_id] || {};
    x.fillStyle = i % 2 ? "#0a120f" : "#060b09"; x.fillRect(0, y - 31, W, 62);
    x.textAlign = "left"; x.font = `700 38px ui-monospace, Menlo, monospace`; x.fillStyle = "#60A5FA"; x.fillText(r.time || "--:--", 40, y);
    x.font = `700 36px ${FONT}`; x.fillStyle = "#ECF2EE"; let nm = r.name || ""; while (x.measureText(nm).width > 640 && nm.length) nm = nm.slice(0, -1); x.fillText(nm + (nm !== (r.name || "") ? "…" : ""), 190, y);
    x.font = `500 32px ${FONT}`; x.fillStyle = "#97A89F"; let vn = `${flag(v.country)} ${v.venue || ""}`; while (x.measureText(vn).width > 440 && vn.length) vn = vn.slice(0, -1); x.fillText(vn, 860, y);
    x.textAlign = "right"; x.font = `700 36px ui-monospace, Menlo, monospace`; x.fillStyle = "#E9B949"; x.fillText(r.buy_in_eur != null ? eur(r.buy_in_eur) : (r.buy_in_text || "n.d."), W - 40, y);
  });
  boardTex.needsUpdate = true;
}
drawBoard();
setInterval(() => { const pages = Math.ceil(tonight.length / 6); if (pages > 1) { boardPage = (boardPage + 1) % pages; drawBoard(); } }, 7000);
{
  const g = new THREE.Group(); g.position.set(BOARD.x, BOARD.y, BOARD.z);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + .3, BOARD.h + .3, .18), M.dark); frame.position.z = -.1; g.add(frame);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + .42, .06, .2), M.brass); trim.position.set(0, BOARD.h / 2 + .17, -.08); g.add(trim);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })); g.add(scr);
  for (const sx of [-BOARD.w / 2 + .6, BOARD.w / 2 - .6]) { const ch = new THREE.Mesh(G.cord, M.brass); ch.scale.y = WALL_H - BOARD.y - BOARD.h / 2; ch.position.set(sx, BOARD.h / 2 + ch.scale.y / 2, -.1); g.add(ch); }
  scene.add(g);
  INTER.push({ id: "board", kind: "board", group: g, center: new THREE.Vector3(0, 0, BOARD.z), radius: 0, name: "Il tabellone di oggi",
    approach: () => ({ x: 0, z: -7.4, yaw: 0, pitch: .2 }), sheet: sheetBoard, near: p => p.z < -6.9 && p.z > -12.3 && Math.abs(p.x) < 4 });
}

// ---------------------------------------------------------------- porte d'Europa (una per paese)
{
  const n = COUNTRIES.length, step = Math.min(2.05, 27.5 / Math.max(1, n)), x0 = -step * (n - 1) / 2;
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: .6 });
  COUNTRIES.forEach((cc, i) => {
    const x = x0 + i * step, z = -RZ + .05, g = new THREE.Group(); g.position.set(x, 0, z);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.32, 2.5, .12), M.brass); fr.position.set(0, 1.25, .02); g.add(fr);
    const dr = new THREE.Mesh(new THREE.BoxGeometry(1.14, 2.36, .14), doorMat); dr.position.set(0, 1.18, .05); g.add(dr);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), M.brass); kn.position.set(.42, 1.1, .14); g.add(kn);
    const vs = byCountry[cc];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .62), new THREE.MeshBasicMaterial({ map: label([{ t: flag(cc), size: 70, gap: 0 }, { t: country(cc), size: 44, max: 1 }, { t: vs.length === 1 ? "1 sala" : vs.length + " sale", size: 32, color: "#E9B949" }], { w: 480, h: 300, pad: 18 }), transparent: true }));
    sign.position.set(0, 2.92, .1); g.add(sign);
    scene.add(g);
    INTER.push({ id: "c:" + cc, kind: "country", group: g, center: new THREE.Vector3(x, 0, z), radius: 2.4, name: `${flag(cc)} ${country(cc)}`,
      approach: () => ({ x, z: -12.9, yaw: 0, pitch: .12 }), sheet: () => sheetCountry(cc), near: p => p.z < -12.4 && Math.abs(p.x - x) < step / 2 });
  });
}
// porta dei «Tavoli tra amici» (Acid River, POKER_ROOM): per ora chiusa, si apre quando quella sala sarà online.
// Regole già decise: fiches finte, niente soldi né premi né fiches in vendita, solo per iscritti.
{
  const x = 10.15, z = RZ - .05, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI;
  const fr = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.9, .12), M.brass); fr.position.y = 1.45; g.add(fr);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.8, .14), new THREE.MeshStandardMaterial({ color: 0x24123a, roughness: .5 })); dr.position.set(0, 1.4, .04); g.add(dr);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .55), new THREE.MeshBasicMaterial({ map: label([{ t: "Tavoli tra amici", size: 54, color: "#c9a6ff" }, { t: "in arrivo", size: 34, color: "#97A89F", weight: 600 }], { w: 900, h: 220, pad: 28, border: "rgba(167,139,250,.9)" }), transparent: true, toneMapped: false }));
  neon.position.set(0, 3.3, .1); g.add(neon);
  scene.add(g);
  INTER.push({ id: "amici", kind: "amici", group: g, center: new THREE.Vector3(x, 0, z), radius: 2.4, name: "Tavoli tra amici",
    approach: () => ({ x, z: 14.6, yaw: Math.PI, pitch: .05 }), sheet: sheetAmici, near: p => p.z > 14.9 && Math.abs(p.x - x) < 1.6 });
}
// uscita (porta sud)
{
  const g = new THREE.Group(); g.position.set(0, 0, RZ - .05); g.rotation.y = Math.PI;
  const fr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.9, .12), M.brass); fr.position.y = 1.45; g.add(fr);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, .14), M.dark); dr.position.set(0, 1.4, .04); g.add(dr);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .5), new THREE.MeshBasicMaterial({ map: label([{ t: "Uscita · versione semplice", size: 46 }], { w: 900, h: 120, pad: 30 }), transparent: true }));
  s.position.set(0, 3.25, .1); g.add(s); scene.add(g);
  INTER.push({ id: "exit", kind: "exit", group: g, center: new THREE.Vector3(0, 0, RZ), radius: 2.2, name: "Uscita",
    approach: () => ({ x: 0, z: 14.8, yaw: Math.PI, pitch: 0 }), sheet: sheetExit, near: p => p.z > 15.2 && Math.abs(p.x) < 2 });
}

// finestre sul mare, in stile Malta, al tramonto: un panorama unico per lato (ovest la città sui bastioni, est il mare aperto).
// Tutto disegnato qui: nessuna foto, nessun luogo riconoscibile copiato.
function panorama(kind) {
  const W = 2048, H = 900, [c, x] = cv(W, H); let r = kind === "citta" ? 5 : 17; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const hz = 560, sunX = kind === "citta" ? 1460 : 520;
  const sky = x.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, "#1f3566"); sky.addColorStop(.45, "#6a5a8e"); sky.addColorStop(.75, "#f09a5c"); sky.addColorStop(1, "#ffd59a");
  x.fillStyle = sky; x.fillRect(0, 0, W, hz);
  const glow = x.createRadialGradient(sunX, hz - 30, 10, sunX, hz - 30, 420); glow.addColorStop(0, "rgba(255,236,190,.95)"); glow.addColorStop(.2, "rgba(255,190,120,.5)"); glow.addColorStop(1, "rgba(255,160,90,0)");
  x.fillStyle = glow; x.fillRect(0, 0, W, hz);
  x.fillStyle = "#fff4d6"; x.beginPath(); x.arc(sunX, hz - 34, 34, 0, 7); x.fill();
  for (let i = 0; i < 9; i++) { const cx = rnd() * W, cy = 80 + rnd() * 260, w = 120 + rnd() * 260; x.fillStyle = `rgba(255,${150 + rnd() * 60},${140 + rnd() * 50},.35)`; for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(cx + k * w / 6 - w / 2, cy + Math.sin(k * 1.3) * 8, w / 5, 14, 0, 0, 7); x.fill(); } }
  if (kind === "citta") {
    // colline lontane, poi la città color miele sui bastioni
    x.fillStyle = "#b98a6a"; x.beginPath(); x.moveTo(0, hz); for (let px = 0; px <= W; px += 40) x.lineTo(px, hz - 40 - Math.sin(px / 210) * 18 - rnd() * 6); x.lineTo(W, hz); x.fill();
    const base = hz + 6;
    for (let px = 0; px < W;) { const w = 26 + rnd() * 60, h = 40 + rnd() * 90; const lit = x.createLinearGradient(px, 0, px + w, 0); lit.addColorStop(0, "#d9b077"); lit.addColorStop(1, "#b9905a");
      x.fillStyle = lit; x.fillRect(px, base - 70 - h, w, h + 70);
      x.fillStyle = "rgba(60,40,25,.35)"; for (let wy = base - 60 - h + 14; wy < base - 70; wy += 22) for (let wx = px + 6; wx < px + w - 8; wx += 14) x.fillRect(wx, wy, 6, 10);
      if (rnd() < .25) { x.fillStyle = ["#2f6db0", "#2e8b57", "#b23a2e"][Math.floor(rnd() * 3)]; x.fillRect(px + 4, base - 70 - h + 30, w - 8, 14); } // balconi in legno colorati
      px += w; }
    for (const dx of [380, 940, 1210, 1700]) { // cupole e campanili
      x.fillStyle = "#c79a5e"; x.fillRect(dx - 46, base - 230, 92, 150); x.beginPath(); x.ellipse(dx, base - 230, 46, 58, 0, Math.PI, 0); x.fill();
      x.fillStyle = "#a9875a"; x.fillRect(dx - 7, base - 316, 14, 34); x.beginPath(); x.moveTo(dx - 10, base - 316); x.lineTo(dx, base - 340); x.lineTo(dx + 10, base - 316); x.fill();
      x.fillStyle = "#cfa468"; x.fillRect(dx + 60, base - 260, 30, 180); x.beginPath(); x.moveTo(dx + 56, base - 260); x.lineTo(dx + 75, base - 300); x.lineTo(dx + 94, base - 260); x.fill(); }
    x.fillStyle = "#a07a4a"; x.beginPath(); x.moveTo(0, base - 60); for (let px = 0; px <= W; px += 160) { x.lineTo(px + 30, base - 66); x.lineTo(px + 130, base - 66); x.lineTo(px + 160, base - 60); } x.lineTo(W, base + 22); x.lineTo(0, base + 22); x.fill(); // bastioni
    x.fillStyle = "rgba(255,214,140,.9)"; for (let i = 0; i < 70; i++) { x.beginPath(); x.arc(rnd() * W, base - 80 - rnd() * 120, 1.8, 0, 7); x.fill(); }
  } else {
    x.fillStyle = "#8f7a8e"; x.beginPath(); x.moveTo(1150, hz); for (let px = 1150; px <= 1950; px += 30) x.lineTo(px, hz - 30 - Math.sin((px - 1150) / 800 * Math.PI) * 70 - rnd() * 5); x.lineTo(1950, hz); x.fill(); // un'isola lontana
    x.fillStyle = "#e9e1cf"; x.fillRect(1820, hz - 120, 18, 80); x.fillStyle = "#c0392b"; x.fillRect(1820, hz - 132, 18, 14); x.fillStyle = "rgba(255,240,180,.9)"; x.beginPath(); x.arc(1829, hz - 125, 6, 0, 7); x.fill(); // faro
    for (const bx of [300, 860, 1500]) { x.fillStyle = "#f1ece0"; x.beginPath(); x.moveTo(bx, hz - 6); x.lineTo(bx + 34, hz - 6); x.lineTo(bx + 4, hz - 70); x.fill(); x.fillStyle = "#3b2a20"; x.fillRect(bx - 8, hz - 6, 52, 6); } // vele
  }
  const sea = x.createLinearGradient(0, hz, 0, H); sea.addColorStop(0, "#c98a73"); sea.addColorStop(.12, "#3b6f9a"); sea.addColorStop(1, "#123a63");
  x.fillStyle = sea; x.fillRect(0, hz + (kind === "citta" ? 28 : 0), W, H);
  for (let i = 0; i < 900; i++) { const y = hz + 30 + rnd() * (H - hz - 30), w = 6 + rnd() * 40 * (y - hz) / 300, near = Math.abs(rnd() * W - sunX);
    const xx = sunX + (rnd() - .5) * (60 + (y - hz) * 1.4); x.fillStyle = `rgba(255,${200 + rnd() * 50},150,${.5 * rnd()})`; x.fillRect(xx, y, w, 2); void near; }
  for (let i = 0; i < 500; i++) { const y = hz + 30 + rnd() * (H - hz - 30); x.fillStyle = `rgba(255,255,255,${.06 + rnd() * .14})`; x.fillRect(rnd() * W, y, 6 + rnd() * 30, 2); }
  for (let i = 0; i < (kind === "citta" ? 4 : 2); i++) { const bx = 100 + rnd() * 1800, by = hz + 120 + rnd() * 200, s = .8 + (by - hz) / 300; // barche da pescatori colorate
    x.fillStyle = "#e0b62a"; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + 90 * s, by); x.lineTo(bx + 76 * s, by + 18 * s); x.lineTo(bx + 12 * s, by + 18 * s); x.fill();
    x.fillStyle = "#1d6fc0"; x.fillRect(bx + 8 * s, by + 6 * s, 74 * s, 5 * s); x.fillStyle = "#c0392b"; x.fillRect(bx + 8 * s, by + 11 * s, 74 * s, 3 * s);
    x.fillStyle = "#f4f1ea"; x.beginPath(); x.arc(bx + 14 * s, by + 5 * s, 3 * s, 0, 7); x.fill(); }
  const t = tex(c); t.wrapS = THREE.ClampToEdgeWrapping; return t;
}
{
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9bf86, roughness: .85 });
  const shutter = new THREE.MeshStandardMaterial({ color: 0x2e6b4a, roughness: .7 });
  const archG = new THREE.TorusGeometry(.78, .09, 8, 24, Math.PI), winG = new THREE.PlaneGeometry(1.56, 3.12);
  const PAN = { [-1]: panorama("citta"), [1]: panorama("mare") }, ZS = [-9.5, -1.7, 4, 9.8], FR = .2;
  const cornerG = (() => { const sh = new THREE.Shape(); sh.moveTo(-.79, 3.72); sh.lineTo(-.79, 4.51); sh.lineTo(.79, 4.51); sh.lineTo(.79, 3.72); sh.absarc(0, 3.72, .78, 0, Math.PI, false); return new THREE.ShapeGeometry(sh, 24); })();
  for (const side of [-1, 1]) ZS.forEach((z, i) => {
    const g = new THREE.Group(); g.position.set(side * (RX - .04), 0, z); g.rotation.y = -side * Math.PI / 2;
    const t = PAN[side].clone(); t.needsUpdate = true; t.repeat.set(FR, 1);
    const k = side === -1 ? (z + RZ) / (2 * RZ) : 1 - (z + RZ) / (2 * RZ); t.offset.set(k * (1 - FR), 0);
    const view = new THREE.Mesh(winG, new THREE.MeshBasicMaterial({ map: t, toneMapped: false, fog: false })); view.position.set(0, 2.94, .01); g.add(view);
    const mask = new THREE.Mesh(cornerG, wallMat); mask.position.z = .015; g.add(mask);
    for (const sx of [-.86, .86]) { const j = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.6, .2), stone); j.position.set(sx, 2.5, .05); g.add(j); }
    const arch = new THREE.Mesh(archG, stone); arch.position.set(0, 3.72, .05); g.add(arch);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.95, .12, .34), stone); sill.position.set(0, 1.32, .12); g.add(sill);
    const mull = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.34, .05), shutter); mull.position.set(0, 2.55, .04); g.add(mull);
    for (const sx of [-1.12, 1.12]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(.42, 2.4, .05), shutter); sh.position.set(sx, 2.55, .06); g.add(sh); }
    scene.add(g);
  });
  // colonne in pietra con capitello dorato e applique accese, tra una finestra e l'altra
  const colG = new THREE.BoxGeometry(.7, WALL_H, .3), capG = new THREE.BoxGeometry(.86, .22, .4), baseG = new THREE.BoxGeometry(.84, .3, .38), scG = new THREE.CylinderGeometry(.12, .07, .26, 14, 1, true);
  const scM = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false, side: THREE.DoubleSide });
  const cols = [];
  for (const side of [-1, 1]) for (const z of [-13.4, -5.6, 1.15, 6.9, 13.2]) cols.push([side * (RX - .15), z, side]);
  for (const x of [-12.8, -7.5, -3.6, 3.6, 7.5, 12.8]) cols.push([x, RZ - .15, 0]);
  for (const [x, z, side] of cols) {
    const g = new THREE.Group(); g.position.set(x, 0, z); if (side) g.rotation.y = -side * Math.PI / 2; else g.rotation.y = Math.PI;
    const c = new THREE.Mesh(colG, stone); c.position.y = WALL_H / 2; c.castShadow = false; g.add(c);
    const cp = new THREE.Mesh(capG, M.brass); cp.position.y = WALL_H - .3; g.add(cp);
    const bs = new THREE.Mesh(baseG, stone); bs.position.y = .15; g.add(bs);
    const sc = new THREE.Mesh(scG, scM); sc.position.set(0, 2.95, .26); g.add(sc);
    scene.add(g);
  }
  // palme in vaso (mediterraneo)
  const potG = new THREE.CylinderGeometry(.36, .26, .6, 18), trunkG = new THREE.CylinderGeometry(.06, .1, 1.9, 8), leafG = new THREE.ConeGeometry(.16, 1.3, 4, 1);
  const potM = new THREE.MeshStandardMaterial({ color: 0xb4643c, roughness: .8 }), trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .9 }), leafM = new THREE.MeshStandardMaterial({ color: 0x2f7a3e, roughness: .7, side: THREE.DoubleSide });
  for (const [x, z] of [[-13.6, 15.6], [13.6, 15.6], [-2.9, 16], [2.9, 16], [-13.6, -15.3], [13.6, -15.3]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pot = new THREE.Mesh(potG, potM); pot.position.y = .3; pot.castShadow = true; g.add(pot);
    const tr = new THREE.Mesh(trunkG, trunkM); tr.position.y = 1.5; tr.rotation.z = .06; g.add(tr);
    for (let i = 0; i < 9; i++) { const lf = new THREE.Mesh(leafG, leafM); const a = i / 9 * Math.PI * 2; lf.position.set(Math.cos(a) * .5, 2.35, Math.sin(a) * .5); lf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25); lf.scale.set(1, 1, .18); lf.castShadow = true; g.add(lf); }
    scene.add(g); OBST.push({ x, z, a: .55, b: .55 });
  }
}

// sedie: due InstancedMesh per tutte le sedie della sala
{ const s = new THREE.InstancedMesh(G.seat, M.chair, seats.length), b = new THREE.InstancedMesh(G.back, M.chair, backs.length);
  seats.forEach((m, i) => s.setMatrixAt(i, m)); backs.forEach((m, i) => b.setMatrixAt(i, m)); s.castShadow = b.castShadow = true; scene.add(s, b); }

// lampadari lungo il corridoio centrale
for (const [lx, z] of [[-6, 10], [6, 10], [-6, 14.5], [6, 14.5]]) { const sh = new THREE.Mesh(G.shade, M.shade); sh.position.set(lx, 3.6, z); scene.add(sh); const bl = new THREE.Mesh(G.bulb, M.bulb); bl.rotation.x = Math.PI / 2; bl.position.set(lx, 3.45, z); scene.add(bl); pool(lx, z, 6); }

function approachRound(x, z, d, from) {
  let dx = from.x - x, dz = from.z - z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const px = x + dx * d, pz = z + dz * d;
  return { x: THREE.MathUtils.clamp(px, -RX + .8, RX - .8), z: THREE.MathUtils.clamp(pz, -RZ + 1, RZ - 1), lookAt: { x, z }, pitch: -.18 };
}

// ---------------------------------------------------------------- persone: proporzioni realistiche, look urbano.
// Disegnate qui da zero: nessun personaggio, aspetto o marchio di giochi esistenti.
const LOOK = {
  skin: ["#f1d0b5", "#e0ac86", "#c68a5e", "#9a6440", "#6b4128"],
  hair: ["corti", "indietro", "lunghi", "ricci", "rasati", "coda"],
  hairC: ["#1d1410", "#4a2e1a", "#8a5a2b", "#c9a15a", "#9a9a9a", "#7a2418"],
  outfit: ["completo", "pelle", "felpa", "camicia", "polo"],
  top: ["#1b1b1f", "#2d3a52", "#6b1f2a", "#e9e4d8", "#1f5a3f", "#8a6a2c", "#3b2a4f", "#c94f2c"],
  pants: ["#1a1a1d", "#2b3550", "#4a3a2a", "#6e6a63", "#d8d2c4"],
};
const OUTFIT_NAMES = { completo: "Completo", pelle: "Giacca di pelle", felpa: "Felpa", camicia: "Camicia a fiori", polo: "Polo" };
const matCache = {};
function mat(c, o = {}) { const k = c + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .7 }, o))); }
function flowersTex(base) { // camicia a fiori: disegno nostro
  const [c, x] = cv(256, 256); x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  let r = 3; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 26; i++) { const cx = rnd() * 256, cy = rnd() * 256, s = 8 + rnd() * 12, col = ["#f4e6c8", "#e94f6a", "#ffcf4a", "#2fb38a"][i % 4];
    x.fillStyle = "#1d6b4a"; x.beginPath(); x.ellipse(cx + s, cy + s * .3, s * .9, s * .35, .6, 0, 7); x.fill();
    x.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * s * .55, cy + Math.sin(a) * s * .55, s * .5, s * .3, a, 0, 7); x.fill(); }
    x.fillStyle = "#7a2418"; x.beginPath(); x.arc(cx, cy, s * .22, 0, 7); x.fill(); }
  const t = tex(c, [2, 2]); return t;
}
const TORSO = (() => { const pts = [[.135, 0], [.15, .08], [.165, .18], [.185, .28], [.2, .36], [.19, .41], [.13, .45], [.06, .47]].map(([x, y]) => new THREE.Vector2(x, y)); return new THREE.LatheGeometry(pts, 22); })();
const PG = {
  thigh: new THREE.CapsuleGeometry(.085, .32, 4, 12), shin: new THREE.CapsuleGeometry(.066, .32, 4, 12),
  shoe: new THREE.CapsuleGeometry(.055, .17, 4, 10), pelvis: new THREE.CylinderGeometry(.14, .155, .2, 22), belt: new THREE.CylinderGeometry(.16, .16, .045, 20),
  vshirt: new THREE.ConeGeometry(.1, .28, 3), tie: new THREE.BoxGeometry(.05, .28, .015), lapel: new THREE.BoxGeometry(.05, .24, .015),
  hood: new THREE.TorusGeometry(.12, .045, 8, 16, Math.PI), pocket: new THREE.BoxGeometry(.2, .1, .02), collar: new THREE.TorusGeometry(.085, .02, 6, 16),
  upper: new THREE.CapsuleGeometry(.07, .2, 4, 12), fore: new THREE.CapsuleGeometry(.056, .19, 4, 12), cuff: new THREE.CylinderGeometry(.064, .064, .05, 12),
  hand: new THREE.SphereGeometry(.05, 12, 10), neck: new THREE.CylinderGeometry(.055, .062, .1, 12),
  skull: new THREE.SphereGeometry(.112, 24, 18), jaw: new THREE.SphereGeometry(.092, 20, 14), nose: new THREE.ConeGeometry(.02, .055, 8), ear: new THREE.SphereGeometry(.03, 10, 8),
  eyeW: new THREE.SphereGeometry(.018, 10, 8), iris: new THREE.SphereGeometry(.0095, 8, 6), brow: new THREE.BoxGeometry(.045, .01, .012), mouth: new THREE.BoxGeometry(.045, .008, .01),
  hairTop: new THREE.SphereGeometry(.12, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.85), hairBack: new THREE.BoxGeometry(.22, .3, .06), side: new THREE.BoxGeometry(.02, .07, .06),
  curl: new THREE.SphereGeometry(.045, 8, 6), brim: new THREE.BoxGeometry(.2, .014, .13), lens: new THREE.CircleGeometry(.026, 14), bridge: new THREE.BoxGeometry(.03, .006, .006),
  beard: new THREE.SphereGeometry(.094, 16, 10, 0, Math.PI * 2, Math.PI / 2.1, Math.PI / 2.2), stache: new THREE.BoxGeometry(.06, .014, .02), chain: new THREE.TorusGeometry(.075, .006, 6, 24),
};
function person(o) {
  const out = o.outfit || "completo", g = new THREE.Group();
  const skin = mat(o.skin, { roughness: .5 }), pants = mat(o.pants, { roughness: .75 }), hair = mat(o.hairC, { roughness: .8 });
  const top = out === "pelle" ? mat(o.top === "#e9e4d8" ? "#2a1c14" : o.top, { roughness: .32, metalness: .05 })
    : out === "camicia" ? (matCache["fl" + o.top] || (matCache["fl" + o.top] = new THREE.MeshStandardMaterial({ map: flowersTex(o.top), roughness: .6 })))
    : mat(o.top, { roughness: out === "felpa" ? .9 : .6 });
  const shoes = mat(out === "felpa" || out === "polo" ? "#efefea" : "#14100e", { roughness: .35 });
  const add = (geo, m, x, y, z, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
  const legs = [];
  for (const sx of [-.1, .1]) {
    const hip = new THREE.Group(); hip.position.set(sx, .94, 0); g.add(hip);
    add(PG.thigh, pants, 0, -.24, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -.48; hip.add(knee);
    add(PG.shin, pants, 0, -.21, 0, knee);
    const sh = add(PG.shoe, shoes, 0, -.44, -.05, knee); sh.rotation.x = Math.PI / 2;
    legs.push({ hip, knee });
  }
  const pel = add(PG.pelvis, pants, 0, .92, 0); pel.scale.set(1, 1, .68);
  const spine = new THREE.Group(); spine.position.y = 1.0; g.add(spine);
  const tor = add(TORSO, top, 0, 0, 0, spine); tor.scale.set(1, 1, .64);
  if (out !== "felpa") { const b = add(PG.belt, mat("#2a1a10", { roughness: .4 }), 0, .01, 0, spine); b.scale.z = .66; }
  // davanti: camicia, cravatta, risvolti, cappuccio, tasca
  if (out === "completo" || out === "pelle") {
    const v = add(PG.vshirt, mat(out === "pelle" ? "#e9e6df" : (o.shirt || "#f2efe8")), 0, .33, -.122, spine); v.rotation.set(Math.PI, 0, 0); v.scale.set(1, 1, .2);
    for (const sx of [-1, 1]) { const l = add(PG.lapel, out === "pelle" ? top : mat(o.top, { roughness: .45 }), sx * .085, .33, -.13, spine); l.rotation.z = sx * .32; }
    if (out === "completo" && o.tie !== false) add(PG.tie, mat(o.tieC || "#8a1d24", { roughness: .4 }), 0, .27, -.131, spine);
  }
  if (out === "felpa") { const h = add(PG.hood, top, 0, .43, .07, spine); h.rotation.x = -.4; add(PG.pocket, top, 0, .12, -.122, spine); }
  if (out === "polo") { const c = add(PG.collar, top, 0, .455, -.01, spine); c.rotation.x = Math.PI / 2; c.scale.set(1.1, 1, 1); }
  if (o.chain) { const c = add(PG.chain, mat("#e2b94a", { roughness: .2, metalness: 1 }), 0, .43, -.04, spine); c.rotation.x = Math.PI / 2.6; }
  const shortSleeve = out === "camicia" || out === "polo", arms = [];
  for (const sx of [-.235, .235]) {
    const sh = new THREE.Group(); sh.position.set(sx, .41, 0); spine.add(sh);
    add(PG.upper, top, 0, -.15, 0, sh);
    const el = new THREE.Group(); el.position.y = -.29; sh.add(el);
    add(PG.fore, shortSleeve ? skin : top, 0, -.13, 0, el);
    if (out === "completo") add(PG.cuff, mat(o.shirt || "#f2efe8"), 0, -.24, 0, el);
    const hd = add(PG.hand, skin, 0, -.29, -.005, el); hd.scale.set(.85, 1.25, .62);
    arms.push({ sh, el });
  }
  add(PG.neck, skin, 0, .51, 0, spine);
  const head = new THREE.Group(); head.position.y = .67; spine.add(head);
  const sk = add(PG.skull, skin, 0, 0, 0, head); sk.scale.set(.95, 1.1, 1.04);
  const jw = add(PG.jaw, skin, 0, -.06, -.012, head); jw.scale.set(.9, .72, .95);
  const ns = add(PG.nose, skin, 0, -.02, -.112, head); ns.rotation.x = -Math.PI / 2.4;
  for (const ex of [-.108, .108]) { const e = add(PG.ear, skin, ex, -.01, .005, head); e.scale.set(.45, 1, .8); }
  for (const ex of [-.04, .04]) { add(PG.eyeW, mat("#f4f1ea", { roughness: .2 }), ex, .012, -.096, head); add(PG.iris, mat("#2a1d14", { roughness: .1 }), ex, .012, -.112, head);
    const br = add(PG.brow, hair, ex, .045, -.106, head); br.rotation.z = ex > 0 ? -.12 : .12; }
  add(PG.mouth, mat("#9a5148", { roughness: .5 }), 0, -.075, -.1, head);
  const hs = o.hair || "corti";
  if (hs !== "rasati") { const h = add(PG.hairTop, hair, 0, .022, .008, head); h.scale.set(1.0, hs === "indietro" ? .95 : 1.04, 1.07); if (hs === "indietro") h.rotation.x = .18;
    for (const sx of [-.106, .106]) add(PG.side, hair, sx, -.005, .02, head); }
  else { const h = add(PG.hairTop, mat(o.hairC, { roughness: 1, transparent: true, opacity: .45 }), 0, .012, .006, head); h.scale.set(.99, 1.0, 1.03); }
  if (hs === "lunghi") add(PG.hairBack, hair, 0, -.12, .09, head);
  if (hs === "coda") { const c = add(PG.curl, hair, 0, -.04, .13, head); c.scale.set(1, 1.8, 1); }
  if (hs === "ricci") for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; add(PG.curl, hair, Math.cos(a) * .095, .09 + Math.sin(i * 1.7) * .015, Math.sin(a) * .095, head); }
  if (o.beard) { const b = add(PG.beard, hair, 0, -.052, -.008, head); b.scale.set(.98, .9, 1.02); }
  if (o.stache) add(PG.stache, hair, 0, -.058, -.105, head);
  if (o.cap) { const c = add(PG.hairTop, mat(o.capC || "#1F8A5B", { roughness: .55 }), 0, .035, .004, head); c.scale.set(1.09, 1.0, 1.1); add(PG.brim, mat(o.capC || "#1F8A5B", { roughness: .55 }), 0, .04, -.165, head); }
  if (o.glasses) { const gl = mat("#0a0a0a", { roughness: .05, metalness: .9 });
    for (const ex of [-.042, .042]) { const l = add(PG.lens, gl, ex, .012, -.118, head); l.rotation.y = Math.PI; }
    add(PG.bridge, mat("#c9a043", { metalness: 1, roughness: .3 }), 0, .02, -.12, head); }
  return { g, legs, arms, spine, head };
}
function seat(p) { // posa seduta, braccia sul tavolo
  p.g.position.y = -.34;
  for (const l of p.legs) { l.hip.rotation.x = Math.PI / 2; l.knee.rotation.x = -Math.PI / 2; }
  for (const a of p.arms) { a.sh.rotation.x = .8; a.el.rotation.x = .7; }
  p.spine.rotation.x = -.08;
}
function pose(p, t, k, run, idle) { // k = 0 fermo, 1 passo pieno; run = 0..1
  const amp = .5 + .25 * run, s = Math.sin(t) * amp * k;
  p.legs[0].hip.rotation.x = s; p.legs[1].hip.rotation.x = -s;
  p.legs[0].knee.rotation.x = -Math.max(0, -Math.sin(t)) * (.7 + .5 * run) * k; p.legs[1].knee.rotation.x = -Math.max(0, Math.sin(t)) * (.7 + .5 * run) * k;
  p.arms[0].sh.rotation.x = -s * (.8 + .4 * run); p.arms[1].sh.rotation.x = s * (.8 + .4 * run);
  p.arms[0].el.rotation.x = p.arms[1].el.rotation.x = (.2 + .9 * run) * k + .1;
  p.arms[0].sh.rotation.z = -.06; p.arms[1].sh.rotation.z = .06;
  p.spine.rotation.x = -(.04 + .14 * run) * k; p.spine.position.y = 1.0 + Math.abs(Math.cos(t)) * .025 * k + Math.sin(idle * 1.6) * .004 * (1 - k);
  p.spine.rotation.y = Math.sin(t) * .06 * k;
}
// ---------------------------------------------------------------- persone vere (modelli 3D con scheletro e animazioni)
// Corpi, acconciature e animazioni: Quaternius, licenza CC0 (vedi modelli/CREDITI.txt). Personaggi originali: nessun aspetto
// preso da giochi esistenti. I vestiti li coloriamo noi, zona per zona, in base all'osso che muove ogni punto del corpo:
// così seguono il corpo quando cammina o si siede. Finché i modelli non sono caricati (o se il caricamento fallisce)
// restano le persone disegnate qui sopra.
const HUM = { ready: false, base: {}, hair: {}, skin: {}, clips: [] };
const HAIRFILE = { corti: "Hair_SimpleParted", indietro: "Hair_SimpleParted", rasati: "Hair_Buzzed", ricci: "Hair_Buzzed", lunghi: "Hair_Long", coda: "Hair_Buns" };
const REG = { pelle: 0, giacca: 1, pantaloni: 2, scarpe: 3, avambraccio: 4 };
function regionOfBone(n) {
  if (/hand|thumb|index|middle|ring|pinky/i.test(n)) return REG.pelle;
  if (/neck|head/i.test(n)) return REG.pelle;
  if (/foot|ball/i.test(n)) return REG.scarpe;
  if (/thigh|calf|pelvis|root/i.test(n)) return REG.pantaloni;
  if (/lowerarm/i.test(n)) return REG.avambraccio;
  return REG.giacca; // spine, clavicle, upperarm
}
function addRegions(mesh) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = g.attributes.position.count, reg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    reg[i] = regionOfBone(mesh.skeleton.bones[best].name);
  }
  g.setAttribute("aReg", new THREE.BufferAttribute(reg, 1));
}
const OUTFIT = { // per stile: maniche lunghe o corte, ruvidezza della stoffa, scarpe
  completo: { sleeve: 1, rough: .62, shoes: "#0d0b0a", pantsFromTop: true },
  pelle: { sleeve: 1, rough: .3, shoes: "#0d0b0a" },
  felpa: { sleeve: 1, rough: .95, shoes: "#ececea" },
  camicia: { sleeve: 0, rough: .7, shoes: "#5a3a22" },
  polo: { sleeve: 0, rough: .8, shoes: "#ececea" },
};
function bodyMaterial(src, L, female) {
  const m = src.clone(), o = OUTFIT[L.outfit] || OUTFIT.completo, dark = LOOK.skin.indexOf(L.skin) >= 3;
  m.map = HUM.skin[(female ? "donna" : "uomo") + (dark ? "_scura" : "_chiara")] || m.map;
  const tint = new THREE.Color(L.skin || "#e0ac86"), base = new THREE.Color(dark ? "#9a6440" : "#e0ac86");
  const U = {
    uTop: { value: new THREE.Color(L.top || "#1b1b1f") }, uPants: { value: new THREE.Color(o.pantsFromTop ? (L.top || "#1b1b1f") : (L.pants || "#1a1a1d")) },
    uShoes: { value: new THREE.Color(o.shoes) }, uSleeve: { value: o.sleeve }, uRough: { value: o.rough },
    uSkin: { value: new THREE.Color(tint.r / base.r, tint.g / base.g, tint.b / base.b) },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = "attribute float aReg;\nvarying float vReg;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvReg = aReg;");
    sh.fragmentShader = "uniform vec3 uTop, uPants, uShoes, uSkin; uniform float uSleeve, uRough;\nvarying float vReg;\nfloat isCloth = 0.0;\n" + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
        float r = floor(vReg + .5);
        vec3 cloth = r < 1.5 ? uTop : (r < 2.5 ? uPants : (r < 3.5 ? uShoes : uTop));
        isCloth = (r > .5 && !(r > 3.5 && uSleeve < .5)) ? 1.0 : 0.0;
        float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
        diffuseColor.rgb = mix(clamp(diffuseColor.rgb * uSkin, 0., 1.), cloth * (.7 + .6 * lum), isCloth);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uRough, isCloth);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, isCloth * .75));");
  };
  m.customProgramCacheKey = () => "yg-body";
  m.normalScale = new THREE.Vector2(.8, .8);
  return m;
}
function attachHair(root, file, color) {
  const src = HUM.hair[file]; if (!src) return;
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  src.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const nb = o.skeleton.bones.map(b => bones[b.name]); if (nb.some(b => !b)) return;
    const mesh = new THREE.SkinnedMesh(o.geometry, o.material.clone()); mesh.material.color.set(color); mesh.castShadow = true; mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(new THREE.Skeleton(nb, o.skeleton.boneInverses.map(m2 => m2.clone())), new THREE.Matrix4());
  });
}
// una persona vera: { g (gruppo da muovere e girare), mixer, play(nome animazione) }
function human(L, opts = {}) {
  const female = L.corpo === "donna", src = HUM.base[female ? "donna" : "uomo"];
  const inner = SkeletonUtils.clone(src); inner.rotation.y = Math.PI; // i modelli guardano +Z, la sala usa -Z come «avanti»
  inner.traverse(o => { if (o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; if (o.geometry.attributes.aReg) o.material = bodyMaterial(o.material, L, female); } });
  attachHair(inner, HAIRFILE[L.hair] || "Hair_SimpleParted", L.hairC || "#4a2e1a");
  if (L.beard && !female) attachHair(inner, "Hair_Beard", L.hairC || "#4a2e1a");
  const g = new THREE.Group(); g.add(inner);
  const mixer = new THREE.AnimationMixer(inner), acts = {};
  for (const c of HUM.clips) acts[c.name] = mixer.clipAction(c);
  let cur = null;
  const play = (name, fade = .25, ts = 1) => { const a = acts[name]; if (!a) return; a.timeScale = ts; if (cur === a) return; a.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (cur) cur.fadeOut(fade); cur = a; };
  if (opts.offset) mixer.setTime(opts.offset);
  return { g, inner, mixer, play, acts, real: true };
}
async function loadHumans() {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const get = f => L.loadAsync("./modelli/" + f + ".glb");
  const HF = ["Hair_SimpleParted", "Hair_Buzzed", "Hair_Long", "Hair_Buns", "Hair_Beard"];
  const [u, d, an, ...hs] = await Promise.all([get("corpo_uomo"), get("corpo_donna"), get("animazioni"), ...HF.map(get)]);
  HF.forEach((n, i) => { HUM.hair[n] = hs[i].scene; });
  const tl = new THREE.TextureLoader(), lt = f => new Promise((ok, ko) => tl.load("./modelli/" + f + ".webp", t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; ok(t); }, undefined, ko));
  [HUM.skin.uomo_chiara, HUM.skin.uomo_scura, HUM.skin.donna_chiara, HUM.skin.donna_scura] = await Promise.all(["pelle_uomo_chiara", "pelle_uomo_scura", "pelle_donna_chiara", "pelle_donna_scura"].map(lt));
  for (const [k, gl] of [["uomo", u], ["donna", d]]) { gl.scene.traverse(o => { if (o.isSkinnedMesh && /hero/i.test(o.name)) addRegions(o); }); HUM.base[k] = gl.scene; }
  HUM.clips = an.animations;
  HUM.ready = true;
}
const NPCS = []; // persone animate nella sala (comparse)
const SIT_Y = 0; // altezza a cui si mette una persona seduta (si regola guardando la scena)

// I tavoli dei festival, le loro sedie e le comparse stanno in un gruppo che si ricostruisce quando cambiano i filtri.
// Comparse (giocatori seduti e croupier) solo ai tavoli in corso: senza nome, non sono persone vere.
// Sono ferme: si uniscono in pochi pezzi (uno per materiale) così il telefono disegna poco.
let festRoot = null;
const todayRome = ymd("Europe/Rome");
const isLive = f => { const t = ymd(f.timezone); return f.start_date <= t && (f.end_date || f.start_date) >= t; };
function buildFestivals(list, filtered) {
  if (festRoot) { festRoot.traverse(o => { if (o.isMesh && o.userData.merged) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); scene.remove(festRoot); }
  for (let i = INTER.length - 1; i >= 0; i--) if (INTER[i].kind === "festival") INTER.splice(i, 1);
  for (let i = OBST.length - 1; i >= 0; i--) if (OBST[i].tag === "fest") OBST.splice(i, 1);
  LABELS.length = 0;
  festRoot = new THREE.Group(); scene.add(festRoot);
  const st = [], bk = [];
  let rows;
  if (!filtered) rows = [NOW.slice(0, 5).map(f => [f, true]), NEXT.slice(0, 5).map(f => [f, false]), NEXT.slice(5, 10).map(f => [f, false])];
  else { const L = list.slice(0, 15).map(f => [f, isLive(f)]); rows = [L.slice(0, 5), L.slice(5, 10), L.slice(10, 15)]; }
  rows.forEach((row, ri) => row.forEach(([f, live], i) => addFestival(f, rowX(row.length, i), ROWZ[ri], live, festRoot, st, bk)));
  if (filtered) { if (list.length) floorSign("★ I TUOI TORNEI", "#E9B949", -14 + 2.2, ROWZ[0] - 2.6, festRoot); }
  else { if (NOW.length) floorSign("● FESTIVAL IN CORSO", "#EF4444", -14 + 2.2, ROWZ[0] - 2.6, festRoot); floorSign("PROSSIMI 30 GIORNI", "#ECF2EE", -14 + 2.2, ROWZ[1] - 2.6, festRoot); }
  if (st.length) { const s = new THREE.InstancedMesh(G.seat, M.chair, st.length), b2 = new THREE.InstancedMesh(G.back, M.chair, bk.length);
    st.forEach((m, i) => s.setMatrixAt(i, m)); bk.forEach((m, i) => b2.setMatrixAt(i, m)); s.castShadow = b2.castShadow = true; festRoot.add(s, b2); }
  let r = 42; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280, pick = a => a[Math.floor(rnd() * a.length)];
  const randLook = () => ({ skin: pick(LOOK.skin), hair: pick(LOOK.hair), hairC: pick(LOOK.hairC), outfit: pick(LOOK.outfit), top: pick(LOOK.top), pants: pick(LOOK.pants),
    glasses: rnd() < .35, cap: rnd() < .15, capC: pick(["#1F8A5B", "#1b1b1f", "#6b1f2a", "#2d3a52"]), beard: rnd() < .25, stache: rnd() < .12, chain: rnd() < .2, tieC: pick(["#8a1d24", "#1f3a6b", "#2b2b2b"]) });
  NPCS.length = 0;
  if (HUM.ready) {
    const lookR = () => { const fem = rnd() < .35; return { corpo: fem ? "donna" : "uomo", skin: pick(LOOK.skin), hair: fem ? pick(["lunghi", "coda", "corti"]) : pick(["corti", "rasati", "indietro"]), hairC: pick(LOOK.hairC), outfit: pick(LOOK.outfit), top: pick(LOOK.top), pants: pick(LOOK.pants), beard: !fem && rnd() < .3 }; };
    const perTable = TOUCH0 ? 2 : 4;
    for (const it of INTER.filter(i => i.kind === "festival" && i.live)) {
      const { x, z } = it.center, a = it.ta, b = it.tb, n = 8, chosen = [0, 3, 2, 6].slice(0, perTable);
      for (const i of chosen) {
        const ang = (i + .5) / n * Math.PI * 2, cx = Math.cos(ang) * (a + .62), cz = Math.sin(ang) * (b + .62);
        const h = human(lookR(), { offset: rnd() * 3 }); h.g.position.set(x + cx, SIT_Y, z + cz); h.g.rotation.y = Math.atan2(cx, cz);
        h.play(rnd() < .5 ? "Sitting_Idle_Loop" : "Sitting_Talking_Loop", 0); festRoot.add(h.g); NPCS.push(h);
      }
      const dl = human({ corpo: rnd() < .4 ? "donna" : "uomo", skin: pick(LOOK.skin), hair: "corti", hairC: pick(LOOK.hairC), outfit: "completo", top: "#121214", pants: "#121214" }, { offset: rnd() * 2 });
      dl.g.position.set(x, 0, z - (b + .55)); dl.g.rotation.y = Math.PI; dl.play("Idle_Loop", 0); festRoot.add(dl.g); NPCS.push(dl);
    }
    return;
  }
  const extras = [];
  for (const it of INTER.filter(i => i.kind === "festival" && i.live)) {
    const { x, z } = it.center, a = it.ta, b = it.tb, n = 8, chosen = [0, 2, 3, 6].slice(0, 3 + Math.floor(rnd() * 2));
    for (const i of chosen) {
      const ang = (i + .5) / n * Math.PI * 2, cx = Math.cos(ang) * (a + .5), cz = Math.sin(ang) * (b + .5);
      const p = person(randLook()); seat(p); p.g.position.x = x + cx; p.g.position.z = z + cz; p.g.rotation.y = Math.atan2(cx, cz); extras.push(p.g);
      if (rnd() < .5) p.head.rotation.y = (rnd() - .5) * .8;
    }
    const d = person({ skin: pick(LOOK.skin), hair: pick(["corti", "coda", "indietro"]), hairC: pick(LOOK.hairC), outfit: "completo", top: "#121214", shirt: "#f2efe8", pants: "#121214", tieC: "#1b1b1f" });
    d.g.position.set(x, 0, z - (b + .42)); d.g.rotation.y = Math.PI; for (const ar of d.arms) { ar.sh.rotation.x = .5; ar.el.rotation.x = .9; } extras.push(d.g);
  }
  const byMat = new Map();
  for (const g of extras) { g.updateMatrixWorld(true); g.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(geo); }); }
  for (const [m, geos] of byMat) { const merged = mergeGeometries(geos, false); geos.forEach(gg => gg.dispose()); if (!merged) continue; const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.userData.merged = true; festRoot.add(mesh); }
}

// ---------------------------------------------------------------- «I tuoi tornei»: filtri che riempiono la sala
// La distanza è in linea d'aria. La posizione del telefono si usa solo se la chiedi, e resta sul dispositivo.
const CITTA = { roma: ["Roma", 41.90, 12.50], milano: ["Milano", 45.46, 9.19], napoli: ["Napoli", 40.85, 14.27], torino: ["Torino", 45.07, 7.69], bologna: ["Bologna", 44.49, 11.34],
  firenze: ["Firenze", 43.77, 11.26], venezia: ["Venezia", 45.44, 12.33], bari: ["Bari", 41.12, 16.87], palermo: ["Palermo", 38.12, 13.36], cagliari: ["Cagliari", 39.22, 9.12], sassari: ["Sassari", 40.73, 8.56],
  londra: ["Londra", 51.51, -0.13], parigi: ["Parigi", 48.86, 2.35], berlino: ["Berlino", 52.52, 13.40], madrid: ["Madrid", 40.42, -3.70], barcellona: ["Barcellona", 41.39, 2.17],
  vienna: ["Vienna", 48.21, 16.37], praga: ["Praga", 50.08, 14.44], amsterdam: ["Amsterdam", 52.37, 4.90], bruxelles: ["Bruxelles", 50.85, 4.35], monaco: ["Monaco di Baviera", 48.14, 11.58],
  zurigo: ["Zurigo", 47.38, 8.54], lubiana: ["Lubiana", 46.06, 14.51], bratislava: ["Bratislava", 48.15, 17.11], valletta: ["La Valletta", 35.90, 14.51] };
let myPos = null; // {lat, lon} solo in memoria
const km = (a1, o1, a2, o2) => { const R = 6371, r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r, h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function loadF() { try { return JSON.parse(localStorage.getItem("yg_sala_filtri") || "null"); } catch (e) { return null; } }
function saveF(F) { try { F ? localStorage.setItem("yg_sala_filtri", JSON.stringify(F)) : localStorage.removeItem("yg_sala_filtri"); } catch (e) {} }
let FILTRI = loadF();
function origin(F) { if (!F || !F.da) return null; if (F.da === "gps") return myPos; const c = CITTA[F.da]; return c ? { lat: c[1], lon: c[2] } : null; }
function filtra(F) {
  const o = origin(F), out = [], esclusi = { buyin: 0, luogo: 0 };
  for (const f of D.festivals || []) {
    if (!f.start_date || (f.end_date || f.start_date) < ymd(f.timezone)) continue;
    if (F.mese && !(f.start_date.slice(0, 7) <= F.mese && (f.end_date || f.start_date).slice(0, 7) >= F.mese)) continue;
    if (F.buy) { const e = mainEvent(f); if (!e || e.buy_in_eur == null) { esclusi.buyin++; continue; } if (e.buy_in_eur > F.buy) continue; }
    if (F.km && o) { if (f.lat == null || f.lon == null) { esclusi.luogo++; continue; } if (km(o.lat, o.lon, f.lat, f.lon) > F.km) continue; }
    out.push(f);
  }
  out.sort((a, b) => (isLive(b) - isLive(a)) || a.start_date.localeCompare(b.start_date));
  return { list: out, esclusi };
}
function applyFiltri(F, quiet) {
  FILTRI = F; saveF(F);
  if (!F) { buildFestivals(null, false); if (!quiet) toast("Sala come sempre: in corso e prossimi 30 giorni"); return; }
  const { list } = filtra(F); buildFestivals(list, true);
  if (!quiet) toast(list.length ? `Nella sala ${Math.min(15, list.length)} ${list.length === 1 ? "festival" : "festival"} scelti per te${list.length > 15 ? ` (su ${list.length})` : ""}` : "Nessun festival con questi filtri: prova ad allargarli");
}
if (FILTRI && FILTRI.da === "gps") FILTRI.da = ""; // la posizione non si ricorda tra una visita e l'altra
applyFiltri(FILTRI, true);

// ---------------------------------------------------------------- movimento e sguardo
const P = { x: 0, z: 14.2, yaw: 0, pitch: -.12, h: 0 };
// ---------------------------------------------------------------- il tuo personaggio: si personalizza SOLO da iscritti
// L'iscrizione la gestisce l'area iscritti del sito (#/area). Qui si guarda solo se nel telefono c'è una sessione attiva.
function iscritto() {
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.+-auth-token$/.test(k)) { const v = JSON.parse(localStorage.getItem(k) || "null"); if (v && (v.refresh_token || (v.expires_at && v.expires_at * 1000 > Date.now()))) return true; } } } catch (e) {}
  return false;
}
const OSPITE = { name: "Ospite", skin: LOOK.skin[1], hair: "corti", hairC: LOOK.hairC[1], outfit: "pelle", top: "#1b1b1f", pants: "#2b3550", glasses: false, cap: false, beard: false, stache: false, chain: false };
function myLook() { if (!iscritto()) return OSPITE; try { return Object.assign({}, OSPITE, { name: "" }, JSON.parse(localStorage.getItem("yg_sala_me") || "{}")); } catch (e) { return OSPITE; } }
let me = null, meLabel = null, view = (() => { try { return localStorage.getItem("yg_sala_vista") || "3"; } catch (e) { return "3"; } })();
function nameTex(n) { return label([{ t: n || "Tu", size: 48, weight: 700 }], { w: 512, h: 104, pad: 22, border: "rgba(31,138,91,.9)" }); }
function buildMe() {
  const L = myLook();
  if (me) scene.remove(me.g);
  me = HUM.ready ? human(L) : person(L); me.g.traverse(o => { o.userData.me = true; }); scene.add(me.g);
  meLabel = sprite(nameTex(L.name || "Tu"), .78, .16); meLabel.position.y = 2.0; me.g.add(meLabel);
}
buildMe();
// i modelli veri arrivano dopo: la sala si apre subito con le persone disegnate, poi si sostituiscono
loadHumans().then(() => { buildMe(); applyFiltri(FILTRI, true); }).catch(e => console.warn("Personaggi 3D non caricati, restano quelli disegnati:", e));

let target = null;           // {x,z,yaw?,pitch?,glide?,it?}
let marker;
{ const r = new THREE.Mesh(new THREE.RingGeometry(.22, .3, 32), new THREE.MeshBasicMaterial({ color: 0xE9B949, transparent: true, opacity: .9, depthWrite: false, toneMapped: false })); r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); marker = r; }
const keys = {};
function pushOut(p) {
  p.x = THREE.MathUtils.clamp(p.x, -RX + .6, RX - .6); p.z = THREE.MathUtils.clamp(p.z, -RZ + .8, RZ - .6);
  for (const o of OBST) { const u = (p.x - o.x) / o.a, v = (p.z - o.z) / o.b, d = Math.hypot(u, v); if (d < 1) { const k = d < 1e-3 ? 1 : 1 / d; p.x = o.x + (d < 1e-3 ? 1 : u) * k * o.a; p.z = o.z + v * k * o.b; } }
}
function angleTo(fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)); }
function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function goTo(it) {
  const a = it.approach(P);
  target = { x: a.x, z: a.z, pitch: a.pitch ?? -.1, it, glide: true };
  target.yaw = a.lookAt ? angleTo(a.x, a.z, a.lookAt.x, a.lookAt.z) : (a.yaw ?? P.yaw);
  closeSheet(); marker.visible = false;
}
function walkTo(x, z) { const p = { x, z }; pushOut(p); target = { x: p.x, z: p.z, glide: false }; marker.position.set(p.x, .02, p.z); marker.visible = true; }

// ---------------------------------------------------------------- comandi: computer (mouse + tastiera) e telefono (joystick + dito)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const looks = new Map(), joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
let camDist = TOUCH0 ? 4.4 : 4.0, lastDrag = -1e9, pinch0 = null;
const joyEl = $("#joy"), knob = joyEl.querySelector("i");
function joyShow(x, y) { joyEl.style.left = (x - 60) + "px"; joyEl.style.top = (y - 60) + "px"; joyEl.hidden = false; knob.style.transform = "translate(0,0)"; }
canvas.addEventListener("pointerdown", e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  const r = canvas.getBoundingClientRect();
  if (e.pointerType !== "mouse" && joy.id === null && e.clientX - r.left < r.width * .45 && e.clientY - r.top > r.height * .4) {
    joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = 0; joyShow(e.clientX, e.clientY); target = null; marker.visible = false; return;
  }
  looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
  if (looks.size === 2) { const [p1, p2] = [...looks.values()]; pinch0 = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cam: camDist }; }
});
canvas.addEventListener("pointermove", e => {
  if (e.pointerId === joy.id) {
    let dx = (e.clientX - joy.x0) / 50, dy = (e.clientY - joy.y0) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    joy.dx = dx; joy.dy = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; return;
  }
  const p = looks.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
  if (looks.size === 2 && pinch0) { const [p1, p2] = [...looks.values()]; camDist = THREE.MathUtils.clamp(pinch0.cam * pinch0.d / Math.max(20, Math.hypot(p1.x - p2.x, p1.y - p2.y)), 2.2, 7.5); return; }
  if (p.moved) { const k = e.pointerType === "mouse" ? .0045 : .0065; P.yaw -= dx * k; P.pitch = THREE.MathUtils.clamp(P.pitch - dy * k * .8, -.8, .55); lastDrag = performance.now(); }
});
function endPtr(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; joyEl.hidden = true; return; }
  const p = looks.get(e.pointerId); looks.delete(e.pointerId); if (looks.size < 2) pinch0 = null;
  if (!p || p.moved || e.type === "pointercancel") return;
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = INTER.map(i => i.group);
  const hit = ray.intersectObjects([...objs, carpet, marble], true)[0];
  if (!hit) return;
  let o = hit.object; while (o && !objs.includes(o) && o !== carpet && o !== marble) o = o.parent;
  if (o === carpet || o === marble) { walkTo(hit.point.x, hit.point.z); return; }
  const it = INTER.find(i => i.group === o); if (it) goTo(it);
}
canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
canvas.addEventListener("wheel", e => { e.preventDefault(); camDist = THREE.MathUtils.clamp(camDist * (1 + Math.sign(e.deltaY) * .1), 2.2, 7.5); }, { passive: false });
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  keys[e.key.toLowerCase()] = true; if (e.key === "Shift") keys.shift = true;
  if (e.key === "Escape") closeSheet(true);
  if ((e.key === "e" || e.key === "E" || e.key === "Enter") && nearIt && sheetFor !== nearIt.id) openSheet(nearIt.sheet(), nearIt.id);
  if (e.key === "v" || e.key === "V") toggleView();
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; if (e.key === "Shift") keys.shift = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------- pannelli
const sheet = $("#sheet"), body = sheet.querySelector(".body");
let sheetFor = null, dismissed = null, lock = null; // dismissed resta per compatibilità
function openSheet(html, forId) { body.innerHTML = html; sheet.hidden = false; document.body.classList.add("sheet-on"); sheet.scrollTop = 0; sheetFor = forId || null; }
function closeSheet(byUser) { if (byUser && sheetFor) dismissed = sheetFor; sheet.hidden = true; sheetFor = null; document.body.classList.remove("sheet-on"); }
sheet.querySelector(".x").addEventListener("click", () => closeSheet(true));
const FAV = () => { try { return JSON.parse(localStorage.getItem("yg_fav") || "[]"); } catch (e) { return []; } };
function toggleFav(k) { const a = FAV(), i = a.indexOf(k); i >= 0 ? a.splice(i, 1) : a.push(k); try { localStorage.setItem("yg_fav", JSON.stringify(a)); } catch (e) {} toast(i >= 0 ? "Tolto dal tuo piano" : "Aggiunto al tuo piano"); return i < 0; }
const IC = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  tonight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 2v4M7 12l3-4 4 1 2 4M10 8l1 5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
};

function sheetFestival(f, live) {
  const e = mainEvent(f), src = (f.source_urls || [])[0] || f.website, fav = FAV().includes("f:" + f.id);
  return `<span class="chip ${live ? "live" : ""}">${live ? "In corso" : "Dal " + dm(f.start_date)}</span>
  <div class="sh-t" style="margin-top:10px">${esc(f.festival || f.tour)}</div>
  <p class="sh-s">${esc(f.venue || "n.d.")} · ${esc(f.city || "")} ${flag(f.country)}</p>
  <div class="stats">
    <div class="stat"><div class="lab">Date</div><div class="v">${dm(f.start_date)}–${dm(f.end_date || f.start_date)}</div></div>
    <div class="stat"><div class="lab">Evento principale</div><div class="v" style="font-family:var(--sans);font-size:14px">${esc(e ? e.name : "n.d.")}</div></div>
    <div class="stat"><div class="lab">Buy-in</div><div class="v gold">${e ? eur(e.buy_in_eur) : "n.d."}</div></div>
    <div class="stat"><div class="lab">Garantito</div><div class="v gold">${e ? eur(e.guarantee_eur) : "n.d."}</div></div>
  </div>
  ${(() => { const cf = conf(f.confidence), srcs = (f.source_urls || []).map(host).filter(Boolean);
    return `<div class="fid" style="--c:${cf.col}"><b>● ${cf.t}</b><span>${cf.d}</span><span>Fonti: ${srcs.length ? esc([...new Set(srcs)].join(", ")) : "n.d."} · dati aggiornati il ${AGG}</span></div>`; })()}
  ${budgetHTML(f, e)}
  <div class="btns">
    <a class="btn pri" href="${SITE}#/f/${encodeURIComponent(f.id)}">Apri la pagina ${IC.out}</a>
    <button class="btn ${fav ? "on" : ""}" type="button" data-fav="f:${esc(f.id)}">${IC.star} ${fav ? "Nel tuo piano" : "Salva nel piano"}</button>
    <div class="btn ghost">Guida del viaggio <span class="soon">in arrivo</span></div>
  </div>`;
}
// budget della trasferta: il buy-in viene dai dati; volo, hotel e altro li scrive chi guarda (non inventiamo prezzi)
function nights(f) { const a = new Date(f.start_date + "T12:00:00Z"), b = new Date((f.end_date || f.start_date) + "T12:00:00Z"); return Math.max(1, Math.round((b - a) / 864e5)); }
function getB(id) { try { return (JSON.parse(localStorage.getItem("yg_budget") || "{}"))[id] || {}; } catch (e) { return {}; } }
function setB(id, v) { try { const all = JSON.parse(localStorage.getItem("yg_budget") || "{}"); all[id] = v; localStorage.setItem("yg_budget", JSON.stringify(all)); } catch (e) {} }
function budgetHTML(f, e) {
  const B = getB(f.id), buy = B.buy ?? (e && e.buy_in_eur != null ? e.buy_in_eur : ""), n = B.notti ?? nights(f);
  const inp = (k, v, ph) => `<input class="bin" inputmode="decimal" data-b="${k}" data-f="${esc(f.id)}" value="${esc(v ?? "")}" placeholder="${ph}">`;
  return `<details class="budget"><summary>Budget della trasferta</summary>
    <div class="bgrid">
      <label>Buy-in (€)${inp("buy", buy, "n.d.")}</label><label>Volo andata e ritorno (€)${inp("volo", B.volo, "es. 120")}</label>
      <label>Hotel a notte (€)${inp("hotel", B.hotel, "es. 80")}</label><label>Notti${inp("notti", n, "")}</label>
      <label>Altro: cibo, taxi (€)${inp("altro", B.altro, "es. 100")}</label><div class="btot"><span class="lab">Totale</span><b data-tot="${esc(f.id)}">${eur(totB(f, e))}</b></div>
    </div>
    <p class="note">Il buy-in viene dalla fonte del festival. Volo, hotel e il resto li scrivi tu: non inventiamo prezzi. Si salva solo in questo telefono.</p></details>`;
}
function totB(f, e) { const B = getB(f.id), num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const buy = B.buy ?? (e && e.buy_in_eur != null ? e.buy_in_eur : 0), notti = B.notti ?? nights(f);
  return Math.round(num(buy) + num(B.volo) + num(B.hotel) * num(notti) + num(B.altro)); }
function sheetFiltri() {
  const F = FILTRI || {}, mesi = [...new Set((D.festivals || []).filter(f => (f.end_date || f.start_date) >= todayRome).flatMap(f => [f.start_date.slice(0, 7), (f.end_date || f.start_date).slice(0, 7)]))].sort();
  const nomeMese = m => { try { return new Date(m + "-15T12:00:00Z").toLocaleDateString("it-IT", { month: "long", year: "numeric" }); } catch (e) { return m; } };
  const sel = (id, opts, cur, lab) => `<select id="${id}" class="fsel" aria-label="${lab}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(cur ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const res = FILTRI ? filtra(FILTRI) : null;
  return `<div class="lab">I tuoi tornei</div><div class="sh-t">Riempi la sala con i festival che fanno per te</div>
  <p class="sh-s">I tavoli si dispongono da soli con quello che scegli qui.</p>
  <div class="lab gh">Mese</div>${sel("fMese", [["", "Tutti i mesi"], ...mesi.map(m => [m, nomeMese(m)])], F.mese, "Mese")}
  <div class="lab gh">Buy-in massimo del torneo principale</div>${sel("fBuy", [["", "Nessun limite"], ...[150, 300, 500, 1000, 2000].map(v => [v, "fino a " + eur(v)])], F.buy, "Buy-in massimo")}
  <div class="lab gh">Parto da</div>${sel("fDa", [["", "Non importa"], ["gps", "La mia posizione (resta sul telefono)"], ...Object.entries(CITTA).map(([k, c]) => [k, c[0]])], F.da, "Parto da")}
  <div class="lab gh">Distanza massima (in linea d'aria)</div>${sel("fKm", [["", "Nessun limite"], ...[300, 600, 1000, 1500, 2500].map(v => [v, "entro " + v.toLocaleString("it-IT") + " km"])], F.km, "Distanza massima")}
  ${res ? `<p class="note">Con i filtri attuali: ${res.list.length} festival.${res.esclusi.buyin ? ` ${res.esclusi.buyin} esclusi perché il buy-in non è pubblicato.` : ""}${res.esclusi.luogo ? ` ${res.esclusi.luogo} esclusi perché manca il luogo.` : ""}${res.list.length > 15 ? " Nella sala ne entrano 15, i primi per data: tutti gli altri sono nel calendario." : ""}</p>` : ""}
  <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" data-fapply="1">Mostra nella sala</button><button class="btn" type="button" data-freset="1">Togli i filtri</button></div>`;
}
function sheetBoard() {
  const rows = tonight.map(r => { const v = VENUE[r.venue_id] || {};
    return `<a class="row" href="${SITE}#/v/${encodeURIComponent(r.venue_id)}"><span class="t">${esc(r.time || "--:--")}</span><span class="n"><b>${esc(r.name)}</b><span>${flag(v.country)} ${esc(v.venue || "")}${r.kind === "cash" ? " · cash game" : ""}</span></span><span class="m">${r.buy_in_eur != null ? eur(r.buy_in_eur) : esc(r.buy_in_text || "n.d.")}</span></a>`; }).join("");
  return `<div class="lab">Il tabellone</div><div class="sh-t">Oggi nelle sale</div>
  <p class="sh-s">${tonight.length ? `${tonight.length} in programma oggi, ora locale della sala.` : "Oggi le nostre fonti non segnano tornei nelle sale."}</p>
  <div class="list">${rows}</div>
  <a class="btn pri" href="${SITE}#/oggi">Apri «Oggi nelle sale» ${IC.out}</a>`;
}
function sheetCountry(cc) {
  const vs = byCountry[cc] || [];
  const rows = vs.map(v => { const w = (v.weekly || []).length;
    return `<a class="row" style="grid-template-columns:1fr auto" href="${SITE}#/v/${encodeURIComponent(v.id)}"><span class="n"><b>${esc(v.venue)}</b><span>${esc(v.city || "")}${w ? ` · ${w} tornei settimanali` : ""}${v.cash_games ? " · cash game" : ""}</span></span><span class="m" style="color:var(--green2)">Apri</span></a>`; }).join("");
  return `<div class="lab">Le porte d'Europa</div><div class="sh-t">${flag(cc)} ${esc(country(cc))}</div>
  <p class="sh-s">${vs.length === 1 ? "1 sala" : vs.length + " sale"} nel nostro elenco. Ogni dato ha la sua fonte nella pagina della sala.</p>
  <div class="list">${rows}</div>`;
}
function sheetTrain() {
  return `<div class="lab">Tavolo d'allenamento</div><div class="sh-t">Allenati gratis</div>
  <p class="sh-s">Lezioni e test per imparare il poker. Si gioca senza soldi, senza premi e senza nulla da comprare.</p>
  <div class="btns"><a class="btn pri" href="${SITE}gioco/">Apri il gioco ${IC.out}</a></div>`;
}
function sheetCal() {
  return `<div class="lab">Il calendario</div><div class="sh-t">Tutti i festival</div>
  <p class="sh-s">${(D.festivals || []).length} festival di poker dal vivo in Europa, in ordine di data, ognuno con la sua fonte.</p>
  <div class="btns"><a class="btn pri" href="${SITE}it/calendario/">Apri il calendario ${IC.out}</a></div>`;
}
function sheetAmici() {
  return `<div class="lab">Tavoli tra amici</div><div class="sh-t">Presto: il tuo tavolo privato</div>
  <p class="sh-s">Dietro questa porta arriveranno i tavoli tra amici: inviti chi vuoi e giocate con fiches finte.</p>
  <p class="note">Niente soldi, niente premi, niente fiches da comprare. Per sedersi servirà l'iscrizione gratuita.</p>
  <div class="btn ghost" style="margin-top:12px">Porta chiusa <span class="soon">in arrivo</span></div>`;
}
function sheetExit() {
  return `<div class="sh-t">Torni al sito?</div><p class="sh-s">La versione semplice ha gli stessi dati, più veloce da leggere.</p>
  <div class="btns"><a class="btn pri" href="${SITE}">Versione semplice ${IC.out}</a></div>`;
}
function sheetMenu() {
  return `<div class="sh-t">Cosa vuoi fare?</div>
  <div class="tiles">
    <button class="tile" data-go="board"><span class="ic">${IC.tonight}</span>Cosa si gioca stasera</button>
    <button class="tile" data-filtri="1"><span class="ic">${IC.cal}</span>${FILTRI ? "I tuoi tornei ★" : "Scegli i tuoi tornei"}</button>
    <button class="tile" data-go="${COUNTRIES[0] ? "c:" + COUNTRIES[0] : "board"}"><span class="ic">${IC.globe}</span>Le sale d'Europa</button>
    <button class="tile" data-go="train"><span class="ic">${IC.learn}</span>Allenati gratis</button>
    <a class="tile" href="${SITE}#/piano"><span class="ic">${IC.star}</span>Il mio piano</a>
    <button class="tile" data-walk="1"><span class="ic">${IC.walk}</span>Cammina</button>
    <button class="tile" data-me="1"><span class="ic">${IC.user}</span>Il tuo personaggio</button>
    <button class="tile" data-view="1"><span class="ic">${IC.eye}</span>${view === "3" ? "Vista: in prima persona" : "Vista: da dietro"}</button>
  </div>
  <p class="note">Solo informazione sui tornei dal vivo. Qui non si gioca e non si compra niente.</p>`;
}
function sheetMe() {
  if (!iscritto()) return `<div class="lab">Il tuo personaggio</div><div class="sh-t">Nome e personaggio sono per gli iscritti</div>
    <p class="sh-s">Chi non è iscritto entra nella sala come «Ospite». Con l'iscrizione gratuita scegli il tuo nome, la carnagione, i capelli e i vestiti.</p>
    <div class="btns"><a class="btn pri" href="${SITE}#/area">Iscriviti o entra ${IC.out}</a></div>`;
  const L = myLook(), sw = (k, arr) => `<div class="sw">${arr.map(c => `<button type="button" aria-label="Colore ${arr.indexOf(c) + 1}" data-k="${k}" data-v="${c}" style="background:${c}" class="${L[k] === c ? "on" : ""}"></button>`).join("")}</div>`;
  const op = (k, arr, names) => `<div class="opts">${arr.map((v, i) => `<button type="button" class="opt ${L[k] === v ? "on" : ""}" data-k="${k}" data-v="${v}">${names ? names[i] : v}</button>`).join("")}</div>`;
  const tg = (k, t) => `<button type="button" class="opt ${L[k] ? "on" : ""}" data-t="${k}">${t}</button>`;
  return `<div class="lab">Il tuo personaggio</div><div class="sh-t">Come ti vedono nella sala</div>
  <label class="lab gh" for="meName" style="display:block">Nome (max 20 caratteri)</label>
  <input id="meName" class="name" maxlength="20" autocomplete="off" value="${esc(L.name)}" placeholder="Il tuo nome nella sala">
  <div class="lab gh">Carnagione</div>${sw("skin", LOOK.skin)}
  <div class="lab gh">Corpo</div>${op("corpo", ["uomo", "donna"], ["Uomo", "Donna"])}
  <div class="lab gh">Capelli</div>${op("hair", ["corti", "rasati", "lunghi", "coda"], ["Corti", "Rasati", "Lunghi", "Raccolti"])}${sw("hairC", LOOK.hairC)}
  <div class="lab gh">Stile</div>${op("outfit", LOOK.outfit, LOOK.outfit.map(k => OUTFIT_NAMES[k]))}
  <div class="lab gh">Colore del capo</div>${sw("top", LOOK.top)}
  <div class="lab gh">Pantaloni</div>${sw("pants", LOOK.pants)}
  <div class="lab gh">Dettagli</div><div class="opts">${tg("beard", "Barba")}</div>
  <p class="note">Si salva solo in questo telefono. Per ora nella sala sei da solo: nessun altro vede il tuo nome.</p>`;
}
function saveMe(patch) {
  const L = Object.assign(myLook(), patch); delete L.__proto__;
  try { localStorage.setItem("yg_sala_me", JSON.stringify(L)); } catch (e) {}
  buildMe();
}
function sheetGo() {
  const b = (it, sub) => `<button class="go" data-go="${esc(it.id)}">${esc(it.name)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
  const fN = INTER.filter(i => i.kind === "festival" && i.live), fX = INTER.filter(i => i.kind === "festival" && !i.live), cs = INTER.filter(i => i.kind === "country");
  const one = id => INTER.find(i => i.id === id);
  return `<div class="sh-t">Vai a…</div>
  ${b(one("board"), `${tonight.length} in programma oggi`)}
  ${fN.length ? `<div class="lab gh">Festival in corso</div>${fN.map(i => b(i, `${i.data.city} · fino al ${dm(i.data.end_date)}`)).join("")}` : ""}
  ${fX.length ? `<div class="lab gh">Prossimi 30 giorni</div>${fX.map(i => b(i, `${i.data.city} · dal ${dm(i.data.start_date)}`)).join("")}` : ""}
  <div class="lab gh">Le sale per paese</div>${cs.map(i => b(i)).join("")}
  <div class="lab gh">Altro</div>${b(one("train"))}${b(one("cal"))}${b(one("amici"))}${b(one("exit"))}`;
}
body.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) { const it = INTER.find(i => i.id === g.dataset.go); if (it) goTo(it); return; }
  const w = e.target.closest("[data-walk]"); if (w) { closeSheet(); hint(); return; }
  if (e.target.closest("[data-me]")) { openSheet(sheetMe(), "me"); return; }
  if (e.target.closest("[data-filtri]")) { openSheet(sheetFiltri(), "filtri"); return; }
  if (e.target.closest("[data-freset]")) { applyFiltri(null); closeSheet(); return; }
  if (e.target.closest("[data-fapply]")) {
    const v = id => body.querySelector("#" + id).value, F = { mese: v("fMese"), buy: +v("fBuy") || 0, da: v("fDa"), km: +v("fKm") || 0 };
    const go = () => { if (!F.mese && !F.buy && !F.km) { applyFiltri(null); } else applyFiltri(F); closeSheet(); };
    if (F.da === "gps" && F.km) { if (!navigator.geolocation) { toast("Questo browser non dà la posizione: scegli una città"); return; }
      toast("Chiedo la posizione al telefono…"); navigator.geolocation.getCurrentPosition(p => { myPos = { lat: p.coords.latitude, lon: p.coords.longitude }; go(); }, () => toast("Posizione non disponibile: scegli una città"), { maximumAge: 6e5, timeout: 10000 }); return; }
    if (F.km && !F.da) { toast("Per la distanza scegli da dove parti"); return; }
    go(); return;
  }
  if (e.target.closest("[data-view]")) { closeSheet(); toggleView(); return; }
  const kk = e.target.closest("[data-k]"); if (kk && iscritto()) { saveMe({ [kk.dataset.k]: kk.dataset.v }); body.querySelectorAll(`[data-k="${kk.dataset.k}"]`).forEach(b => b.classList.toggle("on", b === kk)); return; }
  const tt = e.target.closest("[data-t]"); if (tt && iscritto()) { const on = !myLook()[tt.dataset.t]; saveMe({ [tt.dataset.t]: on }); tt.classList.toggle("on", on); return; }
  const f = e.target.closest("[data-fav]"); if (f) { const on = toggleFav(f.dataset.fav); f.classList.toggle("on", on); f.innerHTML = `${IC.star} ${on ? "Nel tuo piano" : "Salva nel piano"}`; }
});
body.addEventListener("input", e => {
  const bi = e.target.closest && e.target.closest("[data-b]");
  if (bi) { const id = bi.dataset.f, B = getB(id); B[bi.dataset.b] = bi.value.replace(/[^0-9.,]/g, "").slice(0, 7); setB(id, B);
    const f = (D.festivals || []).find(x => x.id === id), out = body.querySelector(`[data-tot="${CSS.escape(id)}"]`); if (f && out) out.textContent = eur(totB(f, mainEvent(f))); return; } if (e.target.id === "meName" && iscritto()) { const n = e.target.value.replace(/[\u0000-\u001f<>]/g, "").slice(0, 20); saveMe({ name: n.trim() }); } });
$("#bMenu").addEventListener("click", () => openSheet(sheetMenu(), "menu"));
$("#bGo").addEventListener("click", () => openSheet(sheetGo(), "go"));

let toastT; function toast(t, ms = 2600) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), ms); }
const TOUCH = matchMedia("(pointer:coarse)").matches;
function hint() { toast(TOUCH ? "Pollice sinistro: cammina (spingi a fondo per correre) · dito destro: guardati intorno · due dita: avvicina" : "WASD o frecce: cammina · Shift: corri · trascina: guardati intorno · rotella: avvicina · E: apri · V: cambia vista", 6500); }

// ---------------------------------------------------------------- ciclo
let Q = LOWEND ? 1 : 2, composer = null;
function makeComposer() {
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .6, .9)); composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 x=c.rgb;x=(x-.5)*1.07+.5;float l=dot(x,vec3(.299,.587,.114));x=mix(vec3(l),x,1.1);x*=vec3(1.035,1.0,.95);float d=distance(vUv,vec2(.5));x*=mix(1.0,.72,smoothstep(.38,.85,d));gl_FragColor=vec4(clamp(x,0.,1.),c.a);}" }));
}
try { makeComposer(); } catch (e) { Q = 1; }
if (Q < 1) sun.castShadow = false;
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); } camera.aspect = w / h; camera.fov = w < h ? 70 : 60; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

const clock = new THREE.Clock(), V = { x: 0, z: 0 }, camPos = new THREE.Vector3(P.x, 3.2, Math.min(P.z + 3.6, RZ - .4)), camLook = new THREE.Vector3(P.x, 1.45, P.z - 1.2);
let walkT = 0, idleT = 0, nearIt = null;
let fpsAcc = 0, fpsN = 0, started = performance.now();
const nearBtn = $("#nearBtn");
nearBtn.addEventListener("click", () => { if (nearIt) { openSheet(nearIt.sheet(), nearIt.id); lock = { id: nearIt.id, x: P.x, z: P.z }; } });
function toggleView() { view = view === "3" ? "1" : "3"; try { localStorage.setItem("yg_sala_vista", view); } catch (er) {} toast(view === "3" ? "Ora ti vedi da dietro" : "Ora vedi con i tuoi occhi"); }
const MENUS = ["menu", "go", "me", "filtri"];
function nearCheck() {
  if (target && target.glide) { nearBtn.hidden = true; return; }
  let best = null, bd = 1e9;
  for (const it of INTER) {
    const inside = it.near ? it.near(P) : Math.hypot(P.x - it.center.x, P.z - it.center.z) < it.radius;
    if (inside) { const d = it.near ? -1 : Math.hypot(P.x - it.center.x, P.z - it.center.z); if (d < bd) { bd = d; best = it; } }
  }
  nearIt = best;
  // ci si allontana da quello che si stava guardando: il pannello si chiude da solo
  if (sheetFor && !MENUS.includes(sheetFor) && (!best || best.id !== sheetFor)) { if (!lock || Math.hypot(P.x - lock.x, P.z - lock.z) > 1.2) { closeSheet(); lock = null; } }
  const show = best && sheetFor !== best.id && !MENUS.includes(sheetFor);
  if (show) { const txt = (TOUCH0 ? "Apri · " : "Apri (E) · ") + best.name; if (nearBtn.dataset.t !== txt) { nearBtn.dataset.t = txt; nearBtn.textContent = txt; } }
  nearBtn.hidden = !show;
}
function frame() {
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  idleT += dt;
  // --- dove vuole andare: tastiera o joystick (rispetto alla telecamera), oppure verso una meta
  let fw = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0), st = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), mag = Math.min(1, Math.hypot(fw, st));
  if (joy.id !== null) { fw = -joy.dy; st = joy.dx; mag = Math.min(1, Math.hypot(fw, st)); }
  const run = keys.shift || (joy.id !== null && mag > .92);
  let dvx = 0, dvz = 0;
  if (mag > .08) {
    target = null; marker.visible = false;
    const L = Math.hypot(fw, st) || 1, f = fw / L, r = st / L, sp = (run ? 5.2 : 2.6) * (joy.id !== null ? Math.max(.35, mag) : 1);
    dvx = (-Math.sin(P.yaw) * f + Math.cos(P.yaw) * r) * sp; dvz = (-Math.cos(P.yaw) * f - Math.sin(P.yaw) * r) * sp;
  } else if (target) {
    const dx = target.x - P.x, dz = target.z - P.z, d = Math.hypot(dx, dz);
    if (d > .1) { const sp = (target.glide ? 4.6 : 2.6) * Math.min(1, d / .9 + .15); dvx = dx / d * sp; dvz = dz / d * sp; }
    else {
      if (target.yaw != null) { P.yaw += wrapA(target.yaw - P.yaw) * (1 - Math.exp(-dt * 6)); P.h += wrapA(target.yaw - P.h) * (1 - Math.exp(-dt * 8)); P.pitch += ((target.pitch ?? P.pitch) - P.pitch) * (1 - Math.exp(-dt * 5)); }
      if (target.yaw == null || Math.abs(wrapA(target.yaw - P.yaw)) < .03) {
        if (target.it) { openSheet(target.it.sheet(), target.it.id); lock = { id: target.it.id, x: P.x, z: P.z }; }
        marker.visible = false; target = null;
      }
    }
  }
  // --- accelera e frena in modo morbido
  const acc = 1 - Math.exp(-dt * ((dvx || dvz) ? 9 : 12));
  V.x += (dvx - V.x) * acc; V.z += (dvz - V.z) * acc;
  P.x += V.x * dt; P.z += V.z * dt;
  if (!(target && target.glide)) pushOut(P);
  const spd = Math.hypot(V.x, V.z);
  if (spd > .15) P.h += wrapA(Math.atan2(-V.x, -V.z) - P.h) * (1 - Math.exp(-dt * 11));
  // --- la telecamera torna da sola alle spalle quando cammini (se non la stai girando tu)
  if (view === "3" && spd > .6 && now - lastDrag > 1100 && !(target && !target.glide && false)) P.yaw += wrapA(P.h - P.yaw) * (1 - Math.exp(-dt * 1.4));
  if (view === "1") P.h = P.yaw;
  nearCheck();
  for (const L of LABELS) { const d = Math.hypot(P.x - L.x, P.z - L.z), o = THREE.MathUtils.clamp((11 - d) / 3, 0, 1); L.s.material.opacity = o; L.s.visible = o > .02; }
  // --- il personaggio
  const runK = THREE.MathUtils.clamp((spd - 2.6) / 2.4, 0, 1);
  me.g.position.set(P.x, 0, P.z); me.g.rotation.y = P.h; walkT += dt * (spd * 2.5 + (spd > .1 ? 1.2 : 0)); if (me.real) { me.mixer.update(dt); if (spd < .25) me.play("Idle_Loop"); else if (spd < 3.2) me.play("Walk_Loop", .25, THREE.MathUtils.clamp(spd / 1.5, .7, 1.7)); else if (spd < 4.4) me.play("Jog_Fwd_Loop", .25, spd / 3.6); else me.play("Sprint_Loop", .25, spd / 5.2); }
  else pose(me, walkT, Math.min(1, spd / 1.6), runK, idleT);
  for (const h of NPCS) h.mixer.update(dt);
  // --- telecamera da dietro, che segue con un leggero ritardo
  if (view === "3") {
    me.g.visible = true; meLabel.visible = camDist > 2.6;
    const el = THREE.MathUtils.clamp(.32 - P.pitch * .9, -.15, 1.15), d = camDist;
    let cx = P.x + Math.sin(P.yaw) * Math.cos(el) * d, cz = P.z + Math.cos(P.yaw) * Math.cos(el) * d, cy = 1.55 + Math.sin(el) * d;
    cx = THREE.MathUtils.clamp(cx, -RX + .35, RX - .35); cz = THREE.MathUtils.clamp(cz, -RZ + .35, RZ - .35); cy = THREE.MathUtils.clamp(cy, .5, WALL_H - .35);
    const k = 1 - Math.exp(-dt * 8);
    camPos.x += (cx - camPos.x) * k; camPos.y += (cy - camPos.y) * k; camPos.z += (cz - camPos.z) * k;
    const lx = P.x - Math.sin(P.yaw) * 1.2, lz = P.z - Math.cos(P.yaw) * 1.2, ly = 1.45 + Math.max(0, P.pitch) * 1.6;
    camLook.x += (lx - camLook.x) * k; camLook.y += (ly - camLook.y) * k; camLook.z += (lz - camLook.z) * k;
    camera.position.copy(camPos); camera.lookAt(camLook);
  } else { me.g.visible = false; camera.position.set(P.x, 1.62, P.z); camera.rotation.set(P.pitch, P.yaw, 0); camPos.copy(camera.position); }
  if (marker.visible) marker.material.opacity = .55 + Math.sin(now / 180) * .35;
  if (canvas.clientWidth > 0 && canvas.clientHeight > 0) { if (Q >= 2 && composer) composer.render(); else renderer.render(scene, camera); } // a finestra chiusa o ridotta a zero non si disegna
  // qualità automatica: si ignora l'avvio, poi si scende per gradi se va a scatti (non si salva nulla)
  if (now - started > 6000 && !document.hidden) { fpsAcc += dt; fpsN++; if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 28) { if (Q === 2) Q = 1; else if (Q === 1) { Q = 0; sun.castShadow = false; } else if (pr > .8) { pr = Math.max(.8, pr * .85); renderer.setPixelRatio(pr); resize(); } } } }
  requestAnimationFrame(frame);
}
P.yaw = 0;
$("#loading").hidden = true; openSheet(sheetMenu(), "menu"); requestAnimationFrame(frame);
// contatore anonimo delle persone collegate (../online.js): sito intero e quanti sono nella sala
if (window.YG_ONLINE) { const el = $("#online"), tx = el.querySelector("span"); window.YG_ONLINE.on(c => { el.hidden = false; tx.textContent = `${c.tot.toLocaleString("it-IT")} online · ${c.sala.toLocaleString("it-IT")} nella sala`; }); }
window.__sala = { P, INTER, tonight, NOW, NEXT, COUNTRIES, get pr() { return pr; }, get Q() { return Q; }, get view() { return view; } }; // per le prove
