# PROJ-1: Plattform-Integration & Grundeinstellungen

## Status: In Progress
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- None (Basis für alle anderen Features)

## Beschreibung
Admin-Dashboard zum Verbinden von Smoobu und Lexware Office per API-Key, sowie zur Verwaltung aller Objekte (Ferienwohnungen). Dies ist das Fundament für alle weiteren Features.

## User Stories
- Als Admin möchte ich meinen Smoobu API-Key hinterlegen, damit die App Buchungen abrufen kann.
- Als Admin möchte ich meinen Lexware Office API-Key hinterlegen, damit Rechnungen automatisch erstellt werden.
- Als Admin möchte ich eine Liste aller meiner Smoobu-Objekte sehen, damit ich sie individuell konfigurieren kann.
- Als Admin möchte ich für jedes Objekt einen Anzeigenamen und eine interne Notiz hinterlegen.
- Als Admin möchte ich den Verbindungsstatus beider Plattformen auf einen Blick sehen (grün/rot).
- Als Admin möchte ich API-Keys ändern oder widerrufen können.

## Acceptance Criteria
- [ ] Smoobu API-Key kann eingetragen und gespeichert werden (verschlüsselt in Supabase)
- [ ] Lexware Office API-Key kann eingetragen und gespeichert werden (verschlüsselt)
- [ ] Nach Eingabe wird die Verbindung getestet und Erfolg/Fehler angezeigt
- [ ] Alle Smoobu-Objekte werden automatisch aus der API geladen und angezeigt
- [ ] Jedes Objekt zeigt: Name (aus Smoobu), Objekt-ID, Ort
- [ ] Objekte können aktiviert/deaktiviert werden (nur aktive werden verarbeitet)
- [ ] API-Keys werden niemals im Klartext im Frontend angezeigt (nur "****")
- [ ] Verbindungsstatus wird auf dem Dashboard angezeigt

## Edge Cases
- Was passiert bei ungültigem API-Key? → Klare Fehlermeldung, Key wird nicht gespeichert
- Was passiert wenn Smoobu-API nicht erreichbar ist? → Timeout-Fehler mit Retry-Hinweis
- Was passiert wenn ein Objekt in Smoobu gelöscht wird? → Bleibt in DB, wird als "archiviert" markiert
- Was passiert wenn Lexware XL-Plan nicht vorhanden? → Spezifische Fehlermeldung mit Hinweis auf Plan-Upgrade
- Was passiert bei Rate-Limit-Überschreitung? → Wartemeldung, automatischer Retry nach Delay

## Technical Requirements
- API-Keys verschlüsselt speichern (AES-256 oder Supabase Vault)
- Smoobu: `GET /api/apartments` für Objekt-Sync
- Lexware: `GET /v1/profile` für Verbindungstest
- Objekt-Sync: manuell auslösbar + automatisch täglich
- Authentifizierung: Admin-Login erforderlich (Supabase Auth)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seiten
- `/login` — öffentlich, Supabase Auth Email/Passwort
- `/dashboard` — Verbindungsstatus-Übersicht (geschützt)
- `/settings/integrations` — API-Key Verwaltung (geschützt)
- `/settings/properties` — Objekt-Liste & Konfiguration (geschützt)

### Komponenten-Baum
```
App-Layout
+-- Sidebar (Navigation + Logout)
+-- /dashboard
|   +-- SmoobuStatusKarte (grün/rot, letzte Sync-Zeit)
|   +-- LexwareStatusKarte (grün/rot, Plan-Hinweis)
|   +-- ObjekteSummaryKarte ("X von Y aktiv")
+-- /settings/integrations
|   +-- SmoobuIntegrationskarte
|   |   +-- ApiKeyInput (masked *****)
|   |   +-- Speichern-Button
|   |   +-- Verbindung-Testen-Button
|   |   +-- Verbindungsstatus-Badge
|   +-- LexwareIntegrationskarte (gleiche Struktur)
+-- /settings/properties
    +-- SyncButton + letzter Sync-Timestamp
    +-- ObjektTabelle
        +-- Zeile: Name | Smoobu-ID | Ort | Aktiv-Toggle | Notiz
```

### Datenmodell (Supabase)
**Tabelle `integration_settings`**
- `platform` → 'smoobu' oder 'lexware'
- `api_key_encrypted` → AES-256 verschlüsselt (nie im Klartext lesbar)
- `last_tested_at` → Zeitstempel letzter Verbindungstest
- `last_test_status` → 'success', 'error' oder 'untested'
- `last_error_msg` → Fehlermeldung wenn vorhanden

**Tabelle `properties`**
- `smoobu_id` → ID aus Smoobu (eindeutig)
- `name` → Name aus Smoobu
- `location` → Ort
- `display_name` → eigener Anzeigename (optional)
- `notes` → interne Notiz (optional)
- `is_active` → aktiv/inaktiv Toggle
- `is_archived` → true wenn in Smoobu gelöscht
- `synced_at` → letzter Sync-Zeitstempel

### Server-API-Routen (Next.js)
- `POST /api/integrations/smoobu/save` — Key verschlüsselt speichern
- `POST /api/integrations/smoobu/test` — Verbindung zu Smoobu testen
- `POST /api/integrations/lexware/save` — Key verschlüsselt speichern
- `POST /api/integrations/lexware/test` — Verbindung zu Lexware testen
- `POST /api/properties/sync` — Sync mit Smoobu auslösen
- `PATCH /api/properties/[id]` — Objekt-Einstellungen aktualisieren

### Sicherheits-Architektur
- API-Keys verlassen **NIE den Server** — alle Smoobu/Lexware-Calls laufen durch Next.js API Routes
- AES-256 Verschlüsselung im Server, Decryption-Key nur als Umgebungsvariable
- Next.js Middleware schützt alle `/dashboard/*` und `/settings/*` Routen automatisch
- Browser sieht niemals den echten API-Key, nur Sternchen

### Automatischer Objekt-Sync
- n8n Daily-Workflow ruft täglich `/api/properties/sync` auf (mit internem Service-Key)
- Kein Serverless-Timeout-Problem da n8n den Request initiiert

### Neue Dependencies
Keine — alles bereits installiert: Supabase SDK, Zod, React Hook Form, shadcn/ui, Lucide Icons

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
