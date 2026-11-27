// Molekulska scena: model "kuglice i štapići" koji se gradi atom po atom.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// CPK boje i vizuelni poluprečnici (Å)
const ELEMENTS = {
  H: ['#f5f5f5', 0.28],
  C: ['#4a4a4a', 0.42],
  N: ['#3a5cff', 0.41],
  O: ['#ff2a2a', 0.4],
  F: ['#7cff5a', 0.38],
  Cl: ['#1ff01f', 0.5],
  Br: ['#a62929', 0.55],
  I: ['#940094', 0.6],
  S: ['#ffd92f', 0.52],
  P: ['#ff8000', 0.52],
  Na: ['#ab5cf2', 0.6],
  K: ['#8f40d4', 0.65],
  Mg: ['#8aff00', 0.55],
  Ca: ['#3dff00', 0.6],
  Fe: ['#e06633', 0.55],
  Cu: ['#c88033', 0.55],
  Zn: ['#7d80b0', 0.55],
  Si: ['#f0c8a0', 0.52],
  B: ['#ffb5b5', 0.4],
};
const BOND_R = 0.11;

function formulaOf(atoms) {
  const counts = {};
  for (const a of atoms) counts[a.el] = (counts[a.el] || 0) + 1;
  const order = Object.keys(counts).sort((a, b) => {
    const rank = (e) => (e === 'C' ? 0 : e === 'H' ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return order.map((e) => e + (counts[e] > 1 ? counts[e] : '')).join('');
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const pretty = (f) => f.replace(/\d/g, (d) => SUB[d]);

export class Molecule {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.group.add(new THREE.HemisphereLight(0xdde8ff, 0x202040, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, 6);
    this.group.add(key);
    const rim = new THREE.DirectionalLight(0x7cc4ff, 1.2);
    rim.position.set(-6, -2, -5);
    this.group.add(rim);

    this.model = new THREE.Group();
    this.group.add(this.model);
    this.sphere = new THREE.SphereGeometry(1, 32, 24);
    this.cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
    this.building = [];
    this.name = null;
    this.radius = 5;
  }

  clear() {
    for (const o of [...this.model.children]) {
      o.traverse((c) => {
        c.material?.dispose?.();
        if (c.isCSS2DObject) c.element.remove();
      });
      this.model.remove(o);
    }
    this.building = [];
  }

  show({ name, formula, atoms, bonds }) {
    this.clear();
    atoms = (atoms || [])
      .filter((a) => a && Array.isArray(a.pos))
      .slice(0, 80)
      .map((a) => ({ ...a, el: String(a.el || 'C').replace(/^(\w)(\w?).*/, (_, x, y) => x.toUpperCase() + y.toLowerCase()) }));
    if (!atoms.length) return false;
    bonds = (bonds || []).filter((b) => Array.isArray(b) && atoms[b[0]] && atoms[b[1]]);

    const pts = atoms.map((a) => new THREE.Vector3().fromArray(a.pos.map(Number)));
    const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
    pts.forEach((p) => p.sub(center));
    this.radius = Math.max(2, ...pts.map((p) => p.length()));

    const mats = {};
    const mat = (el) =>
      (mats[el] ??= new THREE.MeshStandardMaterial({
        color: (ELEMENTS[el] || ['#ff4fb0'])[0],
        roughness: 0.28,
        metalness: 0.05,
      }));

    atoms.forEach((a, i) => {
      const el = a.el;
      const r = (ELEMENTS[el] || [0, 0.45])[1];
      const m = new THREE.Mesh(this.sphere, mat(el));
      m.position.copy(pts[i]);
      m.scale.setScalar(0.0001);
      this.model.add(m);
      if (el !== 'H' && el !== 'C') {
        const div = document.createElement('div');
        div.className = 'label label--atom';
        div.textContent = el;
        const lbl = new CSS2DObject(div);
        lbl.visible = false;
        m.add(lbl);
      }
      this.building.push({ obj: m, target: r, delay: i * 0.045 });
    });

    const up = new THREE.Vector3(0, 1, 0);
    bonds.forEach(([i, j, order = 1], k) => {
      const a = pts[i];
      const b = pts[j];
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.01 || len > 4) return;
      const n = Math.min(3, Math.max(1, Math.round(order)));
      let side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y / len) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      const r = n === 1 ? BOND_R : BOND_R * 0.62;
      const gap = n === 1 ? 0 : 0.16;
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      for (let s = 0; s < n; s++) {
        const off = side.clone().multiplyScalar((s - (n - 1) / 2) * gap);
        // dvije polovine veze u bojama svojih atoma
        [[a, atoms[i].el, 0.25], [b, atoms[j].el, 0.75]].forEach(([, el, t]) => {
          const c = new THREE.Mesh(this.cyl, mat(el));
          c.position.copy(a).addScaledVector(dir, t).add(off);
          c.quaternion.copy(q);
          c.userData.full = new THREE.Vector3(r, len / 2, r);
          c.scale.set(r, 0.0001, r);
          this.model.add(c);
          this.building.push({ obj: c, bond: true, delay: atoms.length * 0.045 + k * 0.02 });
        });
      }
    });

    formula = formula || formulaOf(atoms);
    const div = document.createElement('div');
    div.className = 'label label--title';
    div.innerHTML = `${name || 'Molekul'} <span style="opacity:.6;font-weight:400">${pretty(formula)}</span>`;
    const title = new CSS2DObject(div);
    title.position.set(0, this.radius + 1.4, 0);
    this.model.add(title);

    this.model.rotation.set(0, 0, 0);
    this.elapsed = 0;
    this.name = name;
    this.formula = formula;
    return true;
  }

  update(dt) {
    this.model.rotation.y += dt * 0.25;
    if (!this.building.length) return;
    this.elapsed += dt;
    const ease = (t) => 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.15;
    this.building = this.building.filter((p) => {
      const t = THREE.MathUtils.clamp((this.elapsed - p.delay) / 0.35, 0, 1);
      if (p.bond) {
        const f = p.obj.userData.full;
        p.obj.scale.set(f.x, Math.max(0.0001, f.y * t), f.z);
      } else {
        p.obj.scale.setScalar(Math.max(0.0001, p.target * ease(t)));
        if (t >= 1) p.obj.children.forEach((c) => (c.visible = true));
      }
      return t < 1;
    });
  }
}
