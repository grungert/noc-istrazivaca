import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Space, glowTexture } from './space.js';
import { Molecule } from './molecule.js';
import { offlineAnswer } from './offline.js';
import { AnswerStream } from './stream.js';
import { Hands } from './hands.js';
import { describe } from './catalog.js';
import { UfoShow } from './ufo.js';

const IDLE_RESET_MS = 3 * 60 * 1000;
const EXAMPLES = [
  'Dodaj još jedno Sunce 🌞',
  'Šta ako je gravitacija duplo jača?',
  'Ubaci crnu rupu pored Zemlje',
  'Šutni Zemlju iz orbite!',
  'Pokaži molekul kofeina ☕',
  'Kako izgleda molekul DNK?',
  'Napravi planetu sa prstenovima',
  'Isključi gravitaciju',
  'Sudari Jupiter i Saturn 💥',
  'Napravi dvojnu zvijezdu kao Tatooine',
  'Koji molekul nas čini srećnim?',
  'Pokaži crnu rupu izbliza',
  'Zašto Mjesec ne padne na Zemlju?',
  'Pretvori Sunce u neutronsku zvijezdu',
];

// ---------- 3D ----------

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#02030a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 6000);
camera.position.set(0, 95, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;
controls.maxDistance = 1500;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.5, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(starfield());

const space = new Space(scene, toast);
const molecule = new Molecule(scene);
const ufo = new UfoShow(space, { onEvent: toast, onDone: () => endCinema() });
let mode = 'svemir';
let camGoal = null; // { pos, target } — glatki prelaz kamere

function starfield() {
  const n = 5000;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    v.randomDirection();
    // gušća traka — nagovještaj Mliječnog puta
    if (i % 3 === 0) v.y *= 0.15;
    v.normalize().multiplyScalar(1800 + Math.random() * 800);
    pos.set(v.toArray(), i * 3);
    c.setHSL(0.55 + Math.random() * 0.15 - (Math.random() < 0.2 ? 0.45 : 0), 0.5, 0.55 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  space.group.visible = mode === 'svemir';
  molecule.group.visible = mode === 'molekul';
  bloom.strength = mode === 'svemir' ? 0.85 : 0.25;
  if (mode === 'molekul') frameMolecule();
  else frameAll();
}

function frameMolecule() {
  space.follow = null;
  const d = molecule.radius * 3.2 + 3;
  camGoal = { pos: new THREE.Vector3(0, d * 0.35, d), target: new THREE.Vector3() };
}

function frameAll() {
  space.follow = null;
  const far = Math.max(60, ...space.bodies.filter((b) => b.pos.length() < 400).map((b) => b.pos.length()));
  camGoal = { pos: new THREE.Vector3(0, far * 0.8, far * 1.35), target: new THREE.Vector3() };
}

function focusBody(b) {
  space.follow = b;
  const d = Math.max(b.radius * 9, 14);
  camGoal = { pos: b.pos.clone().add(new THREE.Vector3(0, d * 0.5, d)), target: b.pos.clone(), follow: true };
}

// ---------- akcije koje model šalje ----------

function applyActions(actions = []) {
  const notes = [];
  for (const a of actions) {
    try {
      if (a.type === 'molecule') {
        if (molecule.show(a)) setMode('molekul'), frameMolecule();
        continue;
      }
      if (a.type === 'show') {
        setMode(a.scene === 'molekul' ? 'molekul' : 'svemir');
        continue;
      }
      setMode('svemir');
      switch (a.type) {
        case 'preset':
          space.preset(a.name);
          frameAll();
          break;
        case 'add_body': {
          const b = space.addBody(a);
          if (b.kind === 'crna_rupa' || b.kind === 'zvijezda') frameAll();
          break;
        }
        case 'remove_body':
          space.removeBody(space.find(a.name));
          break;
        case 'push': {
          const b = space.find(a.name);
          if (b && Array.isArray(a.velocity_change)) b.vel.add(new THREE.Vector3().fromArray(a.velocity_change.map(Number)));
          break;
        }
        case 'set_body': {
          const b = space.find(a.name);
          if (!b) break;
          if (a.mass != null) b.mass = Math.max(0, Number(a.mass));
          if (a.radius != null) b.radius = THREE.MathUtils.clamp(Number(a.radius), 0.1, 30);
          if (a.color) b.color = a.color;
          if (a.kind) b.kind = a.kind;
          space.buildMesh(b);
          space.accDirty = true;
          break;
        }
        case 'set_gravity':
          space.gravity = THREE.MathUtils.clamp(Number(a.multiplier), 0, 20);
          space.accDirty = true;
          break;
        case 'set_time':
          space.timeScale = THREE.MathUtils.clamp(Number(a.multiplier), 0, 5);
          break;
        case 'focus': {
          const b = a.target && a.target !== 'sve' ? space.find(a.target) : null;
          b ? focusBody(b) : frameAll();
          break;
        }
        case 'particles':
          space.setParticles(a.preset, a.count);
          break;
        default:
          notes.push(`nepoznata akcija: ${a.type}`);
      }
    } catch (e) {
      console.error(a, e);
      notes.push(`${a.type}: ${e.message}`);
    }
  }
  return notes;
}

// ---------- petlja ----------

const clock = new THREE.Clock();
const followDelta = new THREE.Vector3();
function loop() {
  const dt = clock.getDelta();
  if (mode === 'svemir') {
    const before = space.follow?.pos.clone();
    space.update(dt);
    ufo.update(dt);
    if (space.follow && before && space.bodies.includes(space.follow)) {
      // kamera se kreće zajedno sa praćenim tijelom
      followDelta.subVectors(space.follow.pos, before);
      camera.position.add(followDelta);
      controls.target.add(followDelta);
      if (camGoal?.follow) {
        camGoal.pos.add(followDelta);
        camGoal.target.copy(space.follow.pos);
      }
    }
  } else {
    molecule.update(dt);
  }
  if (visited && (!space.bodies.includes(visited) || mode !== 'svemir')) leaveVisit(mode === 'svemir');
  updateSurface();
  updateCinema(dt);
  if (camGoal) {
    const k = 1 - Math.pow(0.02, dt);
    camera.position.lerp(camGoal.pos, k);
    controls.target.lerp(camGoal.target, k);
    if (camera.position.distanceTo(camGoal.pos) < 0.3) camGoal = null;
  }
  controls.update();
  composer.render();
  labels.render(scene, camera);
  updatePointer(dt);
  updateHud();
  requestAnimationFrame(loop);
}

// Pomjeri centar slike ulijevo za pola širine panela, da scena ne bude ispod razgovora.
function fitView() {
  camera.aspect = innerWidth / innerHeight;
  if (innerWidth > 760) camera.setViewOffset(innerWidth, innerHeight, Math.min(440, innerWidth - 48) / 2 + 12, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
fitView();

addEventListener('resize', () => {
  fitView();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});
controls.addEventListener('start', () => (camGoal = null));

// ---------- UI ----------

const $ = (id) => document.getElementById(id);
const log = $('log');
const input = $('input');
const hud = $('hud');
const history = [];
let brain = 'offline';
let busy = false;
let lastToast = '';

function updateHud() {
  if (mode === 'molekul') {
    hud.innerHTML = `<b>${molecule.name || 'Molekul'}</b> · ${molecule.model.children.filter((c) => c.geometry === molecule.sphere).length} atoma · prevuci mišem za rotaciju${lastToast}`;
  } else {
    hud.innerHTML = `Tijela: <b>${space.bodies.length}</b> · Gravitacija: <b>×${+space.gravity.toFixed(2)}</b> · Vrijeme: <b>×${+space.timeScale.toFixed(2)}</b>${
      space.follow ? ` · Prati: <b>${space.follow.name}</b>` : ''
    }${lastToast}`;
  }
}

let toastTimer;
function toast(text) {
  lastToast = `<br><span style="color:#ffd48a">${text}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (lastToast = ''), 5000);
}

function addMsg(cls, html) {
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  log.appendChild(el);
  while (log.children.length > 12) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  return el;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function renderChips() {
  const chips = $('chips');
  chips.innerHTML = '';
  [...EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 4).forEach((ex) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = ex;
    b.onclick = () => ask(ex.replace(/\s*\p{Extended_Pictographic}.*$/u, ''));
    chips.appendChild(b);
  });
}

function sceneState() {
  return {
    prikaz: mode,
    molekul: mode === 'molekul' ? molecule.name : null,
    ...space.snapshot(),
  };
}

// dok model radi, pokaži šta otprilike radi — čekanje od 10–20 s tako ne djeluje prazno
const STEPS = {
  molekul: ['Čitam pitanje', 'Prisjećam se strukture molekula', 'Računam uglove veza', 'Raspoređujem atome u 3D', 'Provjeravam vodonike'],
  svemir: ['Čitam pitanje', 'Gledam trenutnu scenu', 'Računam mase i orbite', 'Biram akcije za simulaciju', 'Pišem objašnjenje'],
};
function thinkingTicker(text) {
  const el = document.querySelector('.thinking__text');
  const steps = /molek|atom|dnk|kofein|protein|hemij|vitamin|hormon|serotonin|dopamin/i.test(text) ? STEPS.molekul : STEPS.svemir;
  let i = 0;
  el.firstChild.textContent = steps[0];
  const id = setInterval(() => (el.firstChild.textContent = steps[++i % steps.length]), 2800);
  return () => {
    clearInterval(id);
    el.firstChild.textContent = 'Claude razmišlja';
  };
}

// narrateOnly: model samo priča (posjeta planeti, NLO) — njegove akcije se ne izvršavaju
async function ask(text, shown = text, { narrateOnly = false } = {}) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  touch();
  input.value = '';
  $('go').disabled = true;
  addMsg('msg--user', esc(shown));
  // tokom posjete i NLO predstave centar ekrana ostaje slobodan
  $('thinking').hidden = narrateOnly;
  const stopTicker = thinkingTicker(text);

  let answer = null;
  let source = brain;
  let applied = 0;
  let bubble = null;
  const started = performance.now();

  // poruka se pravi čim stigne prvi tekst, pa se puni dok model piše
  const openBubble = () => {
    if (bubble) return bubble;
    $('thinking').hidden = true;
    stopTicker();
    bubble = addMsg('msg--ai', `<div class="who">Claude Opus 5.5 <small>piše…</small></div><div class="say"></div>`);
    return bubble;
  };
  const setStatus = (html) => bubble && (bubble.querySelector('.who small').innerHTML = html);

  if (brain === 'claude') {
    try {
      const parser = new AnswerStream({
        onSay: (s) => {
          openBubble().querySelector('.say').textContent = s;
          log.scrollTop = log.scrollHeight;
        },
        onAction: (a) => {
          if (narrateOnly) return;
          applied++;
          applyActions([a]);
          setStatus(`piše… · izvršeno akcija: ${applied}`);
        },
        onProgress: (type, atoms) => {
          if (type === 'molecule' && atoms) setStatus(`slažem molekul… atoma: ${atoms}`);
        },
      });
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, state: sceneState(), history }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (msg.t === 'delta') parser.push(msg.text);
          else if (msg.t === 'done') answer = msg.answer;
          else if (msg.t === 'error') throw new Error(msg.error);
        }
      }
      if (!answer) throw new Error('Prekinut odgovor');
    } catch (e) {
      console.warn('Model nedostupan:', e.message);
      answer = null;
    }
  }
  if (!answer) {
    // ako je model već nešto uradio pa pukao, ne miješaj sa offline odgovorom
    source = applied ? 'claude' : 'offline';
    answer = applied ? { say: bubble?.querySelector('.say').textContent || '', actions: [] } : offlineAnswer(text, space);
  }
  $('thinking').hidden = true;
  stopTicker();

  // izvrši ono što stream nije stigao (npr. odgovor iz keša dolazi odjednom)
  const actions = narrateOnly || !Array.isArray(answer.actions) ? [] : answer.actions;
  const notes = applyActions(actions.slice(applied));
  if (notes.length) console.warn(notes);

  const secs = (ms) => (ms / 1000).toFixed(1);
  const timing = answer.cached
    ? 'iz memorije'
    : answer.first
      ? `prvi tekst za ${secs(answer.first)} s · gotovo za ${secs(answer.ms)} s`
      : `razmišljao ${secs(answer.ms ?? performance.now() - started)} s`;
  const who = source === 'claude' ? `Claude Opus 5.5 <small>${timing} · ${actions.length} akcija</small>` : 'Offline režim';
  let html = `<div class="who">${who}</div><div class="say">${esc(answer.say)}</div>`;
  if (answer.fact) html += `<div class="fact">💡 ${esc(answer.fact)}</div>`;
  if ($('raw').checked && actions.length) html += `<pre>${esc(JSON.stringify(actions, null, 1))}</pre>`;
  if (bubble) bubble.innerHTML = html;
  else addMsg('msg--ai', html);
  log.scrollTop = log.scrollHeight;

  history.push({ q: shown, a: answer.say });
  if (history.length > 6) history.shift();
  renderChips();
  busy = false;
  $('go').disabled = false;
  input.focus();
}

$('ask').addEventListener('submit', (e) => {
  e.preventDefault();
  ask(input.value);
});

// glasovni unos (besplatni Web Speech API u Chrome-u)
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('mic');
if (!Recognition) mic.hidden = true;
else {
  const rec = new Recognition();
  rec.lang = 'sr-RS';
  rec.interimResults = true;
  let listening = false;
  rec.onresult = (e) => {
    input.value = [...e.results].map((r) => r[0].transcript).join('');
  };
  rec.onend = () => {
    listening = false;
    mic.classList.remove('on');
    if (input.value.trim()) ask(input.value);
  };
  rec.onerror = () => mic.classList.remove('on');
  mic.onclick = () => {
    if (listening) return rec.stop();
    input.value = '';
    listening = true;
    mic.classList.add('on');
    rec.start();
  };
}

// ---------- pokazivač: kartica sa podacima, posjeta planeti, pogled sa površine ----------

const info = $('info');
const visitBar = $('visit-bar');
const UP = new THREE.Vector3(0, 1, 0);
const DWELL_S = 1.1;
let hovered = null; // tijelo ispod kursora
let visited = null; // tijelo koje posjećujemo (kamera ga prati)
let surface = null; // tijelo sa čije površine gledamo
let handPointer = null; // {x,y} u 0..1 — otvorena šaka
let mousePointer = null;
let dwell = { key: null, t: 0, fired: false };
let infoStamp = 0;

const projV = new THREE.Vector3();
function screenOf(b) {
  projV.copy(b.pos).project(camera);
  const dist = camera.position.distanceTo(b.pos);
  return {
    x: ((projV.x + 1) / 2) * innerWidth,
    y: ((1 - projV.y) / 2) * innerHeight,
    r: (b.radius / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (innerHeight / 2),
    behind: projV.z > 1,
  };
}

// najbliže tijelo ispod tačke ekrana (0..1); mala tijela imaju "magnet" od 26 px
function bodyAt(p) {
  if (mode !== 'svemir' || !p) return null;
  let best = null;
  let bestD = Infinity;
  for (const b of space.bodies) {
    if (b === surface) continue;
    const s = screenOf(b);
    if (s.behind) continue;
    const d = Math.hypot(s.x - p.x * innerWidth, s.y - p.y * innerHeight);
    if (d < Math.max(s.r * 1.3, 26) && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

// dugme koje se može "kliknuti" rukom, ili bilo koji UI (tada ne biramo tijela iza njega)
function uiAt(p) {
  const el = document.elementFromPoint(p.x * innerWidth, p.y * innerHeight);
  return el?.closest('.hand-target') || (el?.closest('.panel, .hands, .info, .brand, .status') ? 'ui' : null);
}

function updatePointer(dt) {
  const p = handPointer || mousePointer;
  let target = null;
  let body = null;
  if (p) {
    const ui = uiAt(p);
    if (ui && ui !== 'ui') target = ui;
    else if (!ui) body = bodyAt(p);
  }
  document.querySelectorAll('.hand-target.hover').forEach((e) => e !== target && e.classList.remove('hover'));
  target?.classList.add('hover');
  hovered = body;
  renderer.domElement.style.cursor = body && !handPointer ? 'pointer' : '';

  // "klik" rukom: zadrži kursor na istoj meti
  const key = handPointer ? target || (body !== visited ? body : null) : null;
  if (key && key === dwell.key) {
    if (!dwell.fired && (dwell.t += dt) >= DWELL_S) {
      dwell.fired = true;
      key instanceof HTMLElement ? key.click() : visitBody(key);
    }
  } else {
    dwell = { key, t: 0, fired: false };
  }
  if (hands) hands.dwell = key && !dwell.fired ? dwell.t / DWELL_S : 0;

  renderInfo();
}

function renderInfo() {
  const b = hovered && hovered !== visited ? hovered : visited;
  if (!b || mode !== 'svemir') {
    info.hidden = true;
    info.dataset.body = '';
    return;
  }
  const now = performance.now();
  if (info.dataset.body !== b.name || now - infoStamp > 400) {
    // podaci iz simulacije se mijenjaju — osvježi nekoliko puta u sekundi
    infoStamp = now;
    const d = describe(b);
    const rows = (list) => list.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    info.innerHTML = `
      <div class="info__name" style="--c:${esc(b.color)}">${esc(d.name)}</div>
      <div class="info__type">${esc(d.tip)}</div>
      <div class="info__rows">${rows(d.rows)}</div>
      ${d.sim ? `<div class="info__rows info__rows--sim">${rows(d.sim)}</div>` : ''}
      ${d.fact ? `<div class="info__fact">💡 ${esc(d.fact)}</div>` : ''}
      ${b !== visited ? `<div class="info__hint">${handPointer ? 'zadrži ruku ovdje' : 'klikni'} za posjetu 🚀</div>` : ''}`;
    info.dataset.body = b.name;
  }
  info.hidden = false;
  const pinned = b === visited;
  info.classList.toggle('info--pinned', pinned);
  if (pinned) {
    info.style.left = info.style.top = '';
    return;
  }
  const s = screenOf(b);
  const x = Math.min(s.x + Math.max(s.r, 10) + 24, innerWidth - info.offsetWidth - 16);
  const y = THREE.MathUtils.clamp(s.y - info.offsetHeight / 2, 90, innerHeight - info.offsetHeight - 16);
  info.style.left = `${x}px`;
  info.style.top = `${y}px`;
}

function visitBody(b) {
  if (!b || !space.bodies.includes(b) || b === visited) return;
  exitSurface(false);
  visited = b;
  focusBody(b);
  visitBar.hidden = false;
  visitBar.querySelector('[data-act=surface]').hidden = !['planeta', 'gasni_div', 'mjesec'].includes(b.kind);
  toast(`🚀 Letimo do: ${b.name}`);
  touch();
  if (!busy) {
    ask(
      `Posjetilac je upravo doletio do tijela "${b.name}" (kamera ga prati izbliza). Ispričaj mu, kao turistički vodič kroz svemir, šta bi ovdje vidio i doživio. Samo objasni — ne šalji akcije.`,
      `🚀 Doletio sam do: ${b.name}`,
      { narrateOnly: true }
    );
  }
}

function leaveVisit(reframe = true) {
  exitSurface(false);
  visited = null;
  visitBar.hidden = true;
  if (reframe) frameAll();
}

// kamera stoji tik iznad površine i gleda ka zvijezdi
function enterSurface() {
  if (!visited) return;
  surface = visited;
  space.follow = null;
  controls.enabled = false;
  setLabel(surface, false);
  visitBar.querySelector('[data-act=surface]').textContent = '🛰 Nazad u orbitu';
  toast(`🌅 Stojiš na površini: ${surface.name}`);
  touch();
}

function exitSurface(reframe = true) {
  if (!surface) return;
  const b = surface;
  surface = null;
  controls.enabled = true;
  setLabel(b, true);
  controls.autoRotate = true;
  visitBar.querySelector('[data-act=surface]').textContent = '🌅 Pogled sa površine';
  if (reframe && space.bodies.includes(b)) focusBody(b);
}

function setLabel(b, visible) {
  b.object.traverse((o) => o.isCSS2DObject && (o.visible = visible));
}

function updateSurface() {
  if (!surface) return;
  const others = space.bodies.filter((x) => x !== surface);
  const star =
    others.filter((x) => ['zvijezda', 'neutronska_zvijezda', 'crna_rupa'].includes(x.kind)).sort((a, c) => c.mass - a.mass)[0] ||
    others.sort((a, c) => c.mass - a.mass)[0];
  const toStar = star ? star.pos.clone().sub(surface.pos).normalize() : new THREE.Vector3(1, 0, 0);
  // na "sjevernom" dijelu planete: horizont je dolje, a zvijezda izlazi ispred posmatrača
  const eye = UP.clone().addScaledVector(toStar, -0.12).normalize().multiplyScalar(surface.radius * 1.045);
  camera.position.copy(surface.pos).add(eye);
  controls.target.copy(star ? star.pos : surface.pos.clone().add(toStar));
  controls.autoRotate = false;
  camGoal = null;
}

visitBar.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'back') leaveVisit();
  else if (act === 'surface') surface ? exitSurface() : enterSurface();
});

// miš: prelaz preko tijela prikazuje karticu, klik (bez povlačenja) vodi na posjetu
{
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointermove', (e) => (mousePointer = { x: e.clientX / innerWidth, y: e.clientY / innerHeight }));
  el.addEventListener('pointerleave', () => (mousePointer = null));
  el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  el.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) visitBody(bodyAt({ x: e.clientX / innerWidth, y: e.clientY / innerHeight }));
    down = null;
  });
}

// ---------- upravljanje rukama ----------

const raycaster = new THREE.Raycaster();
const orbitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const COMET_COLORS = ['#9ff3ff', '#b8ffcf', '#ffe29a', '#ffb3f0', '#c9b8ff'];
let ghost = null;

// tačka ekrana (0..1) → tačka u ravni orbita
function screenToWorld(p) {
  orbitPlane.constant = -controls.target.y;
  raycaster.setFromCamera(new THREE.Vector2(p.x * 2 - 1, -(p.y * 2 - 1)), camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(orbitPlane, hit)) return null;
  const c = controls.target;
  if (hit.distanceTo(c) > 160) hit.sub(c).setLength(160).add(c);
  return hit;
}

function orbitBy(dTheta, dPhi) {
  if (cine) return; // tokom NLO predstave kameru vodi režija
  const off = camera.position.clone().sub(controls.target);
  const s = new THREE.Spherical().setFromVector3(off);
  s.theta -= dTheta;
  s.phi = THREE.MathUtils.clamp(s.phi - dPhi, 0.08, Math.PI - 0.08);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
  camGoal = null;
}

function zoomBy(f) {
  if (cine) return;
  const off = camera.position.clone().sub(controls.target);
  const d = THREE.MathUtils.clamp(off.length() * THREE.MathUtils.clamp(f, 0.85, 1.18), 3, controls.maxDistance);
  camera.position.copy(controls.target).add(off.setLength(d));
  camGoal = null;
}

function showGhost(p) {
  const w = mode === 'svemir' && screenToWorld(p);
  if (!w) return;
  if (!ghost) {
    ghost = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9ff3ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    );
    scene.add(ghost);
  }
  const dist = camera.position.distanceTo(w);
  ghost.scale.setScalar(dist * 0.06);
  ghost.position.copy(w);
  ghost.visible = true;
}
const hideGhost = () => ghost && (ghost.visible = false);

function throwComet(p, v) {
  hideGhost();
  if (mode !== 'svemir') return;
  const pos = screenToWorld(p);
  const ahead = screenToWorld({ x: p.x + v.x * 0.2, y: p.y + v.y * 0.2 });
  if (!pos) return;
  const vel = ahead ? ahead.sub(pos).divideScalar(0.2).multiplyScalar(0.05) : new THREE.Vector3();
  if (vel.length() > 14) vel.setLength(14);

  const comets = space.bodies.filter((b) => b.kind === 'kometa');
  if (comets.length >= 10) space.removeBody(comets[0]);
  space.addBody({
    name: 'Kometa',
    kind: 'kometa',
    mass: 0.00001,
    radius: 0.6,
    color: COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)],
    position: pos.toArray(),
    velocity: vel.toArray(),
  });
  space.explode(pos, 0.8, '#9ff3ff');
  toast(`☄️ Kometa bačena brzinom ${vel.length().toFixed(1)}!`);
  touch();
}

// 🖖 → leteći tanjir usisa kometu ili Mjesec, a Claude prokomentariše susret
// ---------- NLO predstava: kamera prati tanjir, vrijeme je usporeno ----------

let cine = null; // { offset, timeScale, endAt }

function summonUfo() {
  if (ufo.busy) return;
  setMode('svemir');
  if (visited) leaveVisit(false);
  exitSurface(false);

  // ako je Mjesec već otet (ili se sudario), vrati ga da predstava uvijek ima "žrtvu"
  const earth = space.find('Zemlja');
  if (earth?.name === 'Zemlja' && !space.bodies.some((b) => b.kind === 'mjesec')) {
    space.addBody({ name: 'Mjesec', kind: 'mjesec', mass: 0.00004, radius: 0.35, color: '#c8c8c8', distance: 1.9, orbit_around: 'Zemlja' });
  }

  const target = ufo.pickTarget();
  // kamera stoji iza mete, gleda ka njoj, a planeta domaćin je u pozadini
  const host = target?.host && space.bodies.includes(target.host) ? target.host : null;
  const away = target ? (host ? target.pos.clone().sub(host.pos) : target.pos.clone()).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
  const scale = Math.max(1.6, (target?.radius || 1) * 2.4);
  const offset = away.multiplyScalar(scale * 6.5).add(new THREE.Vector3(0, scale * 3.2, 0));
  const from = target ? target.pos.clone().add(offset.clone().multiplyScalar(3)).add(new THREE.Vector3(scale * 12, scale * 6, 0)) : null;

  ufo.start(camera, from);
  cine = { offset, timeScale: space.timeScale, endAt: 0 };
  space.timeScale = Math.min(space.timeScale, 0.25);
  space.follow = null;
  camGoal = null;
  controls.autoRotate = false;
  touch();
  if (!busy) {
    ask(
      `Posjetilac je pokazao vulkanski pozdrav 🖖 i u simulaciju je uletio leteći tanjir sa vanzemaljcem koji zrakom usisava tijelo "${target?.name || 'ništa'}" — to radi sam NLO, ne ti, pa ne govori da si ti nešto uklonio. Reaguj duhovito (Star Trek fore su dobrodošle), pa u jednoj-dvije rečenice objasni pravu nauku o potrazi za vanzemaljskim životom. Ne šalji akcije.`,
      '🖖 Živi dugo i napreduj!',
      { narrateOnly: true }
    );
  }
}

function updateCinema(dt) {
  if (!cine) return;
  if (cine.endAt) {
    // poslije odlaska: kratka pauza, pa povratak na pregled sistema
    if (performance.now() > cine.endAt) {
      space.timeScale = cine.timeScale;
      cine = null;
      controls.autoRotate = true;
      frameAll();
    }
    return;
  }
  const focus = ufo.focusPoint();
  if (!focus) return;
  const k = 1 - Math.pow(0.004, dt); // brže od običnih prelaza — kamera mora da "uhvati" Mjesec
  camera.position.lerp(focus.clone().add(cine.offset), k);
  controls.target.lerp(focus, k);
}

function endCinema() {
  if (cine) cine.endAt = performance.now() + 1500;
}

// rezervna varijanta bez kamere: taster K baca kometu, a taster U doziva NLO
addEventListener('keydown', (e) => e.key.toLowerCase() === 'u' && document.activeElement !== input && summonUfo());

// taster K baca kometu sa ivice ekrana ka centru
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'k' || document.activeElement === input) return;
  const side = Math.random() < 0.5 ? 0.1 : 0.55;
  throwComet({ x: side, y: 0.25 + Math.random() * 0.5 }, { x: (0.32 - side) * 4, y: (Math.random() - 0.5) * 0.6 });
});

let hands = null;
let grab = null;
const handsBtn = $('hands-btn');
handsBtn.onclick = async () => {
  if (hands) {
    hands.stop();
    hands = null;
    handsBtn.classList.remove('on');
    controls.autoRotate = true;
    handPointer = null;
    return;
  }
  handsBtn.classList.add('on');
  hands = new Hands({
    onPointer: (p) => (handPointer = p),
    onVulcan: summonUfo,
    onRotate: (dx, dy) => (orbitBy(dx * 5, dy * 3), touch()),
    onZoom: (f) => zoomBy(Math.pow(f, 1.6)),
    onGrab: (p) => {
      grab = { t: performance.now(), body: bodyAt(p) };
      showGhost(p);
    },
    onHold: showGhost,
    onThrow: (p, v) => {
      // kratak uštip na tijelu bez zamaha = klik
      if (grab?.body && performance.now() - grab.t < 500 && Math.hypot(v.x, v.y) < 0.8) {
        hideGhost();
        visitBody(grab.body);
      } else if (Math.hypot(v.x, v.y) > 0.35) {
        throwComet(p, v);
      } else {
        hideGhost(); // uštip bez zamaha — ništa se ne baca
      }
      grab = null;
    },
    onDrop: hideGhost,
    onHandsVisible: (v) => (controls.autoRotate = !v),
    onStatus: (s) => s && toast(`✋ ${s}`),
  });
  try {
    await hands.start();
    toast('✋ Ruke su aktivne — pogledaj uputstvo dolje lijevo');
  } catch (e) {
    console.error(e);
    toast(`✋ Kamera nije dostupna: ${e.message}`);
    hands.stop();
    hands = null;
    handsBtn.classList.remove('on');
  }
};

// kiosk: nakon perioda neaktivnosti sve se vraća na početak
let idleTimer;
function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => resetScene({ clearChat: true }), IDLE_RESET_MS);
}
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, touch));

// vraća početno stanje: Sunčev sistem, normalna gravitacija i vrijeme, pogled na cijeli sistem
function resetScene({ clearChat = false } = {}) {
  if (cine) {
    space.timeScale = cine.timeScale;
    cine = null;
  }
  if (visited) leaveVisit(false);
  exitSurface(false);
  setMode('svemir');
  space.preset('suncev_sistem');
  controls.enabled = true;
  controls.autoRotate = true;
  frameAll();
  if (clearChat) {
    history.length = 0;
    log.innerHTML = '';
    greet();
  } else {
    toast('↺ Vraćeno na početak');
  }
}
$('reset-btn').onclick = () => resetScene();

// cijeli ekran (za projektor); natpis prati stanje i kad se izađe sa Esc ili F11
const fsBtn = $('fullscreen-btn');
fsBtn.onclick = () =>
  (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch((e) => toast(`⛶ Cijeli ekran nije dostupan: ${e.message}`));
document.addEventListener('fullscreenchange', () => {
  fsBtn.textContent = document.fullscreenElement ? '⛶ Izađi' : '⛶ Cijeli ekran';
});
// Esc radi i dok je fokus u polju za unos
addEventListener('keydown', (e) => e.key === 'Escape' && resetScene());

function greet() {
  addMsg(
    'msg--ai',
    `<div class="who">Claude Opus 5.5</div>Zdravo! 👋 Ja upravljam ovim svemirom. Napiši ili izgovori šta želiš — dodaću zvijezde, crne rupe, promijeniti gravitaciju ili ti pokazati bilo koji molekul u 3D.`
  );
}

async function init() {
  try {
    const s = await (await fetch('/api/status')).json();
    brain = s.brain;
  } catch {
    brain = 'offline';
  }
  const status = $('status');
  status.classList.add(brain === 'claude' ? 'live' : 'offline');
  $('status-text').textContent = brain === 'claude' ? 'Opus 5.5 · uživo' : 'Offline režim';

  space.preset('suncev_sistem');
  renderChips();
  greet();
  touch();
  loop();
  input.focus();
}

init();
