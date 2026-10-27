# AION 2 Gearscore-Analyse

Nimmt einen shugo.gg-Charakterlink und schlüsselt den Gearscore (Item Level) nach Herkunft auf:
pro Ausrüstungsteil Basis / Verstärkung / Sterne / Manasteine / Götterstein, plus alle Daevanion-Bretter.

Die Daten kommen live von der offiziellen AION-2-API (aion2.plaync.com) – dieselbe Quelle, die shugo.gg nutzt.
Unterstützt alle Global-Server (EU, NA-Ost/West, Südamerika, Asien).

## Start

Voraussetzung: Node.js 18+ (keine weiteren Pakete nötig).

```
npm start
```

Dann http://localhost:3000 öffnen und den Link einfügen, z. B.
`https://shugo.gg/de/character/global/eu-siel/Asulgard`

**Vergleich:** Zweiten Link ins untere Feld eintragen → Gegenüberstellung nach Herkunft
(Basis, Verstärkung, Sterne, …), Slot für Slot mit Δ je Bestandteil und Brett für Brett.
„Nur Unterschiede“ blendet identische Slots aus, „tauschen“ dreht die Seiten um.
Der Vergleich ist teilbar: `http://localhost:3000/?url=<link1>&vs=<link2>`.

Anderer Port: `set PORT=8080 && npm start` (Windows) bzw. `PORT=8080 npm start`.

Kommandozeile: `node cli.js "https://shugo.gg/de/character/global/eu-siel/Asulgard"`
Vergleich in der Kommandozeile: `node cli.js <link1> <link2>`

## Verbesserungspotenzial

Unter jeder Einzelanalyse steht, was der Charakter noch wie viel Gearscore bringen kann –
standardmäßig **ohne Crafting** (Items, die nur über Crafting zu bekommen sind, werden als Ziel ignoriert;
per Haken „Gecraftete Items zulassen“ umschaltbar):

- **Aktuelles Item ausreizen:** Verstärkung auf Maximum, Sterne auf Maximum, alle Manasteine Gold
- **Besseres Item:** bestes nicht-gecraftetes Item für Slot & Klasse, voll ausgebaut (z. B. Aulamus-Ohrring 70 → Enraged-Kromede-Ohrring 86)
- **Daevanion:** welche Knoten (nach Farbe) auf jedem Brett noch fehlen
- **Größte Hebel:** alle Einzelschritte nach GS-Gewinn sortiert

Die Item-Daten (Basisstufe, max. Verstärkung/Sterne, Manastein-Slots, Quellen) stehen in `data/catalog.json`.
Sie wurden aus den ausgerüsteten Items von 88 Global-Charakteren (alle 8 Klassen, verschiedene Ranglistenplätze)
gesammelt. Neu aufbauen mit aktuellen Daten:

```
npm run catalog            # ~90 Charaktere, ein paar Minuten
npm run catalog -- --deep  # ~330 Charaktere, gründlicher
```

Hinweise: Göttersteine sind im Potenzial nicht eingerechnet (Wert je Stein unbekannt). Das Maximum mit
voll geöffneten Daevanion-Brettern liegt deutlich über dem aktuell höchsten Gearscore (~3550), weil
bisher niemand die Bretter Ariel/Azphel annähernd komplett hat – deshalb wird „nur Ausrüstung“ separat angezeigt.

Kommandozeile: `node cli.js <link>` zeigt am Ende die 10 größten Hebel.

## Rechenregeln

| Quelle | GS |
|---|---|
| Item | Basis (Item-Stufe) |
| Verstärkung | +1 je Stufe |
| Sterne (Überschreitung) | +5 je Stern |
| Manastein | Weiß 1 · Grün 2 · Blau 3 · Gold 4 |
| Götterstein | Grün 3 · Blau/Gold: je Stein unterschiedlich → aus Differenz zum offiziellen Wert |
| Daevanion-Knoten (geöffnet) | Weiß 1 · Grün 2 · Blau 3 · Gold 4 |

Flügel, Pet, Kostüme und Titel zählen nicht. Die Regeln wurden an 10+ Charakteren (GS 40 bis 3549)
gegengeprüft; die Summe stimmt exakt mit dem offiziellen Wert überein. Weicht sie ab, zeigt das Tool
die Differenz an (meist hat sich der Charakter zwischen zwei Abfragen geändert → „neu laden").

Die Gewichte stehen oben in `calc.js` und lassen sich dort anpassen.

## Dateien

- `server.js` – lokaler Webserver + `/api/breakdown?url=…`
- `api.js` – Link-Parsing, Charaktersuche, API-Abruf (mit Retries, die API liefert gelegentlich 404/429)
- `calc.js` – Rechenlogik (Aufschlüsselung)
- `upgrade.js` – Verbesserungspotenzial
- `data/catalog.json` – Item-Katalog aus Global-Daten
- `scripts/update-catalog.js` – Katalog neu aufbauen
- `public/index.html` – Oberfläche
- `test/` – `npm test` (Fixture eines echten Charakters; Summe muss exakt passen, Potenzial-Rechnung wird geprüft)
