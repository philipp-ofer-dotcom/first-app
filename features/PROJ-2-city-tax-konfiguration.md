# PROJ-2: City Tax Konfiguration

## Status: In Progress
**Created:** 2026-03-02
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-1 (Objekte müssen in der App vorhanden sein)

## Beschreibung
Pro Ferienwohnung kann individuell eingestellt werden, ob eine City Tax (Kurtaxe/Tourismusabgabe) gilt, wie hoch sie ist, ab welchem Alter sie anfällt und wie sie berechnet wird (pro Person/Nacht, mit Altersausnahmen). Diese Daten fließen direkt in die Rechnungserstellung ein.

## User Stories
- Als Admin möchte ich für jedes Objekt die City Tax aktivieren oder deaktivieren können.
- Als Admin möchte ich den Betrag pro Person/Nacht festlegen können (z.B. 2,50 €).
- Als Admin möchte ich eine Altersregel festlegen: ab welchem Alter die City Tax gilt (z.B. ab 18 Jahren).
- Als Admin möchte ich Teilzahlungen für bestimmte Altersgruppen festlegen (z.B. 6–17 Jahre = 50% Reduzierung).
- Als Admin möchte ich mehrere Altersgruppen mit unterschiedlichen Sätzen hinterlegen.
- Als Admin möchte ich einstellen, ob die City Tax auf der Rechnung separat ausgewiesen wird.
- Als Admin möchte ich sehen, wie die City Tax für eine Musterbuchung berechnet werden würde (Vorschau).

## Acceptance Criteria
- [ ] Jedes Objekt hat einen City Tax Toggle (aktiv/inaktiv)
- [ ] Betrag pro Person/Nacht kann als Dezimalzahl eingetragen werden (z.B. 2,50)
- [ ] Mindestens eine Altersregel kann definiert werden (z.B. "ab 18 Jahren: voller Betrag")
- [ ] Mehrere Altersgruppen mit individuellen Prozentsätzen sind möglich:
  - z.B. Unter 6: 0%, 6–17: 50%, Ab 18: 100%
- [ ] Altersgruppen-Validierung: keine Überlappungen, keine Lücken möglich
- [ ] Vorschau: Eingabe von Personenanzahl + Alter → berechnet City Tax
- [ ] Änderungen sind sofort wirksam für neue Rechnungen
- [ ] Bereits erstellte Rechnungen werden NICHT nachträglich geändert
- [ ] City Tax erscheint als eigene Rechnungsposition wenn aktiviert

## Edge Cases
- Was wenn keine Altersangabe der Gäste vorhanden? → Fallback auf Maximalrate, Warnung in der UI
- Was wenn Buchung 0 Nächte hat? → City Tax = 0, keine Fehlermeldung
- Was wenn City Tax auf 0 gesetzt wird? → Automatisch deaktiviert mit Hinweis
- Was wenn ein Objekt mehrere Kommunen hat (Grenzlage)? → Freitext-Bezeichnung des Steuertyps einstellbar
- Was wenn die Steuerrate sich ändert? → Altes Datum bis wann, neues Datum ab wann eintragbar (Gültigkeitszeitraum)

## Technical Requirements
- Berechnung: (Anzahl Personen in Altersgruppe × Nächte × Betrag × Prozentsatz)
- Supabase Tabelle: `city_tax_rules` mit FK auf Objekt-ID
- Validierung auf Server-Seite (Zod)
- Änderungshistorie: Wann wurde welcher Satz eingetragen (für Audit)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Neue Seite
- `/settings/city-tax` — City Tax Übersicht & Konfiguration (in bestehender Sidebar ergänzt)

### Komponenten-Baum
```
/settings/city-tax
+-- CityTaxÜbersicht
    +-- Kopfzeile
    +-- ObjektKonfigurationsliste
        +-- ObjektCityTaxKarte (pro Objekt)
            +-- Objektname + Ort
            +-- Aktiv/Inaktiv Toggle
            +-- "Konfigurieren" Button → öffnet Sheet

KonfigurationsSheet (von rechts einfahrend)
+-- SteuerbezeichnungEingabe (Freitext, z.B. "Kurtaxe Karlsruhe")
+-- BetragEingabe (€ pro Person/Nacht)
+-- GültigkeitAbEingabe (Datum)
+-- SepAusweisungToggle (separat auf Rechnung)
+-- AltersgruppenEditor
|   +-- AltersgruppeZeile (Altersbereich von–bis + Prozentsatz)
|   +-- "Altersgruppe hinzufügen" Button
|   +-- Validierungshinweis (Überlappungen/Lücken)
+-- VorschauRechner (live, client-seitig)
    +-- PersonenEingabe + NächteEingabe
    +-- Berechnungsergebnis
+-- Speichern / Abbrechen
```

### Datenmodell (Supabase)
**Tabelle `city_tax_configs`** (neue Version bei Änderung, nie überschreiben)
- `property_id` → FK zu properties
- `is_active` → aktiv/inaktiv
- `tax_label` → Bezeichnung (z.B. "Kurtaxe Karlsruhe")
- `amount_per_person_night` → Betrag in Euro
- `show_separately` → separat auf Rechnung ausweisen
- `valid_from` → ab wann gültig (für Historisierung)
- `created_at`

**Tabelle `city_tax_age_groups`** (pro Konfiguration)
- `city_tax_config_id` → FK zu city_tax_configs
- `age_from` → Mindestalter (null = kein Minimum)
- `age_to` → Höchstalter (null = kein Maximum)
- `percentage` → 0–100 (z.B. 50 = halber Beitrag)
- `sort_order`

### API-Routen (Next.js)
- `GET /api/city-tax` — alle Objekte mit aktueller Config
- `PUT /api/city-tax/[propertyId]` — Config speichern (neue Version, nie überschreiben)
- `GET /api/city-tax/[propertyId]/history` — Änderungshistorie

### Berechnungslogik (client-seitig)
Formel: Σ (Personen in Altersgruppe × Nächte × Betrag × Prozentsatz/100)

### Sicherheit für Historisierung
Beim Speichern wird IMMER eine neue Zeile in `city_tax_configs` angelegt (nie UPDATE).
Rechnungen referenzieren immer die Config, die zum Buchungsdatum gültig war.

### Keine neuen Dependencies
Alles vorhanden: Sheet, Switch, Input, Badge, Card, Form (shadcn/ui)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
