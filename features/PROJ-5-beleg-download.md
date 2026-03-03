# PROJ-5: Beleg-Download (Airbnb & Booking.com)

## Status: Planned
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-1 (Grundeinstellungen, Lexware-Integration)
- Related: PROJ-6 (Belege werden in der Dokument-Übersicht angezeigt)

## Beschreibung
Automatischer oder manuell ausgelöster Download von Buchungsbelegen von Airbnb und Booking.com, die anschließend als Gegenbuchungs-Belege in Lexware Office hochgeladen werden. Jeder Beleg entspricht den Plattformgebühren und -steuern einer Buchung.

## ⚠️ Hinweis: Airbnb ToS-Risiko
Airbnb hat keine öffentliche API für Hosts. Die Implementierung erfolgt via Browser-Automatisierung (Playwright). Dies verstößt gegen Airbnbs Nutzungsbedingungen und kann zur Kontosperrung führen. Der Admin akzeptiert dieses Risiko bewusst.

## User Stories
- Als Admin möchte ich meine Airbnb-Zugangsdaten hinterlegen, damit Belege automatisch heruntergeladen werden können.
- Als Admin möchte ich meine Booking.com-Zugangsdaten hinterlegen (oder manuell PDFs hochladen falls API nicht verfügbar).
- Als Admin möchte ich auswählen, ab welchem Datum Belege heruntergeladen werden sollen.
- Als System sollen Belege automatisch heruntergeladen werden, sobald sie auf den Plattformen verfügbar sind.
- Als Admin möchte ich den Download-Status jeder Buchung sehen.
- Als Admin möchte ich Belege manuell für einzelne Buchungen herunterladen auslösen.
- Als Admin möchte ich heruntergeladene Belege in einer Vorschau sehen.

## Acceptance Criteria

### Airbnb (Browser-Automatisierung)
- [ ] Airbnb E-Mail und Passwort können verschlüsselt hinterlegt werden
- [ ] Playwright-Script loggt sich in Airbnb ein und lädt Buchungsbeleg als PDF herunter
- [ ] 2FA-Unterstützung: Admin kann TOTP-Secret hinterlegen oder manuelle Codes eingeben
- [ ] Beleg-URL wird aus der Buchungsdetailseite extrahiert
- [ ] Heruntergeladenes PDF wird in Supabase Storage gespeichert
- [ ] Status pro Buchung: "Ausstehend", "Heruntergeladen", "Fehler"

### Booking.com
- [ ] **Option A (API):** Booking.com Partner-Credentials können hinterlegt werden (für spätere Aktivierung)
- [ ] **Option B (Manuell):** PDF-Upload pro Buchung möglich
- [ ] Manuell hochgeladene PDFs werden genauso behandelt wie automatisch heruntergeladene

### Allgemein
- [ ] Belege werden in Supabase Storage abgelegt
- [ ] Beleg ist der korrekten Buchungs-ID zugeordnet
- [ ] PDF-Vorschau in der App möglich
- [ ] Startdatum konfigurierbar: Belege nur ab X Datum herunterladen
- [ ] Duplikat-Schutz: Gleiche Buchung wird nicht doppelt heruntergeladen

## Edge Cases
- Was wenn Airbnb Login fehlschlägt (falsches Passwort)? → Fehlerstatus, E-Mail an Admin
- Was wenn Airbnb 2FA verlangt und kein Secret hinterlegt? → Manuelle Eingabe anfordern, Status pausiert
- Was wenn Airbnb die Seitenstruktur ändert? → Playwright-Script bricht → Fehlerstatus für alle betroffenen Buchungen
- Was wenn Beleg noch nicht verfügbar (Buchung noch nicht abgerechnet)? → Retry nach 24h
- Was wenn Booking.com API weiterhin geschlossen bleibt? → Manueller Upload als primärer Weg
- Was wenn PDF korrupt ist? → Validierung, Fehler-Status, Re-Download anbieten

## Technical Requirements
- Playwright (headless Browser) in n8n via "Execute Command" oder separatem Microservice
- Airbnb-Credentials verschlüsselt in Supabase (AES-256)
- Supabase Storage Bucket: `belege` (private, nur Admin-Zugriff)
- Max. PDF-Größe: 20 MB
- Booking.com: HTTP Request Node in n8n für spätere API-Anbindung vorbereiten
- Rate Limiting: max. 1 Airbnb-Login alle 30 Minuten (Suspicion-Prevention)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
