# CREDIX — landing page

Landing page di CREDIX (*We Give Credix.*), il canale Instagram [@c.credix](https://www.instagram.com/c.credix/) che racconta la musica attraverso i producer.

Sito statico, senza framework né build: HTML, CSS e un po' di JavaScript (~100 KB in tutto, font compresi).

## Struttura

| File | Cosa contiene |
| --- | --- |
| `index.html` | La pagina e i testi |
| `styles.css` | Palette, tipografia e layout dal Brand Book v1.1 "Chrome" |
| `main.js` | Waveform, animazioni d'ingresso, interazione dei credits |
| `assets/fonts/` | Anatoleum (display) e IBM Plex Mono (testo, SIL OFL), self-hosted |
| `assets/` | Logo, simbolo, immagine di anteprima social, icona |

## Vederla in locale

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Pubblicarla con GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → branch `main`, cartella `/ (root)`.

## Note

- Il file `Anatoleum.ttf` fornito ha vuoti i glifi accentati e la punteggiatura tipografica. Nel woff2 di `assets/fonts/` le lettere à è é ò ù (e maiuscole), le virgolette, i trattini e i puntini di sospensione sono ricostruiti da glifi esistenti. Con il font completo basta rigenerare il woff2.
