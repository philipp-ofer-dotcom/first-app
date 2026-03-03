# PROJ-4: Gäste-Rechnungsformular (öffentlicher Link)

## Status: Planned
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-1 (Buchungen müssen in der App vorhanden sein)
- Feeds into: PROJ-3 (Gastdaten werden für Rechnungserstellung genutzt)

## Beschreibung
Für Firmenkunden und andere Gäste mit speziellen Rechnungsanforderungen kann ein individueller Link generiert werden. Über diesen Link rufen Gäste ein öffentliches Formular auf, tragen ihre Rechnungsdaten ein, und die Rechnung wird automatisch mit diesen Daten erstellt und nach dem ersten Buchungstag per E-Mail versendet. Vergleichbar mit bnbbills.de.

## User Stories
- Als Admin möchte ich für eine bestimmte Buchung einen einmaligen Link generieren, den ich dem Gast schicken kann.
- Als Admin möchte ich den Link direkt in Smoobu als Custom-Nachricht einbinden können (Platzhalter).
- Als Gast möchte ich über den Link meine Rechnungsdaten eingeben (Name, Firma, Adresse, USt-IdNr.).
- Als Gast möchte ich meine E-Mail-Adresse angeben, an die die Rechnung geschickt werden soll.
- Als Gast möchte ich eine Bestätigungsseite sehen, nachdem ich meine Daten eingereicht habe.
- Als System soll die Rechnung automatisch 1 Tag nach Anreise erstellt und per E-Mail verschickt werden.
- Als Admin möchte ich sehen, für welche Buchungen ein Link generiert wurde und ob Gäste ihre Daten eingetragen haben.

## Acceptance Criteria
- [ ] Pro Buchung kann ein einzigartiger, nicht erratbarer Link generiert werden (UUID-basiert)
- [ ] Links laufen nach Abreise + 7 Tagen ab
- [ ] Das öffentliche Formular zeigt:
  - [ ] Buchungsdetails (Anreise, Abreise, Objektname) — read-only zur Orientierung
  - [ ] Felder: Vorname, Nachname, Firmenname (optional), Rechnungsadresse, PLZ, Ort, Land
  - [ ] USt-IdNr. (optional, für EU-Firmen)
  - [ ] E-Mail-Adresse für Rechnungsversand
- [ ] Formular-Validierung: Pflichtfelder, E-Mail-Format, PLZ-Format
- [ ] Gast kann Daten nur einmal absenden (danach "Bereits eingereicht" Seite)
- [ ] Admin kann Formulardaten nachträglich editieren (vor Rechnungserstellung)
- [ ] Rechnung wird 1 Tag nach Anreisedatum erstellt und per E-Mail versendet (über Lexware)
- [ ] Admin sieht Status pro Link: "Nicht geöffnet", "Geöffnet", "Daten eingereicht", "Rechnung erstellt"
- [ ] Admin kann Link per Button in Zwischenablage kopieren
- [ ] Formular ist mobiloptimiert (Gäste öffnen es oft auf dem Handy)

## Edge Cases
- Was wenn Gast den Link nicht öffnet? → Rechnung wird trotzdem erstellt (mit Smoobu-Gastdaten als Fallback)
- Was wenn Link abgelaufen ist? → Gast sieht "Link abgelaufen"-Seite, kann Admin kontaktieren
- Was wenn Gast Daten einreicht aber Buchung storniert wird? → Daten bleiben, Rechnung nicht mehr erstellt
- Was wenn Admin Link mehrmals generiert? → Nur letzter Link gültig, ältere werden invalidiert
- Was wenn E-Mail-Versand über Lexware fehlschlägt? → Retry, Admin wird benachrichtigt
- Was wenn Gast falschen Firmennamen eingegeben hat? → Admin kann korrigieren solange Rechnung nicht erstellt

## Technical Requirements
- Öffentlicher Route: `/invoice-form/[token]` — kein Login erforderlich
- Token: kryptografisch sicherer UUID (nicht erratbar)
- Supabase Tabelle: `invoice_requests` mit Token, Buchungs-ID, Status, Gastdaten
- E-Mail-Versand: Lexware `POST /v1/invoices` mit `sendViaEmail: true`
- Formular: keine Supabase-Authentifizierung, aber RLS Policy erlaubt nur UPDATE des eigenen Token-Datensatzes

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
