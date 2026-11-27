// Stvarni podaci o tijelima Sunčevog sistema (za kartice koje iskaču na hover).
// Simulacija koristi "igračke" razmjere, pa ovdje stoje pravi brojevi.
const CATALOG = {
  sunce: {
    tip: 'zvijezda (žuti patuljak)',
    rows: [['Prečnik', '1 392 700 km'], ['Masa', '333 000 Zemalja'], ['Površina', '≈ 5 500 °C'], ['Starost', '4,6 milijardi godina']],
    fact: 'Svjetlost sa Sunca putuje do nas oko 8 minuta i 20 sekundi.',
  },
  merkur: {
    tip: 'stjenovita planeta',
    rows: [['Prečnik', '4 879 km'], ['Brzina orbite', '47,4 km/s'], ['Godina', '88 dana'], ['Temperatura', '−180 do 430 °C']],
    fact: 'Jedan dan na Merkuru (od izlaska do izlaska Sunca) traje 176 zemaljskih dana — duže od njegove godine!',
  },
  venera: {
    tip: 'stjenovita planeta',
    rows: [['Prečnik', '12 104 km'], ['Brzina orbite', '35,0 km/s'], ['Godina', '225 dana'], ['Temperatura', '≈ 465 °C']],
    fact: 'Venera se okreće unazad — tamo Sunce izlazi na zapadu.',
  },
  zemlja: {
    tip: 'stjenovita planeta — naš dom',
    rows: [['Prečnik', '12 742 km'], ['Brzina orbite', '29,8 km/s'], ['Od Sunca', '150 miliona km'], ['Mjeseci', '1']],
    fact: 'Upravo sada juriš kroz svemir brzinom od oko 107 000 km/h.',
  },
  mjesec: {
    tip: 'prirodni satelit Zemlje',
    rows: [['Prečnik', '3 474 km'], ['Od Zemlje', '384 400 km'], ['Orbita', '27,3 dana'], ['Gravitacija', '1/6 zemaljske']],
    fact: 'Mjesec se udaljava od Zemlje oko 3,8 cm godišnje.',
  },
  mars: {
    tip: 'stjenovita planeta',
    rows: [['Prečnik', '6 779 km'], ['Brzina orbite', '24,1 km/s'], ['Godina', '687 dana'], ['Mjeseci', '2 (Fobos i Dejmos)']],
    fact: 'Na Marsu je Olimp, vulkan visok oko 22 km — skoro tri Mont Everesta.',
  },
  jupiter: {
    tip: 'gasni div',
    rows: [['Prečnik', '139 820 km'], ['Brzina orbite', '13,1 km/s'], ['Godina', '11,9 godina'], ['Dan', '9 h 56 min']],
    fact: 'Velika crvena pjega je oluja veća od cijele Zemlje.',
  },
  saturn: {
    tip: 'gasni div sa prstenovima',
    rows: [['Prečnik', '116 460 km'], ['Brzina orbite', '9,7 km/s'], ['Godina', '29,4 godine'], ['Gustina', 'manja od vode']],
    fact: 'Prstenovi su široki stotine hiljada km, a debeli uglavnom samo desetine metara.',
  },
  uran: {
    tip: 'ledeni div',
    rows: [['Prečnik', '50 724 km'], ['Brzina orbite', '6,8 km/s'], ['Godina', '84 godine'], ['Nagib ose', '98° — kotrlja se']],
    fact: 'Zbog nagiba, na polovima Urana traje 42 godine dana pa 42 godine noći.',
  },
  neptun: {
    tip: 'ledeni div',
    rows: [['Prečnik', '49 244 km'], ['Brzina orbite', '5,4 km/s'], ['Godina', '165 godina'], ['Vjetrovi', 'do 2 100 km/h']],
    fact: 'Neptun je otkriven matematikom — prije nego što ga je iko vidio kroz teleskop.',
  },
};

const KIND_NAMES = {
  zvijezda: 'zvijezda',
  neutronska_zvijezda: 'neutronska zvijezda',
  crna_rupa: 'crna rupa',
  planeta: 'planeta',
  gasni_div: 'gasni div',
  mjesec: 'mjesec',
  kometa: 'kometa',
};

export function describe(body) {
  const key = body.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const real = CATALOG[key];
  const sim = [
    ['Brzina u simulaciji', body.vel.length().toFixed(1)],
    ['Masa u simulaciji', Number(body.mass.toPrecision(2))],
  ];
  return {
    name: body.name,
    tip: real?.tip || KIND_NAMES[body.kind] || body.kind,
    rows: real ? real.rows : sim,
    sim: real ? sim : null,
    fact: real?.fact || (body.kind === 'kometa' ? 'Ovu kometu je bacila ruka posjetioca — gravitacija sada odlučuje njenu sudbinu.' : null),
  };
}
