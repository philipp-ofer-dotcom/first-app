# PROJ-6: Dokument-Übersicht & Lexware-Transfer-Freigabe

## Status: Planned
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-1 (Lexware-Integration)
- Requires: PROJ-3 (Rechnungen vorhanden)
- Requires: PROJ-5 (Belege vorhanden)

## Beschreibung
Zentrale Übersichtsseite, die alle erstellten Rechnungen und heruntergeladenen Belege auflistet. Der Admin kann einzeln oder per Batch auswählen, welche Dokumente nach Lexware Office übertragen werden sollen. Verhindert versehentliche Doppelübertragungen und gibt volle Kontrolle über den Buchungsprozess.

## User Stories
- Als Admin möchte ich eine Gesamtübersicht aller Rechnungen und Belege sehen.
- Als Admin möchte ich filtern nach: Plattform, Zeitraum, Status, Objekt.
- Als Admin möchte ich für jedes Dokument sehen, ob es bereits in Lexware ist oder nicht.
- Als Admin möchte ich einzelne Dokumente auswählen und nach Lexware übertragen.
- Als Admin möchte ich mehrere Dokumente auf einmal auswählen und als Batch übertragen.
- Als Admin möchte ich den Übertragungsstatus live verfolgen.
- Als Admin möchte ich fehlerhafte Übertragungen sehen und erneut versuchen können.
- Als Admin möchte ich Dokumente als "Ignoriert" markieren können (z.B. Test-Buchungen).

## Acceptance Criteria
- [ ] Übersichtstabelle mit Spalten: Datum, Buchungs-ID, Gastname, Objekt, Typ (Rechnung/Beleg), Plattform, Betrag, Status
- [ ] Status-Werte: "Neu", "Bereit", "Übertragen", "Fehler", "Ignoriert"
- [ ] Filteroptionen: Datumsbereich, Plattform (Airbnb/Booking.com/Smoobu), Objekt, Status
- [ ] Sortierfunktion nach allen Spalten
- [ ] Checkbox-Auswahl: einzeln und "Alle auswählen"
- [ ] "Nach Lexware übertragen" Button für Auswahl (mit Bestätigungs-Dialog)
- [ ] Live-Status während Übertragung: Fortschrittsanzeige bei Batch
- [ ] Nach Übertragung: Lexware-Dokument-ID und Link in der Zeile angezeigt
- [ ] "Erneut versuchen" Button bei fehlgeschlagenen Übertragungen
- [ ] "Als ignoriert markieren" Option pro Dokument
- [ ] PDF-Vorschau per Klick auf Dokumentname (öffnet in Modal)
- [ ] Export der Übersicht als CSV

## Edge Cases
- Was wenn Lexware-API während Batch-Transfer abbricht? → Bereits übertragene bleiben "Übertragen", Rest bleibt "Bereit"
- Was wenn dasselbe Dokument doppelt übertragen wird? → Duplikat-Prüfung anhand Buchungs-ID, Warnung anzeigen
- Was wenn Lexware-Dokument nachträglich gelöscht wird? → Status bleibt "Übertragen", kein automatischer Sync zurück
- Was wenn 100+ Dokumente übertragen werden? → Rate Limiting (2 req/s), Warteschlange, Fortschrittsbalken
- Was wenn Admin versehentlich alle markiert? → Bestätigungs-Dialog mit Anzahl und Gesamtbetrag
- Was wenn ein Objekt viele Dokumente hat (Jahresübersicht)? → Pagination, max. 50 pro Seite

## Technical Requirements
- Supabase Query mit Joins: Buchungen + Rechnungen + Belege
- Lexware: `POST /v1/vouchers` für Belege, `POST /v1/invoices` für Rechnungen
- Queue: n8n Workflow für Batch-Transfer mit Rate-Limiting
- Real-time Updates: Supabase Realtime für Live-Status
- Export: CSV-Generation auf dem Server

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
