# Kundenmarkt-Scout

Mobile Web-App für die Vorbereitung von Kundengesprächen. Externe Unternehmensquellen und aktuelle Nachrichten werden mit nachvollziehbarer Herkunft angezeigt. Eigene Umsätze, Artikel und Bestellungen bleiben bis zur SAP-Anbindung ausdrücklich unbekannt.

Der Startbestand enthält recherchierte reale Unternehmen. Er ist **kein Nachweis einer Kundenbeziehung zu HYDAC**. Unternehmenskennzahlen und belegte Meldungen kommen aus verlinkten Primärquellen; es gibt keine simulierten Vertriebsdaten. Neue Firmennamen können unmittelbar über öffentliche Nachrichtenfeeds recherchiert werden.

## Lokal starten

Voraussetzung: Node.js ab 22.13, npm und eine Internetverbindung für die Recherche.

```sh
npm install
npm run dev
```

Die lokale Adresse steht im Terminal; beim portablen Entwicklungsprofil ist der Standardport 5173. Das Projekt basiert auf React, Vinext und Vite und verwendet die Next App Router Struktur. Cloudflare Workers führen die API-Routen aus.

```sh
npm run build
npm start
```

`npm start` startet den gebauten Worker lokal. Es veröffentlicht keine Website. Die Sites-Konfiguration liegt in `.openai/hosting.json`; `.sites-runtime/` und `.wrangler/` enthalten ausschließlich lokale Laufzeitdaten. Ein Veröffentlichungsprozess muss die bestehende Projekt-ID verwenden.

Für Umgebungsvariablen `.env.example` nach `.env.local` kopieren. In der Hosting-Umgebung Werte als serverseitige Umgebungsvariablen beziehungsweise Secrets hinterlegen. Niemals Kennwörter, Tokens oder SAP-Endpunkte in `NEXT_PUBLIC_*`, Client-Komponenten oder öffentliche Dateien schreiben.

## Datenqualität und Recherche

- `data/verified-companies.json` enthält recherchierte Angaben einschließlich Datum, Beleg und Link. `verifiedAt` beschreibt den Recherchestand, nicht eine fortlaufende Echtzeitprüfung. Konzernzahlen und juristische Einheiten müssen getrennt betrachtet werden.
- `services/webService.ts` ruft Google News RSS ab und verwendet Bing News RSS als Ausweichquelle. `WEB_RESEARCH_PROVIDER=bing` dreht die Reihenfolge um. Das funktioniert ohne API-Schlüssel; Nachrichten werden serverseitig geladen.
- Suchtreffer enthalten Überschrift, Veröffentlichungsdatum und Quellenlink. Sie sind ausdrücklich **nicht inhaltlich verifiziert**. Ähnlich benannte Firmen werden anhand des Namens gefiltert; eine eindeutige Identität ist bei frei eingegebenen Firmen dadurch noch nicht bestätigt.
- Die automatische Zuordnung von Chancen und Risiken ist standardmäßig **regelbasiert**, beispielsweise über „Kurzarbeit“ oder „Investition“ in Überschriften. Ohne konfigurierte KI-Zugangsdaten enthält die Antwort `method: "rules"`. Neutralität oder fehlende Meldungen ergeben kein positives Geschäftsurteil.
- Fakten werden nie aus nicht belegten Zahlen ergänzt. Ein fehlender Umsatz ist unbekannt und kein Umsatz von null Euro.
- Nachrichtenanfragen haben Zeitlimits, eine begrenzte Antwortgröße, einen Cache von höchstens fünf Minuten und eine Ausweichquelle. Vollständige Artikeltexte werden nicht gespeichert.

Die öffentlichen RSS-Feeds nennen in ihren Nutzungsbedingungen Beschränkungen auf private, nichtkommerzielle Nutzung. Vor einem produktiven Unternehmenseinsatz ist eine passende Lizenz beziehungsweise ein lizenzierter Nachrichtenanbieter erforderlich. Die Suchlogik ist dafür in `webService.ts` austauschbar; erfolgreiche technische Abrufe bedeuten keine Lizenzfreigabe.

North Data ist bewusst als `not_configured` dargestellt. `services/northDataService.ts` bildet die Integrationsgrenze. Für echte Registerdaten sind ein lizenzierter Zugang, ein dokumentiertes Antwortschema und die Implementierung dieses Adapters erforderlich. Es findet kein Umgehen von Anmeldungen oder Scraping geschützter Registerinhalte statt.

## Optionales KI-Briefing

`services/aiService.ts` integriert die OpenAI Responses API serverseitig per HTTP, ohne zusätzliches SDK. **Erst wenn sowohl `OPENAI_API_KEY` als auch `OPENAI_MODEL` gesetzt sind**, erstellt eine Recherche zusätzlich ein generiertes Gesprächsbriefing. Ein Modell wird nicht automatisch ausgewählt. Ohne diese Konfiguration erfolgt kein OpenAI-Aufruf.

Übertragen werden ausschließlich der öffentliche Unternehmensname und maximal zwölf öffentliche Signalbeschreibungen mit Quelle und Datum. Kundennummern, SAP-Vertriebsdaten und vorhandene interne Analysen gehören nicht zum Request. Die Antwort wird mit `store: false` angefordert; das ist keine Zusage vollständiger Datenlöschung oder einer bestimmten Aufbewahrungsrichtlinie.

Das Briefing erhält die Kennzeichnung „KI-Interpretation“ und referenziert die Reihenfolge der externen Signale mit `[1]`, `[2]` usw. Die Interpretation ersetzt keine geprüften Fakten. Numerische Kennzahlen sind im generierten Text bewusst ausgeschlossen; belegte Kennzahlen bleiben in den eigenen KPI-Kacheln. Ungültige Quellenverweise, unvollständige Antworten, API-Fehler oder das Zeitlimit von zwölf Sekunden führen zur regelbasierten Einordnung zurück.

`Company.analysisSummary` und `Company.analysisMethod` speichern das letzte Briefing im Dossier. Die Rechercheantwort liefert zusätzlich `summary`, `method` und den tatsächlichen KI-Anbieterstatus. Die Integration wurde mit gemockten HTTP-Antworten geprüft; ohne bereitgestellte Zugangsdaten wurde kein kostenpflichtiger API-Aufruf durchgeführt.

Implementierungsgrundlage: [OpenAI Docs zur Texterzeugung](https://developers.openai.com/api/docs/guides/text) und [Responses API – Create](https://developers.openai.com/api/reference/resources/responses/methods/create).

## SAP später anschließen

`services/sapService.ts` ist das separate Modul für:

```ts
getKundenliste()
getVertriebZuKunde(kundenNr)
```

Ohne Konfiguration liefern beide Funktionen `status: "not_configured"`, leere Datenlisten und unbekannte Kennzahlen. Das Frontend erhält keine Demo-Umsätze.

Folgende Einstellungen sind vorgesehen:

| Variable | Bedeutung |
| --- | --- |
| `SAP_ODATA_BASE_URL` | HTTPS-Basisadresse des eigenen OData-Dienstes |
| `SAP_ODATA_CUSTOMERS_PATH` | Relativer Endpunkt der Kundenliste, zum Beispiel `Customers` |
| `SAP_ODATA_SALES_PATH` | Relativer Vertriebsendpunkt mit obligatorischem `{kundenNr}`, zum Beispiel `CustomerSales('{kundenNr}')` |
| `SAP_CUSTOMER_ID_FIELD` | Feld der Kundennummer in der Kundenliste, Standard `kundenNr` |
| `SAP_CUSTOMER_NAME_FIELD` | Namensfeld in der Kundenliste, Standard `name` |
| `SAP_BEARER_TOKEN` | Serverseitiges Zugriffstoken, falls verwendet |
| `SAP_USERNAME`, `SAP_PASSWORD` | Alternative HTTP-Basic-Zugangsdaten |
| `SAP_CLIENT` | Optionaler SAP-Mandant |

Die genannten Pfade sind **Beispiele für eine eigene Projektion**, keine Behauptung, dass diese Entitäten in einem Standard-S/4HANA-System bereits vorhanden sind. Eine CDS/OData-Projektion bereitstellen oder die Zuordnung in `normalizeSales()` an das konkrete SAP-Schema anpassen. Kundennummern müssen den Dossiers zugeordnet werden; derzeit sind keine Kundennummern erfunden oder automatisch vermutet.

Erwartete Kundenliste, alternativ in OData V2 als `{ "d": { "results": [...] } }`:

```json
{
  "value": [
    { "kundenNr": "ECHTE_KUNDENNUMMER", "name": "Firmenname aus SAP" }
  ]
}
```

Der Vertriebsendpunkt liefert genau einen Kunden in dieser Form. Die nachstehenden Werte sind ausschließlich **Schema-Platzhalter in der Dokumentation**, keine geladenen App-Daten:

```ts
{
  umsatzJeJahr: Array<{ jahr: number; umsatz: number }>,
  produktgruppenMix: Array<{ name: string; prozent: number }>,
  artikelImStamm: number | null,
  historie: Array<{ datum: "YYYY-MM-DD"; bestellungen: number; umsatz?: number }>
}
```

Die Jahresumsätze werden in **EUR**, die Produktgruppenanteile in Prozent geliefert. Für andere Währungen vorher im Integrationsdienst umrechnen und Herkunft dokumentieren. Produktgruppen sind zum Beispiel Ventiltechnik, Filtertechnik, Speichertechnik, Sensorik und Zerspanungsteile. OData V2 `d`, `results` sowie V4 `value` werden unterstützt. Mehrere Kunden in einer Vertriebsantwort, unpassende Schemata und Produktgruppen über insgesamt 100 Prozent werden zurückgewiesen. Pagination einer großen SAP-Kundenliste ist vor dem Produktivanschluss im Adapter zu ergänzen.

Der Adapter setzt eine feste Herkunft für Endpunkte durch, verweigert HTTP-Weiterleitungen, verwendet Zeitlimits und gibt keine Credentials an den Browser aus. Ein Token-Erneuerungsprozess und die spezifische S/4HANA-Autorisierung müssen passend zum Zielsystem ergänzt werden. Die tatsächliche SAP-Verbindung ist mangels Zugang noch nicht getestet.

## API

| Methode und Pfad | Antwort |
| --- | --- |
| `GET /api/companies` | `{ companies: Company[] }` mit recherchiertem Ausgangsbestand |
| `POST /api/analyze` | Anfrage `{ query: string, force?: boolean }`; Antwort `AnalysisResponse` |
| `GET /api/status` | Status der Web-, North-Data- und SAP-Module |
| `GET /api/sap` | `{ status, source, message?, kunden: [...] }` |
| `GET /api/sap/:kundenNr` | `SalesData` mit Verbindungsstatus und Vertriebsdaten |

`POST /api/analyze` nimmt ausschließlich den Suchnamen entgegen. Mitgesendete Unternehmenskennzahlen werden nicht als Fakten übernommen. Ein Anbieterfehler steht in `providers`; bereits belegte Quellen bleiben im Dossier erhalten. Eine leere Suche bedeutet nicht, dass ein Unternehmen stabil oder risikofrei ist.

## PWA, Offline und Aktualisierung

Das Manifest, die App-Icons und `public/sw.js` ermöglichen die Installation über einen unterstützten Browser. iOS verwendet in Safari „Teilen → Zum Home-Bildschirm“. Installierbarkeit setzt HTTPS oder localhost voraus. Der Startbildschirm wird vom Betriebssystem aus Manifest, Icons und Hintergrundfarbe erzeugt.

Der Service Worker speichert die App-Hülle, eigene statische Module und aufgerufene Ansichten. Dossiers werden durch die App im lokalen Gerätespeicher gesichert. Nach dem vollständigen ersten Laden stehen gespeicherte Dossiers offline zur Verfügung; eine erstmalige Recherche braucht Internet. Browser können Speicher unter Druck entfernen. Inkognitomodi und gesperrter Speicher können Offline-Verfügbarkeit einschränken.

API-Antworten werden **nicht pauschal gecacht**, insbesondere keine SAP-Antworten. Authentifizierungswege werden nicht durch Offline-Antworten ersetzt. Abmeldung löscht den App-Cache und sendet `CLEAR_PRIVATE_DATA` an offene Fenster; der Client entfernt damit seine lokale Dossierspeicherung. Ein zukünftiger persistenter SAP-Cache benötigt eine eigene Benutzer- und Berechtigungsstrategie.

Beim Kaltstart prüft die App auf eine neue Service-Worker-Version. Eine wartende Version wird nach „Jetzt aktualisieren“ per `SKIP_WAITING` aktiviert. Den Wert `BUILD_VERSION` in `public/sw.js` mit jeder veröffentlichten Fassung erhöhen. Das verhindert veraltete Chunk-Zuordnungen. Bei Entwicklungsproblemen alte Worker unter den Browser-Entwicklerwerkzeugen entfernen.

## Teilen und PDF

Dossier-Links verwenden einen URL-Hash mit Firmen-ID. Bekannte Unternehmen aus dem gemeinsamen Ausgangsbestand lassen sich damit auf einem anderen Gerät öffnen. Neu recherchierte, nur lokal gespeicherte Dossiers werden durch einen Link **nicht auf einen Server hochgeladen**; Empfänger müssen den Firmennamen selbst recherchieren. Es gibt derzeit keinen geräteübergreifenden gemeinsamen Dossierspeicher.

Auf unterstützten Geräten wird die Web Share API verwendet, sonst kann der Link kopiert werden. Der Export öffnet den Browserdruck; dort „Als PDF speichern“ wählen. Das Drucklayout ist auf A4 ausgelegt. Tatsächliche Seitenzahl und Umbrüche hängen von Signallänge, Druckskalierung und Browser ab.

## Prüfung

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/backend.test.mjs tests/backend-sw.test.mjs tests/backend-ai.test.mjs
npm run build
```

Optionaler echter Netzwerktest unter PowerShell:

```powershell
$env:LIVE_RESEARCH_TEST = "1"
node --experimental-strip-types --test tests/backend.test.mjs tests/backend-sw.test.mjs tests/backend-ai.test.mjs
```

Die Backend-Tests prüfen Eingaben, HTML-/RSS-Bereinigung, Namensrelevanz, Zukunftsdaten, Anbieterausfälle ohne erfundene Fakten, fehlende SAP-Konfiguration und die OData-Zuordnung. Die Worker-Tests prüfen Offline-Start, Modulcache, API-/Auth-Ausschluss, Updatefreigabe und Abmeldung. Die KI-Tests prüfen deaktivierte Konfiguration, die ausschließlich öffentliche Datenprojektion, Antwortvalidierung und den Rückfall bei Fehlern beziehungsweise Zeitüberschreitungen ohne echte API-Aufrufe. Gemockte SAP-Antworten kommen nur in Tests vor. Ein Lighthouse-Mobile-Wert über 90 und eine bestimmte Mobilfunk-Ladezeit müssen an der tatsächlichen Hosting-URL gemessen werden; sie werden nicht allein aus der Implementierung abgeleitet.

## Hosting und Zugriff

Die Anwendung ist für eine private Site vorbereitet. Die Hosting-Zugriffsregel bestimmt, wer sie aufrufen darf. `app/chatgpt-auth.ts` enthält die optionalen ChatGPT-Anmeldehelfer; `/signin-with-chatgpt`, `/signout-with-chatgpt` und `/callback` gehören der Hosting-Plattform und werden nicht als eigene App-Routen implementiert. Die portable Entwicklungsumgebung kann eine lokale Testanmeldung bereitstellen; sie wird nicht in Produktionsbuilds übernommen.

Vor Freischaltung echter SAP-Daten müssen die konkreten Benutzerberechtigungen und der Datenumfang auf Serverseite entsprechend der eigenen Organisation zugeordnet werden. Die vorhandene private Site und eine erfolgreiche Anmeldung ersetzen keine SAP-Berechtigungsprüfung.
