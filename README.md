# Laboratorija koja te sluša

Interaktivna 3D naučna instalacija za **Noć istraživača** (festival-nauke.me). Posjetioci kucaju ili izgovaraju želje na našem jeziku, a **Claude Opus 5.5** upravlja simulacijom svemira i gradi 3D molekule, uz objašnjenje za nivo srednje škole.

## Pokretanje

```bash
npm install
npm start
```

Otvori http://localhost:4747 u Chrome-u i pritisni F11 za prikaz preko cijelog ekrana.

Sve je besplatno:
- **Three.js** (MIT licenca) je instaliran lokalno, pa 3D radi i bez interneta.
- **Model** se poziva preko Claude Code CLI-ja (`claude -p`) koji koristi postojeću Claude pretplatu. Nema API ključa ni plaćanja po pozivu.
- **Glasovni unos** koristi Web Speech API ugrađen u Chrome. Besplatan je, ali mu treba internet.
- **Server** je čisti Node.js, bez dodatnih paketa.

Ako CLI ne radi ili nema interneta, aplikacija automatski prelazi u **offline režim**: prepoznaje ključne riječi i ima 5 ugrađenih molekula. Status u gornjem desnom uglu pokazuje u kom je režimu. Offline režim se može i ručno uključiti komandom `npm run offline`.

### Podešavanja (env varijable)

| Varijabla | Podrazumijevano | Značenje |
|---|---|---|
| `PORT` | `4747` | port servera |
| `MODEL` | `claude-opus-5-5` | model |
| `EFFORT` | `low` | `low` ≈ 10–20 s po odgovoru, `medium` ≈ 15–35 s (detaljnije) |
| `BRAIN` | `claude` | `offline` isključuje model |

## Prije festivala

1. `npm start`, pa u drugom terminalu `npm run warmup`. Ovo unaprijed pita model za ~16 popularnih molekula (kofein, DNK, serotonin…) i čuva odgovore u `cache.json`. Na festivalu ti odgovori stižu odmah.
2. Provjeri `claude --version` i da si ulogovan (`claude` pa `/login`).
3. Testiraj mikrofon u Chrome-u, jer traži dozvolu pri prvom kliku na 🎙.
4. Uključi „prikaži šta Claude šalje simulaciji“ kad želiš studentima pokazati JSON akcije (tool use).

## Šta posjetioci mogu da traže

- „Dodaj još jedno Sunce“: haos, problem tri tijela
- „Šta ako je gravitacija duplo jača?“: planete padaju ka Suncu
- „Ubaci crnu rupu pored Zemlje“: crna rupa guta planete, a na ekranu se pojavi obavještenje o sudaru
- „Šutni Zemlju iz orbite“ / „Sudari Jupiter i Saturn“
- „Napravi dvojnu zvijezdu kao Tatooine“
- „Pokaži molekul kofeina / DNK / serotonina“: 3D molekul se gradi atom po atom
- Slobodna pitanja („Zašto Mjesec ne padne na Zemlju?“): model odgovori i pokaže to u simulaciji

Posle 3 minuta neaktivnosti scena se sama vraća na Sunčev sistem (kiosk režim).

## Upravljanje rukama ✋

Klikni ✋ pored polja za unos. Pali se web kamera, a u donjem lijevom uglu se vidi „kostur“ ruke onako kako ga vidi AI. Praćenje radi **MediaPipe** lokalno u browseru: besplatno i bez interneta.

| Pokret | Efekat |
|---|---|
| ✋ otvorena šaka | kursor: preko planete iskoči kartica sa pravim podacima |
| ✋ zadrži kursor ~1 s na planeti | „klik“: leti se do planete, a Claude kao vodič priča šta bi tamo doživio |
| ✊ stisnuta šaka + vuci | okreće svemir |
| 🤏 uštipni, zamahni, pusti | baca kometu (kratak uštip na planeti je takođe klik) |
| 🙌 dvije otvorene šake | razmicanjem se zumira, skupljanjem se udaljava |

Tokom posjete dugmad na dnu (i ona se „kliknu“ zadržavanjem ruke) nude **🌅 Pogled sa površine**: kamera stane na planetu i gleda izlazak Sunca, uz ostale planete na nebu. Sve radi i mišem: prelaz prikazuje karticu, a klik vodi na posjetu.

Ako kamera ne radi, taster **K** baca kometu sa ivice ekrana.

**🖖 Vulkanski pozdrav** (drži ga ~0,5 s) doziva leteći tanjir: uleti, usisa Mjesec ili bačenu kometu i nestane warp brzinom, a Claude prokomentariše susret. Bez kamere: taster **U**.

**↺ Početak** (dugme gore desno ili taster **Esc**) vraća Sunčev sistem, normalnu gravitaciju i vrijeme i pogled na cijeli sistem, i iz molekula i iz posjete planeti.

## Streaming odgovora

Server čita izlaz modela u toku (`--output-format stream-json`). Tekst se ispisuje dok model piše, a svaka akcija se izvršava čim se njen JSON zatvori. Prvi tekst se obično pojavi za **3–5 s**, ranije se čekalo 10–20 s. Kod molekula se u zaglavlju vidi „slažem molekul… atoma: N“.

## Kako radi

```
posjetilac → server.js → claude -p (Opus 5.5, bez alata, sistemski prompt iz prompt.js)
                           ↓ vraća JSON: { say, fact, actions: [...] }
browser ← app.js izvršava akcije → space.js (N-body fizika) / molecule.js (3D molekul)
```

Model ne piše kod. On bira **akcije** (`add_body`, `set_gravity`, `molecule`…) i njihove parametre, isto kao što agent koristi alate. Fizika se stvarno računa: gravitacija među svim tijelima, sudari sa očuvanjem impulsa i čestice koje osjećaju gravitaciju.

## Druga tačka: „Izazovi Claude-a“

Svakih sat vremena publika predloži ludu ideju, a Claude Code je napravi uživo:

```bash
cd izazov
claude
```

Primjer za prompt: *„Napravi igricu gdje brodom izbjegavaš asteroide u obliku Lovćena“*. Pravila za ove igrice su u `izazov/CLAUDE.md`. Rezultat se otvara na `http://localhost:4747/izazov/<ime>.html`.

## Licenca

Kod ovog projekta je pod [MIT licencom](LICENSE).

Tuđi dijelovi zadržavaju svoje licence:

| Dio | Licenca | Kako je uključen |
|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js) | MIT | npm paket `three`, nije u repozitorijumu |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | Apache 2.0 | npm paket `@mediapipe/tasks-vision`, nije u repozitorijumu |
| MediaPipe model `public/models/hand_landmarker.task` | Apache 2.0 | Googleov model, uključen ovdje bez izmjena |
