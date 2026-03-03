# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend
- **Planned** - Requirements written, ready for development
- **In Progress** - Currently being built
- **In Review** - QA testing in progress
- **Deployed** - Live in production

## Features

| ID | Feature | Status | Spec | Created |
|----|---------|--------|------|---------|
| PROJ-1 | Plattform-Integration & Grundeinstellungen | In Progress | [spec](PROJ-1-plattform-integration-grundeinstellungen.md) | 2026-03-02 |
| PROJ-2 | City Tax Konfiguration | In Progress | [spec](PROJ-2-city-tax-konfiguration.md) | 2026-03-02 |
| PROJ-3 | Automatische Rechnungserstellung (Smoobu → Lexware) | In Progress | [spec](PROJ-3-automatische-rechnungserstellung.md) | 2026-03-02 |
| PROJ-4 | Gäste-Rechnungsformular (öffentlicher Link) | Planned | [spec](PROJ-4-gaeste-rechnungsformular.md) | 2026-03-02 |
| PROJ-5 | Beleg-Download (Airbnb & Booking.com) | Planned | [spec](PROJ-5-beleg-download.md) | 2026-03-02 |
| PROJ-6 | Dokument-Übersicht & Lexware-Transfer-Freigabe | Planned | [spec](PROJ-6-dokument-uebersicht-lexware-transfer.md) | 2026-03-02 |

<!-- Add features above this line -->

## Next Available ID: PROJ-7

## Build Order (empfohlen)

```
PROJ-1 → PROJ-2 → PROJ-3 → PROJ-4 → PROJ-5 → PROJ-6
  │         │         │
  └─────────┴─────────┴──── alle bauen auf PROJ-1 auf
```

| Schritt | Feature | Warum |
|---------|---------|-------|
| 1 | PROJ-1 | Fundament: API-Verbindungen, Objekte |
| 2 | PROJ-2 | City Tax muss vor Rechnungen konfigurierbar sein |
| 3 | PROJ-3 | Kernfunktion: Rechnungserstellung |
| 4 | PROJ-4 | Erweiterung: Gastdaten für bessere Rechnungen |
| 5 | PROJ-5 | Belege herunterladen |
| 6 | PROJ-6 | Alles zusammenführen und kontrolliert übertragen |
