# Izazovi Claude-a — živo programiranje na Noći istraživača

Publika predlaže ideju, a ti je praviš uživo na projektoru. Ljudi gledaju ekran, pa brzina i „wow“ efekat su važniji od savršenog koda.

## Pravila
- Svaka ideja je **jedan samostalan HTML fajl** u ovom folderu, na primjer `asteroidi-lovcen.html`. Bez build koraka i bez npm-a.
- Three.js učitavaj preko importmap-a iz lokalnog servera Laboratorije (radi i bez interneta):
  ```html
  <script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script>
  ```
  Fajl se otvara na `http://localhost:4747/izazov/<ime>.html`.
- Canvas 2D je u redu za 2D igrice.
- Tekst u igri piši na crnogorskom (ijekavica, latinica).
- Cilj je da prva verzija proradi za **2–3 minuta**: prvo nešto što se kreće i reaguje na tastaturu ili miš, pa tek onda dorade.
- Uključi kratko uputstvo na ekranu (kontrole) i veliki, čitljiv font za projektor.
- Kad završiš, napiši jednu rečenicu o tome šta si napravio i link do fajla.
