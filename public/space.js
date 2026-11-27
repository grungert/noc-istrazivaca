// Svemirska scena: prava N-body simulacija (G = 1), sudari, crne rupe i oblak čestica.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const SUBSTEPS = 8;
const SIM_RATE = 1.4; // jedinica simuliranog vremena po sekundi pri set_time = 1
const SOFTENING = 0.3;
const TRAIL = 360;
const ESCAPE = 3000;

const KINDS = {
  zvijezda: { mass: 800, radius: 5, color: '#ffd27a' },
  neutronska_zvijezda: { mass: 1500, radius: 0.8, color: '#bfe0ff' },
  crna_rupa: { mass: 3000, radius: 1.8, color: '#000000' },
  // planete imaju realne odnose masa prema zvijezdi (Zemlja ≈ 1/330 000 Sunca, Jupiter ≈ 1/1000),
  // pa su orbite stabilne kao u pravom Sunčevom sistemu
  planeta: { mass: 0.003, radius: 1.2, color: '#5aa0ff' },
  gasni_div: { mass: 0.5, radius: 3, color: '#d9a066' },
  mjesec: { mass: 0.00004, radius: 0.4, color: '#bbbbbb' },
  kometa: { mass: 0.00001, radius: 0.3, color: '#aee8ff' },
};
const LUMINOUS = new Set(['zvijezda', 'neutronska_zvijezda']);

// ---------- proceduralne teksture ----------

let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function planetTexture(hex, banded) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(hex);
  const shade = (dl, ds = 0) => '#' + base.clone().offsetHSL(0, ds, dl).getHexString();
  g.fillStyle = shade(0);
  g.fillRect(0, 0, 256, 128);
  if (banded) {
    const phase = Math.random() * 10;
    for (let y = 0; y < 128; y++) {
      const v = Math.sin(y * 0.22 + phase) * 0.08 + Math.sin(y * 0.61 + phase * 2) * 0.05;
      g.fillStyle = shade(v, v * 0.5);
      g.fillRect(0, y, 256, 1);
    }
    g.globalAlpha = 0.5;
    g.fillStyle = shade(-0.15, 0.1);
    g.beginPath();
    g.ellipse(80 + Math.random() * 100, 70 + Math.random() * 20, 14, 7, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.12 + Math.random() * 0.15;
      g.fillStyle = shade((Math.random() - 0.5) * 0.3);
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 16, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture(hex, hot = false) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1;
  const g = c.getContext('2d');
  const base = new THREE.Color(hex);
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    let a, col;
    if (hot) {
      a = Math.pow(1 - t, 1.5) * (0.6 + 0.4 * Math.random());
      col = new THREE.Color().setHSL(0.08 - t * 0.05, 1, 0.75 - t * 0.35);
    } else {
      a = (0.25 + 0.5 * Math.random()) * Math.sin(t * Math.PI);
      if (t > 0.55 && t < 0.6) a *= 0.1; // Kasinijeva pukotina
      col = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
    }
    g.fillStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
    g.fillRect(x, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// RingGeometry mapira teksturu radijalno (u = udaljenost od centra).
function radialRing(inner, outer, tex, additive) {
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---------- scena ----------

export class Space {
  constructor(scene, onEvent) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.onEvent = onEvent;
    this.bodies = [];
    this.gravity = 1;
    this.timeScale = 1;
    this.follow = null;
    this.effects = [];
    this.particleCfg = { preset: 'nista', count: 0 };

    this.group.add(new THREE.AmbientLight(0xffffff, 0.12));
    this.initParticles();
  }

  get G() {
    return this.gravity;
  }

  find(name) {
    if (!name) return null;
    const n = String(name).toLowerCase().trim();
    return (
      this.bodies.find((b) => b.name.toLowerCase() === n) ||
      this.bodies.find((b) => b.name.toLowerCase().includes(n) || n.includes(b.name.toLowerCase()))
    );
  }

  heaviest() {
    return this.bodies.reduce((a, b) => (!a || b.mass > a.mass ? b : a), null);
  }

  uniqueName(name) {
    let n = name || 'Tijelo';
    let i = 2;
    while (this.bodies.some((b) => b.name.toLowerCase() === n.toLowerCase())) n = `${name} ${i++}`;
    return n;
  }

  // ---------- tijela ----------

  addBody(spec) {
    const kind = KINDS[spec.kind] ? spec.kind : 'planeta';
    const d = KINDS[kind];
    const b = {
      name: this.uniqueName(spec.name),
      kind,
      mass: Math.max(0, Number(spec.mass ?? d.mass)),
      radius: THREE.MathUtils.clamp(Number(spec.radius ?? d.radius), 0.1, 30),
      color: spec.color || d.color,
      rings: !!spec.rings,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      acc: new THREE.Vector3(),
    };

    const parent = spec.orbit_around ? this.find(spec.orbit_around) || this.heaviest() : null;
    if (parent) {
      const dist = Math.max(Number(spec.distance) || parent.radius * 4 + 4, parent.radius + b.radius + 0.5);
      const ang = spec.angle ?? Math.random() * Math.PI * 2;
      const incl = (Math.random() - 0.5) * 0.04;
      b.pos.set(Math.cos(ang) * dist, Math.sin(incl) * dist, Math.sin(ang) * dist).add(parent.pos);
      // Mjesec oko planete: stvarna masa planete je premala da ga zadrži na ovoj (vizuelno uvećanoj)
      // udaljenosti, pa mjesec "osjeća" planetu jače — dovoljno da mu Hilova sfera bude ~3× veća od orbite
      if (b.kind === 'mjesec' && !LUMINOUS.has(parent.kind) && parent.kind !== 'crna_rupa') {
        const star = this.bodies.filter((x) => x !== parent && (LUMINOUS.has(x.kind) || x.kind === 'crna_rupa')).sort((p, q) => q.mass - p.mass)[0];
        const a = star ? parent.pos.distanceTo(star.pos) : 0;
        b.host = parent;
        b.hostMass = a ? Math.max(parent.mass, 3 * star.mass * (dist / (0.3 * a)) ** 3) : parent.mass;
      }
      const v = Math.sqrt((this.G * ((b.hostMass ?? parent.mass) + b.mass)) / dist);
      b.vel.set(-Math.sin(ang) * v, 0, Math.cos(ang) * v).add(parent.vel);
    } else {
      if (Array.isArray(spec.position)) b.pos.fromArray(spec.position.map(Number));
      if (Array.isArray(spec.velocity)) b.vel.fromArray(spec.velocity.map(Number));
    }

    this.buildMesh(b);
    this.bodies.push(b);
    this.accDirty = true;
    return b;
  }

  buildMesh(b) {
    if (b.object) {
      this.group.remove(b.object);
      b.object.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose?.();
        o.material?.dispose?.();
        if (o.isCSS2DObject) o.element.remove();
      });
    }
    const obj = new THREE.Group();
    const color = new THREE.Color(b.color);
    const r = b.radius;
    const sphere = new THREE.SphereGeometry(1, 48, 32);

    if (LUMINOUS.has(b.kind)) {
      const hot = color.clone().multiplyScalar(1.6);
      obj.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: hot, toneMapped: false })));
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      glow.scale.setScalar(b.kind === "neutronska_zvijezda" ? 12 : 3.6);
      obj.add(glow);
      const light = new THREE.PointLight(color, b.kind === 'zvijezda' ? 2.6 : 1.6, 0, 0);
      obj.add(light);
    } else if (b.kind === 'crna_rupa') {
      obj.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const disk = radialRing(1.5, 6, ringTexture('#ff9a3c', true), true);
      disk.rotation.x = -Math.PI / 2 + 0.25;
      obj.add(disk);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })
      );
      halo.scale.setScalar(9);
      obj.add(halo);
    } else {
      const banded = b.kind === 'gasni_div';
      const mat = new THREE.MeshStandardMaterial({ map: planetTexture(b.color, banded), roughness: 0.9, metalness: 0 });
      if (b.kind === 'kometa') {
        mat.emissive = new THREE.Color(b.color);
        mat.emissiveIntensity = 0.6;
      }
      const planet = new THREE.Mesh(sphere, mat);
      planet.userData.spin = 0.3 + Math.random() * 0.5;
      planet.rotation.z = (Math.random() - 0.5) * 0.5;
      obj.add(planet);
      if (b.rings) {
        const ring = radialRing(1.35, 2.4, ringTexture(b.color), false);
        ring.rotation.x = -Math.PI / 2 + 0.45;
        obj.add(ring);
      }
    }
    obj.scale.setScalar(r);

    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = b.name;
    const label = new CSS2DObject(el);
    label.position.set(0, 1.25, 0);
    label.center.set(0.5, 1);
    obj.add(label);

    // trag orbite: najnovija tačka je na kraju bafera
    const positions = new Float32Array(TRAIL * 3);
    const colors = new Float32Array(TRAIL * 3);
    const tc = b.kind === 'crna_rupa' ? new THREE.Color('#ff8a30') : color;
    for (let i = 0; i < TRAIL; i++) {
      const f = Math.pow(i / TRAIL, 1.6) * 0.8;
      colors.set([tc.r * f, tc.g * f, tc.b * f], i * 3);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tg.setDrawRange(TRAIL, 0);
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
    trail.frustumCulled = false;

    if (b.trail) this.group.remove(b.trail.line);
    b.trail = { line: trail, positions, count: 0, tick: 0 };
    this.group.add(trail);

    b.object = obj;
    obj.position.copy(b.pos);
    this.group.add(obj);
  }

  removeBody(b) {
    if (!b) return;
    this.detach(b);
    this.dispose(b);
  }

  // izbaci tijelo iz fizike, ali ostavi njegov 3D objekat (npr. dok ga NLO usisava)
  detach(b) {
    this.group.remove(b.trail.line);
    b.trail.line.geometry.dispose();
    this.bodies = this.bodies.filter((x) => x !== b);
    if (this.follow === b) this.follow = null;
    this.accDirty = true;
  }

  dispose(b) {
    this.group.remove(b.object);
    b.object.traverse((o) => o.isCSS2DObject && o.element.remove());
  }

  clear() {
    [...this.bodies].forEach((b) => this.removeBody(b));
    this.effects.forEach((e) => this.group.remove(e.sprite));
    this.effects = [];
  }

  // ---------- fizika ----------

  computeAcc() {
    const G = this.G;
    const bs = this.bodies;
    const eps2 = SOFTENING * SOFTENING;
    for (const b of bs) b.acc.set(0, 0, 0);
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j];
        const dx = c.pos.x - a.pos.x;
        const dy = c.pos.y - a.pos.y;
        const dz = c.pos.z - a.pos.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const inv = G / (r2 * Math.sqrt(r2));
        const mc = a.host === c ? a.hostMass : c.mass; // masa kojom c vuče a
        const ma = c.host === a ? c.hostMass : a.mass; // masa kojom a vuče c
        a.acc.x += dx * inv * mc;
        a.acc.y += dy * inv * mc;
        a.acc.z += dz * inv * mc;
        c.acc.x -= dx * inv * ma;
        c.acc.y -= dy * inv * ma;
        c.acc.z -= dz * inv * ma;
      }
    }
    this.accDirty = false;
  }

  step(dt) {
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      if (this.accDirty) this.computeAcc();
      for (const b of this.bodies) {
        b.vel.addScaledVector(b.acc, h / 2);
        b.pos.addScaledVector(b.vel, h);
      }
      this.computeAcc();
      for (const b of this.bodies) b.vel.addScaledVector(b.acc, h / 2);
      this.collide();
    }
    for (const b of [...this.bodies]) if (b.pos.length() > ESCAPE) this.removeBody(b);
  }

  collide() {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const c = bs[j];
        const reach = a.kind === 'crna_rupa' || c.kind === 'crna_rupa' ? 1.4 : 0.9;
        if (a.pos.distanceTo(c.pos) < (a.radius + c.radius) * reach) {
          this.merge(a.mass >= c.mass ? a : c, a.mass >= c.mass ? c : a);
          return this.collide();
        }
      }
    }
  }

  merge(big, small) {
    const m = big.mass + small.mass || 1;
    big.vel.multiplyScalar(big.mass).addScaledVector(small.vel, small.mass).divideScalar(m);
    big.pos.multiplyScalar(big.mass).addScaledVector(small.pos, small.mass).divideScalar(m);
    const grow = big.kind === 'crna_rupa' || LUMINOUS.has(big.kind)
      ? big.radius * Math.cbrt(m / (big.mass || 1)) ** 0.5
      : Math.cbrt(big.radius ** 3 + small.radius ** 3);
    big.mass = m;
    if (Math.abs(grow - big.radius) > 0.01) {
      big.radius = grow;
      big.object.scale.setScalar(grow);
    }
    this.explode(small.pos, Math.max(small.radius, 1.5), big.kind === 'crna_rupa' ? '#ff8a30' : small.color);
    const verb = big.kind === 'crna_rupa' ? 'progutala je' : 'sudar sa';
    this.onEvent?.(`💥 ${big.name} — ${verb}: ${small.name}`);
    this.removeBody(small);
  }

  explode(pos, size, color) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })
    );
    sprite.position.copy(pos);
    this.group.add(sprite);
    this.effects.push({ sprite, t: 0, size });
  }

  // ---------- čestice ----------

  initParticles() {
    const MAX = 3000;
    this.pPos = new Float32Array(MAX * 3);
    this.pVel = new Float32Array(MAX * 3);
    this.pCol = new Float32Array(MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.55, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setParticles(preset, count) {
    const n = THREE.MathUtils.clamp(Number(count) || (preset === 'akreacioni_disk' ? 2600 : 1400), 0, 3000);
    this.particleCfg = { preset: preset === 'nista' ? 'nista' : preset, count: preset === 'nista' ? 0 : n };
    for (let i = 0; i < this.particleCfg.count; i++) this.spawnParticle(i, true);
    this.points.geometry.setDrawRange(0, this.particleCfg.count);
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  // centar mase i ukupna masa — čestice kruže oko sistema kao cjeline
  barycenter() {
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    let m = 0;
    for (const b of this.bodies) {
      c.addScaledVector(b.pos, b.mass);
      v.addScaledVector(b.vel, b.mass);
      m += b.mass;
    }
    return m ? { c: c.divideScalar(m), v: v.divideScalar(m), m } : { c, v, m: 0 };
  }

  spawnParticle(i, initial) {
    const { preset } = this.particleCfg;
    const { c, v, m } = this.barycenter();
    let r, y, speed, col;
    if (preset === 'oblak') {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 80);
      this.pPos.set([c.x + dir.x, c.y + dir.y * 0.5, c.z + dir.z], i * 3);
      this.pVel.set([(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6], i * 3);
      col = new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.6, 0.6);
      this.pCol.set([col.r, col.g, col.b], i * 3);
      return;
    }
    if (preset === 'akreacioni_disk') {
      r = initial ? 7 + Math.pow(Math.random(), 0.7) * 38 : 40 + Math.random() * 6;
      y = (Math.random() - 0.5) * r * 0.04;
      const t = THREE.MathUtils.clamp((r - 7) / 38, 0, 1);
      col = new THREE.Color().setHSL(0.1 - t * 0.06, 1, 0.8 - t * 0.35);
    } else {
      r = 38 + Math.random() * 6;
      y = (Math.random() - 0.5) * 1.2;
      col = new THREE.Color().setHSL(0.08, 0.2, 0.45 + Math.random() * 0.25);
    }
    const ang = Math.random() * Math.PI * 2;
    speed = Math.sqrt((this.G * Math.max(m, 1)) / r) * (0.97 + Math.random() * 0.06);
    this.pPos.set([c.x + Math.cos(ang) * r, c.y + y, c.z + Math.sin(ang) * r], i * 3);
    this.pVel.set([v.x - Math.sin(ang) * speed, v.y, v.z + Math.cos(ang) * speed], i * 3);
    this.pCol.set([col.r, col.g, col.b], i * 3);
  }

  stepParticles(dt) {
    const n = this.particleCfg.count;
    if (!n) return;
    const G = this.G;
    const bs = this.bodies.filter((b) => b.mass > 0.5);
    const sub = 4;
    const h = dt / sub;
    const P = this.pPos;
    const V = this.pVel;
    let respawned = false;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      for (let s = 0; s < sub; s++) {
        let ax = 0, ay = 0, az = 0;
        for (const b of bs) {
          const dx = b.pos.x - P[k];
          const dy = b.pos.y - P[k + 1];
          const dz = b.pos.z - P[k + 2];
          const r2 = dx * dx + dy * dy + dz * dz + 0.2;
          if (r2 < b.radius * b.radius * 1.2) {
            ax = NaN;
            break;
          }
          const inv = (G * b.mass) / (r2 * Math.sqrt(r2));
          ax += dx * inv;
          ay += dy * inv;
          az += dz * inv;
        }
        if (Number.isNaN(ax)) {
          this.spawnParticle(i, false);
          respawned = true;
          break;
        }
        V[k] += ax * h;
        V[k + 1] += ay * h;
        V[k + 2] += az * h;
        P[k] += V[k] * h;
        P[k + 1] += V[k + 1] * h;
        P[k + 2] += V[k + 2] * h;
      }
      if (Math.abs(P[k]) > 600 || Math.abs(P[k + 2]) > 600) {
        this.spawnParticle(i, false);
        respawned = true;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (respawned) this.points.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- petlja ----------

  update(realDt) {
    const dt = Math.min(realDt, 0.05) * SIM_RATE * this.timeScale;
    if (dt > 0) {
      this.step(dt);
      this.stepParticles(dt);
    }
    for (const b of this.bodies) {
      b.object.position.copy(b.pos);
      for (const child of b.object.children) if (child.userData.spin) child.rotation.y += child.userData.spin * realDt;
      const tr = b.trail;
      if (dt > 0 && ++tr.tick % 2 === 0) {
        tr.positions.copyWithin(0, 3);
        tr.positions.set([b.pos.x, b.pos.y, b.pos.z], (TRAIL - 1) * 3);
        tr.count = Math.min(tr.count + 1, TRAIL);
        tr.line.geometry.setDrawRange(TRAIL - tr.count, tr.count);
        tr.line.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const e of [...this.effects]) {
      e.t += realDt;
      e.sprite.scale.setScalar(e.size * (2 + e.t * 18));
      e.sprite.material.opacity = Math.max(0, 1 - e.t / 1.2);
      if (e.t > 1.2) {
        this.group.remove(e.sprite);
        e.sprite.material.dispose();
        this.effects.splice(this.effects.indexOf(e), 1);
      }
    }
  }

  // ---------- gotove scene ----------

  preset(name) {
    this.clear();
    this.gravity = 1;
    this.timeScale = 1;
    this.follow = null;
    if (name === 'suncev_sistem') {
      const sun = this.addBody({ name: 'Sunce', kind: 'zvijezda', mass: 1000, radius: 6, color: '#ffc861' });
      const orbit = (name, kind, mass, radius, color, distance, extra = {}) =>
        this.addBody({ name, kind, mass, radius, color, distance, orbit_around: sun.name, ...extra });
      // mase = stvarni odnos prema Suncu × 1000; udaljenosti i veličine su vizuelno sabijene,
      // ali izabrane tako da susjedne planete nisu u jakim orbitalnim rezonancama (npr. Mars–Jupiter 2:1)
      orbit('Merkur', 'planeta', 0.00017, 0.5, '#a89f94', 14);
      orbit('Venera', 'planeta', 0.0024, 1.1, '#e3bb76', 19);
      const earth = orbit('Zemlja', 'planeta', 0.003, 1.2, '#3b7ddd', 27);
      this.addBody({ name: 'Mjesec', kind: 'mjesec', mass: 0.00004, radius: 0.35, color: '#c8c8c8', distance: 1.9, orbit_around: earth.name });
      orbit('Mars', 'planeta', 0.00032, 0.7, '#c1440e', 34);
      orbit('Jupiter', 'gasni_div', 0.95, 3.2, '#d39c64', 57);
      orbit('Saturn', 'gasni_div', 0.29, 2.7, '#e3cf8c', 80, { rings: true });
      orbit('Uran', 'gasni_div', 0.044, 1.8, '#9fe3e8', 102);
      orbit('Neptun', 'gasni_div', 0.051, 1.7, '#4f6fe0', 122);
      this.setParticles('asteroidni_pojas', 1400);
    } else if (name === 'dvojna_zvijezda') {
      const v = Math.sqrt(500 / (4 * 12));
      this.addBody({ name: 'Zvijezda A', kind: 'zvijezda', mass: 500, radius: 4.5, color: '#ffb070', position: [12, 0, 0], velocity: [0, 0, v] });
      this.addBody({ name: 'Zvijezda B', kind: 'zvijezda', mass: 500, radius: 3.8, color: '#8fb8ff', position: [-12, 0, 0], velocity: [0, 0, -v] });
      const vp = Math.sqrt(1000 / 60);
      this.addBody({ name: 'Tatooine', kind: 'planeta', mass: 0.003, radius: 1.3, color: '#d8b27a', position: [0, 0, 60], velocity: [-vp, 0, 0] });
      this.setParticles('oblak', 1000);
    } else if (name === 'crna_rupa') {
      const bh = this.addBody({ name: 'Crna rupa', kind: 'crna_rupa', mass: 4000, radius: 1.8 });
      this.addBody({ name: 'Zvijezda S2', kind: 'zvijezda', mass: 20, radius: 1.6, color: '#bcd4ff', distance: 55, orbit_around: bh.name });
      this.addBody({ name: 'Lutalica', kind: 'planeta', mass: 0.003, radius: 1.1, color: '#6fd19a', distance: 90, orbit_around: bh.name });
      this.setParticles('akreacioni_disk', 2600);
    } else {
      this.setParticles('nista', 0);
    }
    this.balance();
    for (const b of this.bodies) b.trail.count = 0;
  }

  // ukupni impuls = 0 i centar mase u ishodištu, da gotova scena ne "pluta" kroz svemir
  balance() {
    const { c, v } = this.barycenter();
    for (const b of this.bodies) {
      b.pos.sub(c);
      b.vel.sub(v);
    }
    this.accDirty = true;
  }

  // sažetak za model — šta trenutno postoji na sceni
  snapshot() {
    return {
      gravitacija: this.gravity,
      vrijeme: this.timeScale,
      cestice: this.particleCfg.preset,
      tijela: this.bodies.map((b) => ({
        name: b.name,
        kind: b.kind,
        mass: Number(b.mass.toPrecision(3)),
        radius: +b.radius.toFixed(2),
        pos: b.pos.toArray().map((x) => +x.toFixed(1)),
        speed: +b.vel.length().toFixed(2),
      })),
    };
  }
}
