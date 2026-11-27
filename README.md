# Laboratorija koja te sluša

Interaktivna 3D naučna instalacija u kojoj posjetioci razgovaraju sa svemirom. Kucaju ili izgovaraju želje na našem jeziku („dodaj još jedno Sunce”, „pokaži molekul kofeina”), a **Claude Opus 5.5** upravlja pravom N-body simulacijom ili gradi 3D molekul atom po atom. Uz to sve objasni na nivou srednje škole.

## O projektu

Projekat je napravljen kao demo za **Noć istraživača 2026** u Crnoj Gori ([festival-nauke.me](https://festival-nauke.me)). Zamišljen je za veliki ekran ili projektor, a publika su srednjoškolci i studenti. Pored kucanja i glasa, posjetioci mogu da upravljaju i rukama preko web kamere.

Demo pokazuje kako AI agent radi kroz alate. Model ne piše kod, nego bira **akcije** (`add_body`, `set_gravity`, `molecule`…) i njihove parametre. Aplikacija te akcije izvršava, a fizika se stvarno računa: gravitacija među svim tijelima, sudari sa očuvanjem impulsa i čestice koje osjećaju gravitaciju. Uključivanjem „prikaži šta Claude šalje simulaciji” publika vidi JSON akcije koje model šalje.

Uz instalaciju ide i druga tačka, **„Izazovi Claude-a”**: publika predloži ideju za igricu, a Claude Code je napravi uživo (vidi [niže](#druga-tačka-izazovi-claude-a)).

## Šta je potrebno

- **Node.js 18** ili noviji.
- **Google Chrome**, zbog glasovnog unosa (Web Speech API) i WebGL-a.
- **[Claude Code](https://claude.com/claude-code) CLI**, instaliran i prijavljen. Model se poziva preko postojeće Claude pretplate (`claude -p`), pa ne treba API ključ niti se plaća po pozivu.
- Opciono: **mikrofon** za glasovni unos i **web kamera** za upravljanje rukama.
- **Internet** za model i za prepoznavanje govora. Sve ostalo radi lokalno.

Bez Claude Code-a aplikacija i dalje radi, ali u offline režimu (vidi niže).

## Pokretanje

```bash
git clone https://github.com/grungert/noc-istrazivaca.git
cd noc-istrazivaca
npm install
npm start
```

Otvori http://localhost:4747 u Chrome-u. Za prikaz preko cijelog ekrana pritisni F11 ili dugme **⛶ Cijeli ekran**.

Pri pokretanju server u terminalu ispiše adresu, da li koristi Claude ili offline režim i koliko molekula ima u kešu.

### Offline režim

Ako CLI nije dostupan ili nema interneta, aplikacija sama prelazi u offline režim. Tada prepoznaje ključne riječi i ima 5 ugrađenih molekula: voda, metan, CO₂, amonijak i benzen. Status u gornjem desnom uglu pokazuje u kom je režimu. Ručno se uključuje sa:

```bash
npm run offline
```

### Podešavanja (env varijable)

| Varijabla | Podrazumijevano | Značenje |
|---|---|---|
| `PORT` | `4747` | port servera |
| `HOST` | `127.0.0.1` | adresa na kojoj server sluša. `0.0.0.0` ga otvara ka lokalnoj mreži, a tada svako na mreži troši tvoju Claude pretplatu |
| `MODEL` | `claude-opus-5-5` | model |
| `EFFORT` | `low` | `low` ≈ 10–20 s po odgovoru, `medium` ≈ 15–35 s (detaljnije) |
| `BRAIN` | `claude` | `offline` isključuje model |
| `TIMEOUT_MS` | `90000` | koliko dugo se čeka odgovor modela |

Na primjer: `EFFORT=medium PORT=8080 npm start`. Skripte u `package.json` pretpostavljaju macOS ili Linux shell.

## Priprema prije događaja

1. Provjeri `claude --version` i da si prijavljen (`claude`, pa `/login`).
2. Pokreni `npm start`, a u drugom terminalu `npm run warmup`. Ovo unaprijed pita model za 16 popularnih molekula (kofein, DNK, serotonin…) i čuva odgovore u `cache.json`, pa na događaju ti odgovori stižu odmah. Keš preživljava restart, a fajl nije u gitu.
3. Testiraj mikrofon u Chrome-u, jer traži dozvolu pri prvom kliku na 🎙.
4. Testiraj kameru klikom na ✋.

## Šta posjetioci mogu da traže

- „Dodaj još jedno Sunce”: haos, problem tri tijela
- „Šta ako je gravitacija duplo jača?”: planete padaju ka Suncu
- „Ubaci crnu rupu pored Zemlje”: crna rupa guta planete, a na ekranu se pojavi obavještenje o sudaru
- „Šutni Zemlju iz orbite” / „Sudari Jupiter i Saturn”
- „Napravi dvojnu zvijezdu kao Tatooine”
- „Pokaži molekul kofeina / DNK / serotonina”: 3D molekul se gradi atom po atom
- Slobodna pitanja („Zašto Mjesec ne padne na Zemlju?”): model odgovori i pokaže to u simulaciji

Posle 3 minuta neaktivnosti scena se sama vraća na Sunčev sistem (kiosk režim).

## Upravljanje rukama ✋

Klikni ✋ pored polja za unos. Pali se web kamera, a u donjem lijevom uglu se vidi „kostur” ruke onako kako ga vidi AI. Praćenje radi **MediaPipe** lokalno u browseru, bez interneta.

| Pokret | Efekat |
|---|---|
| ✋ otvorena šaka | kursor: preko planete iskoči kartica sa pravim podacima |
| ✋ zadrži kursor ~1 s na planeti | „klik”: leti se do planete, a Claude kao vodič priča šta bi tamo doživio |
| ✊ stisnuta šaka + vuci | okreće svemir |
| 🤏 uštipni, zamahni, pusti | baca kometu (kratak uštip na planeti je takođe klik) |
| 🙌 dvije otvorene šake | razmicanjem se zumira, skupljanjem se udaljava |
| 🖖 vulkanski pozdrav (~0,5 s) | doziva leteći tanjir: usisa Mjesec ili bačenu kometu i nestane warp brzinom, a Claude prokomentariše susret |

Tokom posjete planeti dugmad na dnu (i ona se „kliknu” zadržavanjem ruke) nude **🌅 Pogled sa površine**: kamera stane na planetu i gleda izlazak Sunca, uz ostale planete na nebu. Sve radi i mišem: prelaz prikazuje karticu, a klik vodi na posjetu.

### Tastatura

| Taster | Efekat |
|---|---|
| `Esc` ili **↺ Početak** | vraća Sunčev sistem, normalnu gravitaciju i vrijeme i pogled na cijeli sistem, i iz molekula i iz posjete planeti |
| `K` | baca kometu sa ivice ekrana (kad kamera ne radi) |
| `U` | doziva leteći tanjir (kad kamera ne radi) |
| `F11` | cijeli ekran |

## Kako radi

```
posjetilac → server.js → claude -p (Opus 5.5, bez alata, sistemski prompt iz prompt.js)
                           ↓ vraća JSON: { say, fact, actions: [...] }
browser ← app.js izvršava akcije → space.js (N-body fizika) / molecule.js (3D molekul)
```

- Server je čisti Node.js, bez dodatnih paketa. CLI pokreće u praznom privremenom folderu, bez alata, MCP servera i podešavanja, tako da model samo odgovara.
- Uz svako pitanje server modelu šalje trenutno stanje scene (spisak tijela) i zadnjih 6 razmjena, pa model zna šta je na ekranu.
- **Streaming:** server čita izlaz modela u toku (`--output-format stream-json`). Tekst se ispisuje dok model piše, a svaka akcija se izvršava čim se njen JSON zatvori. Prvi tekst se obično pojavi za 3–5 s. Kod molekula se u zaglavlju vidi „slažem molekul… atoma: N”.
- **Keš:** odgovori sa samo molekulima ne zavise od scene, pa se pamte u `cache.json` i drugi put stižu odmah.
- **Three.js** i **MediaPipe** se instaliraju preko npm-a, a server ih služi lokalno, tako da 3D i praćenje ruku rade bez interneta.

## Struktura projekta

```
server.js            HTTP server: statički fajlovi, /api/status i /api/ask (NDJSON stream)
prompt.js            sistemski prompt: jezik, ton i spisak akcija koje model smije da koristi
scripts/warmup.js    unaprijed puni keš odgovora za popularne molekule
public/
  index.html         stranica i raspored
  app.js             scena, chat, izvršavanje akcija, glas, kiosk režim
  space.js           N-body simulacija, sudari, crne rupe, čestice
  molecule.js        3D model molekula „kuglice i štapići”
  stream.js          čita JSON odgovor dok stiže
  offline.js         rezervni „mozak” bez modela
  hands.js           upravljanje rukama (MediaPipe Hand Landmarker)
  ufo.js             leteći tanjir
  catalog.js         pravi podaci o tijelima Sunčevog sistema za kartice
  models/            MediaPipe model za praćenje ruku
izazov/CLAUDE.md     pravila za igrice koje Claude Code pravi uživo
```

## Druga tačka: „Izazovi Claude-a”

Svakih sat vremena publika predloži ludu ideju, a Claude Code je napravi uživo na projektoru:

```bash
cd izazov
claude
```

Primjer za prompt: *„Napravi igricu gdje brodom izbjegavaš asteroide u obliku Lovćena”*. Pravila za ove igrice su u `izazov/CLAUDE.md`: jedan samostalan HTML fajl, Three.js iz lokalnog servera i prva verzija za 2–3 minuta. Rezultat se otvara na `http://localhost:4747/izazov/<ime>.html` dok glavni server radi.

## Rješavanje problema

- **Status pokazuje offline, a želiš model:** provjeri da `claude --version` radi u istom terminalu u kom pokrećeš `npm start` i da si prijavljen.
- **Odgovor kasni ili ističe:** ostavi `EFFORT=low`, pokreni `npm run warmup` za molekule ili povećaj `TIMEOUT_MS`.
- **Mikrofon ne radi:** glasovni unos radi samo u Chrome-u, uz internet i dozvolu za mikrofon.
- **Kamera ne radi:** dozvoli kameru za `localhost`. Do tada komete i tanjir dozivaš tasterima `K` i `U`.

## Licenca

Kod ovog projekta je pod [MIT licencom](LICENSE).

Tuđi dijelovi zadržavaju svoje licence:

| Dio | Licenca | Kako je uključen |
|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js) | MIT | npm paket `three`, nije u repozitorijumu |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | Apache 2.0 | npm paket `@mediapipe/tasks-vision`, nije u repozitorijumu |
| MediaPipe model `public/models/hand_landmarker.task` | Apache 2.0 | Googleov model, uključen ovdje bez izmjena |
