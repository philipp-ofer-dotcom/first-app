# PROJ-3: Automatische Rechnungserstellung (Smoobu → Lexware)

## Status: In Progress
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-1 (API-Integration)
- Requires: PROJ-2 (City Tax Konfiguration)
- Optional: PROJ-4 (Gäste-Rechnungsformular — wenn Gastdaten vorhanden, werden diese verwendet)

## Beschreibung
Kernfunktion der App: Buchungen aus Smoobu werden automatisch als Rechnungen in Lexware Office erstellt. Der Erstellungszeitpunkt ist pro Objekt oder global konfigurierbar. Die Rechnung enthält alle relevanten Buchungsdetails inklusive City Tax.

## User Stories
- Als Admin möchte ich einstellen, wann eine Rechnung erstellt wird (Timing-Regel).
- Als Admin möchte ich auswählen, ob Rechnungen automatisch oder nach manueller Freigabe erstellt werden.
- Als Admin möchte ich sehen, welche Buchungen eine Rechnung haben und welche noch nicht.
- Als Admin möchte ich Rechnungen manuell für einzelne Buchungen auslösen.
- Als Admin möchte ich die Rechnungsvorlage konfigurieren (welche Felder aus Smoobu übernommen werden).
- Als System soll eine Rechnung automatisch nach der konfigurierten Regel erstellt und an Lexware übermittelt werden.
- Als Admin möchte ich Fehler bei der Rechnungserstellung sehen und erneut versuchen können.

## Acceptance Criteria
- [ ] **Timing-Regeln** (pro Objekt oder global einstellbar):
  - X Tage VOR Anreise (z.B. 3 Tage vorher)
  - AM Anreisetag
  - X Tage NACH Anreise (z.B. 1 Tag danach)
  - AM Abreisetag
  - X Tage NACH Abreise
- [ ] Rechnungsmodus wählbar:
  - **Automatisch**: Rechnung wird ohne manuellen Eingriff erstellt
  - **Manuell**: Rechnung wird vorbereitet, Admin muss freigeben
- [ ] Rechnungsinhalt aus Smoobu:
  - [ ] Gastname und Adresse (falls vorhanden)
  - [ ] Buchungszeitraum (An-/Abreise)
  - [ ] Objektname
  - [ ] Buchungsbetrag (Unterkunftspreis)
  - [ ] City Tax (aus PROJ-2 Konfiguration)
  - [ ] Buchungs-ID als Referenz
- [ ] Wenn PROJ-4 Gastdaten vorhanden: diese werden priorisiert verwendet
- [ ] Rechnungsstatus wird in der App gespeichert: Ausstehend / Erstellt / Fehler
- [ ] Bei Fehler: Fehlermeldung sichtbar, "Erneut versuchen"-Button
- [ ] Duplikat-Schutz: Selbe Buchung kann nicht zwei Rechnungen generieren
- [ ] Lexware Rate Limit (2 req/s) wird eingehalten (Queue in n8n)

## Edge Cases
- Was wenn Smoobu-Buchung storniert wird nach Rechnungserstellung? → Storno-Hinweis in App, manuelle Stornorechnung in Lexware
- Was wenn Lexware-API down ist? → n8n Retry-Mechanismus, Status = "Fehler", Benachrichtigung
- Was wenn Gastdaten unvollständig (z.B. keine Adresse)? → Rechnung trotzdem erstellen mit vorhandenen Daten, Warnung
- Was wenn Buchungsbetrag 0 ist (kostenlose Buchung)? → Keine Rechnung erstellen, Status = "Übersprungen"
- Was wenn City Tax aktiviert aber Personenzahl nicht bekannt? → Maximalbetrag nehmen, Warnung in Rechnung
- Was wenn Timing-Zeitpunkt bereits vergangen (historische Buchung)? → Sofortige Erstellung anbieten

## Technical Requirements
- n8n Workflow: Smoobu Webhook (neue Buchung) → Timing berechnen → Scheduled Job → Lexware API
- Fallback: Polling alle 15 Minuten wenn kein Webhook verfügbar
- Queue für Lexware Rate Limiting (max. 2 req/s)
- Rechnungs-Status in Supabase: `invoices` Tabelle
- Lexware: `POST /v1/invoices` mit vollständigem Payload

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Neue Seiten
- `/invoices` — Buchungs- & Rechnungsübersicht (Hauptseite, neu in Sidebar)
- `/settings/invoice-timing` — Timing-Einstellungen global + pro Objekt

### Komponenten-Baum
```
/invoices
+-- SyncButton + Filter-Tabs (Alle | Ausstehend | Erstellt | Fehler)
+-- BuchungsTabelle
    +-- Zeile: Buchungs-ID | Gastname | Objekt | Anreise | Betrag | Status-Badge | Aktion
        +-- Aktions-Button: "Erstellen" / "Erneut versuchen" / "In Lexware"
        +-- Storno-Hinweis (wenn Buchung storniert)

/settings/invoice-timing
+-- GlobaleEinstellungskarte
|   +-- Timing-Dropdown (vor Anreise / Am Anreisetag / nach Anreise / ...)
|   +-- Tage-Eingabe (bei vor/nach)
|   +-- Modus: Automatisch / Manuell
+-- ProObjektOverrides
    +-- ObjektOverrideKarte (abweichende Einstellung pro Objekt)
```

### Datenmodell (Supabase)
**`invoice_timing_settings`**
- `property_id` → null = globale Einstellung, sonst FK zu properties
- `timing_type` → 'before_checkin' | 'on_checkin' | 'after_checkin' | 'on_checkout' | 'after_checkout'
- `timing_days` → Anzahl Tage
- `invoice_mode` → 'automatic' | 'manual'

**`bookings`** (lokale Smoobu-Kopie)
- `smoobu_booking_id` (unique), `property_id`, `guest_name`, `guest_email`
- `guest_address` (JSON), `checkin_date`, `checkout_date`, `total_amount`
- `num_guests`, `booking_status` ('confirmed' | 'cancelled'), `synced_at`

**`invoices`**
- `booking_id` (unique FK → Duplikat-Schutz), `status`
- Status-Werte: 'pending' | 'ready' | 'creating' | 'created' | 'error' | 'skipped' | 'cancelled'
- `scheduled_for` (Timestamp: wann Rechnung erstellt werden soll)
- `lexware_invoice_id`, `error_message`, `retry_count`, `guest_billing_data` (JSON aus PROJ-4)

### API-Routen (Next.js)
- `GET  /api/bookings` — Buchungen mit Rechnungsstatus
- `POST /api/bookings/sync` — Sync mit Smoobu auslösen
- `POST /api/webhooks/smoobu` — Smoobu Webhook-Empfänger (öffentlich, signiert)
- `GET  /api/invoice-settings` — Timing-Einstellungen
- `PUT  /api/invoice-settings` — Timing-Einstellungen speichern
- `POST /api/invoices/process-scheduled` — n8n ruft alle 15 Min. auf
- `POST /api/invoices/[bookingId]/create` — Rechnung manuell erstellen
- `POST /api/invoices/[bookingId]/retry` — Erneut versuchen

### Automatisierungs-Architektur (n8n)
```
Smoobu Webhook → POST /api/webhooks/smoobu
  → Buchung speichern → scheduled_for berechnen → Invoice anlegen

n8n (alle 15 Min.) → POST /api/invoices/process-scheduled
  → Fällige Invoices (status='ready', scheduled_for ≤ jetzt)
  → Lexware API (max. 2 req/s) → Status aktualisieren

n8n (täglich) → POST /api/bookings/sync (Vollsync)
```

**Warum Business-Logik in Next.js, nicht n8n:** Versioniert im Code, testbar, leichter zu debuggen. n8n ist nur der Scheduler/Trigger.

### Keine neuen Dependencies
Alles bereits installiert.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
