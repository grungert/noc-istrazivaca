// Unaprijed popunjava keš molekula, da najčešća pitanja na festivalu dobiju odgovor odmah.
// Pokreni dok server radi: npm run warmup
const URL = process.env.URL || 'http://localhost:4747/api/ask';

const QUESTIONS = [
  'Pokaži molekul kofeina',
  'Kako izgleda molekul DNK?',
  'Koji molekul nas čini srećnim?',
  'Pokaži molekul serotonina',
  'Pokaži molekul dopamina',
  'Pokaži molekul glukoze',
  'Pokaži molekul aspirina',
  'Pokaži molekul etanola',
  'Pokaži molekul holesterola',
  'Pokaži molekul vitamina C',
  'Pokaži molekul adrenalina',
  'Pokaži molekul paracetamola',
  'Pokaži molekul nikotina',
  'Pokaži molekul ozona',
  'Pokaži molekul penicilina',
  'Pokaži molekul kapsaicina',
];

for (const text of QUESTIONS) {
  const t = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, state: {}, history: [] }),
    });
    // server odgovara NDJSON stream-om; zadnja linija nosi kompletan odgovor
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    const last = lines.at(-1);
    const body = last.t === 'done' ? last.answer : { error: last.error };
    const atoms = body.actions?.find((a) => a.type === 'molecule')?.atoms?.length ?? 0;
    console.log(`${res.ok ? '✓' : '✗'} ${text} — ${body.cached ? 'već u kešu' : `${((Date.now() - t) / 1000).toFixed(1)} s`}, ${atoms} atoma${res.ok ? '' : ` (${body.error})`}`);
  } catch (e) {
    console.log(`✗ ${text} — ${e.message}`);
  }
}
