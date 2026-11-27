// Rezervni "mozak" za slučaj da na lokaciji nema interneta ili CLI ne radi.
// Prepoznaje ključne riječi i vraća isti format odgovora kao model.

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj');

const has = (t, ...words) => words.some((w) => t.includes(w));

function ring(n, r, y = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
}

const MOLECULES = {
  voda: {
    name: 'Voda', say: 'Evo molekula vode! Kiseonik privlači elektrone jače od vodonika, pa je molekul "savijen" pod uglom od oko 104,5°.',
    atoms: [{ el: 'O', pos: [0, 0, 0] }, { el: 'H', pos: [0.757, 0.586, 0] }, { el: 'H', pos: [-0.757, 0.586, 0] }],
    bonds: [[0, 1, 1], [0, 2, 1]],
  },
  metan: {
    name: 'Metan', say: 'Metan: jedan ugljenik i četiri vodonika raspoređena u tetraedar, jer se elektronski parovi odbijaju što dalje mogu.',
    atoms: [{ el: 'C', pos: [0, 0, 0] }, ...[[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((p) => ({ el: 'H', pos: p.map((x) => x * 0.629) }))],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
  },
  co2: {
    name: 'Ugljen-dioksid', say: 'Ugljen-dioksid je prav — dvije dvostruke veze vuku na suprotne strane, pa se ništa ne "savija".',
    atoms: [{ el: 'O', pos: [-1.16, 0, 0] }, { el: 'C', pos: [0, 0, 0] }, { el: 'O', pos: [1.16, 0, 0] }],
    bonds: [[0, 1, 2], [1, 2, 2]],
  },
  amonijak: {
    name: 'Amonijak', say: 'Amonijak ima oblik piramide: slobodni elektronski par na azotu gura tri vodonika naniže.',
    atoms: [{ el: 'N', pos: [0, 0.2, 0] }, ...ring(3, 0.94, -0.18).map((p) => ({ el: 'H', pos: p }))],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
  },
  benzen: {
    name: 'Benzen', say: 'Benzen je savršeni šestougao. Elektroni iz dvostrukih veza su zapravo "razmazani" po cijelom prstenu.',
    atoms: [...ring(6, 1.39).map((p) => ({ el: 'C', pos: p })), ...ring(6, 2.48).map((p) => ({ el: 'H', pos: p }))],
    bonds: [0, 1, 2, 3, 4, 5].flatMap((i) => [[i, (i + 1) % 6, i % 2 ? 1 : 2], [i, i + 6, 1]]),
  },
};

const MOLECULE_WORDS = {
  voda: ['voda', 'vode', 'h2o'],
  metan: ['metan'],
  co2: ['co2', 'ugljen-dioksid', 'ugljen dioksid', 'ugljendioksid'],
  amonijak: ['amonijak', 'nh3'],
  benzen: ['benzen'],
};

export function offlineAnswer(text, space) {
  const t = norm(text);
  const actions = [];
  const body = space.bodies.find((b) => t.includes(norm(b.name).slice(0, 4)));

  for (const [key, words] of Object.entries(MOLECULE_WORDS)) {
    if (has(t, ...words)) {
      const m = MOLECULES[key];
      return { say: m.say, fact: null, actions: [{ type: 'molecule', ...m }] };
    }
  }
  if (has(t, 'molekul', 'atom', 'kofein', 'dnk')) {
    return { say: 'U offline režimu znam samo nekoliko molekula: vodu, metan, ugljen-dioksid, amonijak i benzen. Probaj neki od njih!', fact: null, actions: [] };
  }

  if (has(t, 'crn') && has(t, 'rup')) {
    if (has(t, 'dodaj', 'ubaci', 'stavi', 'napravi', 'pored')) {
      actions.push({ type: 'add_body', name: 'Crna rupa', kind: 'crna_rupa', mass: 3000, position: [70, 0, 40], velocity: [0, 0, -1] }, { type: 'focus', target: 'sve' });
      return { say: 'Ubacio sam crnu rupu! Gledaj kako njena ogromna gravitacija remeti orbite i guta sve što priđe preblizu.', fact: 'Ni svjetlost ne može pobjeći iz crne rupe kada pređe horizont događaja.', actions };
    }
    return { say: 'Evo crne rupe sa akrecionim diskom — gas se zagrijava na milione stepeni dok spiralno pada unutra.', fact: 'U centru naše galaksije nalazi se crna rupa 4 miliona puta masivnija od Sunca.', actions: [{ type: 'preset', name: 'crna_rupa' }] };
  }
  if (has(t, 'dvojn', 'dva sunca', 'tatooine')) {
    return { say: 'Dvije zvijezde kruže jedna oko druge, a planeta Tatooine obilazi oko obje.', fact: 'Oko polovine zvijezda u našoj galaksiji ima zvijezdu-pratioca.', actions: [{ type: 'preset', name: 'dvojna_zvijezda' }] };
  }
  if (has(t, 'jos jedno sunce', 'drugo sunce', 'jos jednu zvijezd', 'dodaj sunce', 'dodaj zvijezd')) {
    actions.push({ type: 'add_body', name: 'Sunce 2', kind: 'zvijezda', mass: 700, radius: 4.5, color: '#9fc4ff', position: [75, 0, 0], velocity: [0, 0, 1.8] });
    return { say: 'Dodao sam drugo Sunce! Sada planete osjećaju dvije gravitacije i orbite postaju haotične.', fact: 'Problem tri tijela nema opšte rješenje — kretanje postaje nepredvidivo.', actions };
  }
  if (has(t, 'suncev sistem', 'sunčev', 'planete', 'ispocetka', 'reset', 'resetuj')) {
    return { say: 'Evo Sunčevog sistema: osam planeta, Mjesec i asteroidni pojas između Marsa i Jupitera.', fact: null, actions: [{ type: 'preset', name: 'suncev_sistem' }] };
  }
  if (has(t, 'gravitacij')) {
    let m = 1;
    let say = 'Gravitacija je vraćena na normalu.';
    if (has(t, 'iskljuc', 'ugasi', 'bez', 'nema')) { m = 0; say = 'Gravitacija je isključena! Bez privlačne sile, planete nastavljaju pravolinijski — Njutnov prvi zakon.'; }
    else if (has(t, 'dupl', 'jac', 'vec', 'pojac')) { m = 2; say = 'Gravitacija je duplo jača! Planete su sada presporo za svoje orbite, pa padaju ka Suncu.'; }
    else if (has(t, 'slab', 'manj', 'pola')) { m = 0.5; say = 'Gravitacija je upola slabija — planete su prebrze i odlaze na izdužene orbite ili bježe.'; }
    return { say, fact: null, actions: [{ type: 'set_gravity', multiplier: m }] };
  }
  if (has(t, 'pauz', 'stani', 'zaustavi')) return { say: 'Vrijeme je zaustavljeno.', fact: null, actions: [{ type: 'set_time', multiplier: 0 }] };
  if (has(t, 'brze', 'ubrzaj')) return { say: 'Ubrzao sam vrijeme tri puta.', fact: null, actions: [{ type: 'set_time', multiplier: 3 }] };
  if (has(t, 'sporij', 'uspori')) return { say: 'Usporio sam vrijeme.', fact: null, actions: [{ type: 'set_time', multiplier: 0.3 }] };

  if (body && has(t, 'sut', 'gurn', 'izbaci')) {
    const dir = body.vel.clone().normalize().multiplyScalar(4);
    return { say: `${body.name} je dobila udarac! Veća brzina znači širu, izduženu orbitu — ili bijeg iz sistema.`, fact: null, actions: [{ type: 'push', name: body.name, velocity_change: dir.toArray() }] };
  }
  if (body && has(t, 'prati', 'fokus', 'zumiraj', 'pokazi', 'gdje')) {
    return { say: `Kamera prati: ${body.name}.`, fact: null, actions: [{ type: 'focus', target: body.name }] };
  }

  return {
    say: 'Trenutno radim u offline režimu i razumijem samo jednostavne naredbe: "crna rupa", "dodaj još jedno Sunce", "duplo jača gravitacija", "šutni Zemlju", "molekul vode"…',
    fact: null,
    actions: [],
  };
}
