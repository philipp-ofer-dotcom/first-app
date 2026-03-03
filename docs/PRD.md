# Product Requirements Document

## Vision
Eine Web-App für Ferienwohnungsvermieter, die die gesamte Buchhaltungsautomatisierung übernimmt: automatische Rechnungserstellung aus Smoobu-Buchungen, Gäste-Rechnungsformular per individuellem Link, City Tax Konfiguration pro Objekt sowie automatischer Download und Transfer von Belegen (Airbnb, Booking.com) nach Lexware Office. Ähnlich wie bnbbills.de, aber mit mehr Kontrolle, erweiterbar auf weitere Plattformen.

## Target Users
**Primär:** Ferienwohnungsvermieter mit 5–20 Objekten, die Smoobu als PMS und Lexware Office als Buchhaltungssoftware nutzen.
- Pain Points: Manuelle Rechnungserstellung ist zeitaufwändig, Firmenkunden haben spezielle Rechnungsanforderungen, City Tax wird oft vergessen oder falsch berechnet, Belege von Airbnb/Booking.com müssen manuell heruntergeladen und gebucht werden.

**Sekundär:** Buchhalterin/Steuerberater, die Belege und Rechnungen prüfen und freigeben.

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | PROJ-1: Plattform-Integration & Grundeinstellungen | Planned |
| P0 (MVP) | PROJ-2: City Tax Konfiguration | Planned |
| P0 (MVP) | PROJ-3: Automatische Rechnungserstellung (Smoobu → Lexware) | Planned |
| P1 | PROJ-4: Gäste-Rechnungsformular (öffentlicher Link) | Planned |
| P1 | PROJ-5: Beleg-Download (Airbnb & Booking.com) | Planned |
| P2 | PROJ-6: Dokument-Übersicht & Lexware-Transfer-Freigabe | Planned |

## Success Metrics
- Rechnungserstellung: 0 manuelle Eingriffe für Standardbuchungen
- Zeitersparnis: > 3 Stunden/Woche weniger Buchhaltungsaufwand
- Fehlerrate City Tax: 0 falsch berechnete Steuern
- Belegvollständigkeit: > 95% aller Airbnb/Booking.com Belege automatisch erfasst

## Constraints
- Lexware Office benötigt **XL-Plan** für API-Zugang
- Airbnb hat **keine öffentliche API** — Browser-Automatisierung mit ToS-Risiko
- Booking.com Connectivity API: neue Partnerschaften aktuell pausiert, Fallback: manuelle Uploads
- n8n self-hosted als Automatisierungs-Backend (kostenlos)
- Aktuell 9 Objekte in Smoobu

## Non-Goals (v1)
- Keine mobile App (Web-App reicht)
- Kein Multi-Tenant (einzelner Vermieter, kein SaaS)
- Keine anderen PMS-Integrationen außer Smoobu in v1
- Keine anderen Buchhaltungsprogramme außer Lexware Office in v1
- Kein Gäste-Portal für andere Zwecke (nur Rechnungsdaten)

---
