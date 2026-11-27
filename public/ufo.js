// Leteći tanjir: pojavljuje se na vulkanski pozdrav 🖖, usisa jedno tijelo zrakom i nestane warp brzinom.
import * as THREE from 'three';
import { glowTexture } from './space.js';

const ARRIVE = 2.6;
const BEAM = 2.8;
const LEAVE = 1.4;

function buildSaucer() {
  const ufo = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c4d6, metalness: 0.9, roughness: 0.25, emissive: 0x1a2233 });

  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16), metal);
  hull.scale.set(1, 0.22, 1);
  ufo.add(hull);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 12, 64), metal);
  rim.rotation.x = Math.PI / 2;
  ufo.add(rim);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x7cf7ff, transparent: true, opacity: 0.55, emissive: 0x2aa8b8, emissiveIntensity: 0.8, roughness: 0.1 })
  );
  dome.position.y = 0.12;
  ufo.add(dome);

  // mali "pilot" u kupoli 👽
  const alien = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x6dff7a, emissive: 0x1f7a2a }));
  alien.scale.set(0.9, 1.15, 0.9);
  alien.position.y = 0.3;
  ufo.add(alien);

  // prsten trepćućih svjetala
  const lights = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    bulb.position.set(Math.cos(a) * 0.92, -0.04, Math.sin(a) * 0.92);
    ufo.add(bulb);
    lights.push(bulb);
  }

  // zrak za usisavanje: konus prema dolje
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 1.4, 1, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8dfcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = -0.5;
  ufo.add(beam);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7cf7ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
  glow.scale.setScalar(4);
  ufo.add(glow);

  ufo.add(new THREE.PointLight(0x9ffcff, 3, 30, 1.5));
  return { ufo, lights, beam, alien };
}

export class UfoShow {
  constructor(space, { onEvent, onDone } = {}) {
    this.space = space;
    this.onEvent = onEvent;
    this.onDone = onDone;
    this.active = null;
  }

  get busy() {
    return !!this.active;
  }

  // meta: Mjesec, pa bačena kometa, pa najmanje tijelo koje nije zvijezda
  pickTarget() {
    const bs = this.space.bodies;
    return (
      bs.find((b) => b.kind === 'mjesec') ||
      bs.filter((b) => b.kind === 'kometa').at(-1) ||
      bs.filter((b) => !['zvijezda', 'neutronska_zvijezda', 'crna_rupa'].includes(b.kind)).sort((a, b) => a.mass - b.mass)[0] ||
      null
    );
  }

  start(camera, from = null) {
    if (this.active) return null;
    const target = this.pickTarget();
    const { ufo, lights, beam, alien } = buildSaucer();
    const size = Math.max(1.6, (target?.radius || 1) * 2.4);
    ufo.scale.setScalar(size);

    // ulijeće iz zadate tačke, ili iza kamere sa strane
    from ??= camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 80, 30, 0));
    ufo.position.copy(from);
    this.space.group.add(ufo);
    this.active = { ufo, lights, beam, alien, target, size, from, t: 0, phase: 'arrive', captured: null };
    this.onEvent?.('🖖 Živi dugo i napreduj! Nešto se približava…');
    return target;
  }

  // tačka koju kamera prati tokom predstave
  focusPoint() {
    const a = this.active;
    if (!a) return null;
    if (a.phase === 'arrive') return a.target && this.space.bodies.includes(a.target) ? a.target.pos.clone() : a.ufo.position.clone();
    if (a.phase === 'beam') return a.captured ? a.ufo.position.clone().lerp(a.captured.object.position, 0.5) : a.ufo.position.clone();
    return a.leaveFrom.clone();
  }

  hoverPoint() {
    const a = this.active;
    const base = a.target && this.space.bodies.includes(a.target) ? a.target.pos : a.captured ? a.hoverAt : new THREE.Vector3();
    return base.clone().add(new THREE.Vector3(0, (a.target?.radius || 1) + a.size * 1.8, 0));
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const time = performance.now() / 1000;

    a.lights.forEach((l, i) => l.material.color.setHSL((i / 12 + time * 0.6) % 1, 1, Math.sin(time * 10 + i) > 0 ? 0.7 : 0.25));
    a.ufo.rotation.y += dt * 2.5;
    a.alien.position.y = 0.3 + Math.sin(time * 6) * 0.03;

    if (a.phase === 'arrive') {
      const k = Math.min(a.t / ARRIVE, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const to = this.hoverPoint();
      a.ufo.position.lerpVectors(a.from, to, e);
      a.ufo.position.y += Math.sin(k * Math.PI) * 6; // luk u letu
      a.ufo.rotation.z = Math.sin(time * 3) * 0.15 * (1 - k);
      if (k >= 1) {
        a.phase = 'beam';
        a.t = 0;
        if (a.target && this.space.bodies.includes(a.target)) {
          // tijelo izlazi iz fizike i postaje dio animacije
          a.captured = a.target;
          a.hoverAt = a.target.pos.clone();
          a.capturedScale = a.target.object.scale.x;
          this.space.detach(a.target);
          this.onEvent?.(`🛸 Vanzemaljci usisavaju: ${a.target.name}!`);
        } else {
          this.onEvent?.('🛸 Vanzemaljci su samo svratili da pozdrave 👽');
        }
      }
    } else if (a.phase === 'beam') {
      const k = Math.min(a.t / BEAM, 1);
      a.ufo.position.copy(this.hoverPoint());
      a.ufo.position.y += Math.sin(time * 2) * 0.2;
      const dist = a.captured ? a.ufo.position.distanceTo(a.captured.object.position) / a.size : 2.5;
      a.beam.scale.set(1, Math.max(dist, 1), 1);
      a.beam.position.y = -Math.max(dist, 1) / 2;
      a.beam.material.opacity = Math.min(k * 4, 1) * (0.28 + Math.sin(time * 20) * 0.06);
      if (a.captured) {
        const o = a.captured.object;
        const start = a.hoverAt;
        const end = a.ufo.position.clone().add(new THREE.Vector3(0, -0.2 * a.size, 0));
        const e = k * k;
        o.position.lerpVectors(start, end, e);
        o.rotation.y += dt * 6;
        o.scale.setScalar(a.capturedScale * (1 - e * 0.92));
      }
      if (k >= 1) {
        if (a.captured) this.space.dispose(a.captured);
        a.phase = 'leave';
        a.t = 0;
        a.beam.material.opacity = 0;
        a.dir = new THREE.Vector3(Math.random() - 0.5, 0.35, Math.random() - 0.5).normalize();
        a.leaveFrom = a.ufo.position.clone();
      }
    } else if (a.phase === 'leave') {
      const k = a.t / LEAVE;
      // kratko oklijevanje, pa warp: ubrzanje i izduženje u pravcu leta
      const d = k < 0.35 ? 0 : Math.pow((k - 0.35) / 0.65, 3) * 900;
      a.ufo.position.copy(a.leaveFrom).addScaledVector(a.dir, d);
      a.ufo.scale.set(a.size * (1 - k * 0.5), a.size * (1 - k * 0.5), a.size * (1 + (k > 0.35 ? k * 6 : 0)));
      a.ufo.lookAt(a.ufo.position.clone().add(a.dir));
      if (k >= 1) {
        this.space.group.remove(a.ufo);
        a.ufo.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        const name = a.captured?.name;
        this.active = null;
        this.onEvent?.(name ? `👽 ${name} je otet i odnesen warp brzinom!` : '👽 Otišli su… zasad.');
        this.onDone?.(name);
      }
    }
  }
}
