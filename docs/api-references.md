# API & Integration References

> Gesammelte API-Dokumentationen für alle integrierten Plattformen.
> Zuletzt aktualisiert: 2026-03-02

---

## Smoobu (PMS)

| Ressource | URL |
|-----------|-----|
| API Dokumentation | https://docs.smoobu.com/ |
| Support / API-Zugang | https://support.smoobu.com/hc/en-us/articles/360003170740 |
| Partner OAuth | https://login.smoobu.com/{locale}/oauth/authorize |

**Auth:** API-Key im Header: `API-key: DEIN_KEY`
**Rate Limit:** 1.000 Requests/Minute
**Key Endpoints:**
- `GET /api/apartments` — alle Objekte
- `GET /api/reservations` — Buchungen (mit Filtern: from, to, etc.)
- `GET /api/guests` — Gästedaten
- `GET /api/me` — eigene Account-Infos
- Webhooks: Kalender-Updates per JSON POST an eigene URL

---

## Lexware Office (Buchhaltung)

| Ressource | URL |
|-----------|-----|
| API Dokumentation | https://developers.lexware.io/docs/ |
| Partner API | https://developers.lexware.io/partner/docs/ |
| API Base URL | https://api.lexware.io |

**Auth:** Bearer Token: `Authorization: Bearer DEIN_API_KEY`
**Voraussetzung:** Lexware Office **XL-Plan**
**Rate Limit:** 2 Requests/Sekunde (Token Bucket)
**Key Endpoints:**
- `POST /v1/invoices` — Rechnung erstellen
- `GET /v1/invoices/{id}` — Rechnung abrufen
- `POST /v1/contacts` — Kontakt/Kunde anlegen
- `GET /v1/vouchers` — Belege abrufen
- `POST /v1/vouchers` — Beleg hochladen (PDF)
- Webhooks: Event-Subscriptions mit Signatur-Verifikation

---

## Airbnb

| Ressource | URL |
|-----------|-----|
| Developer Portal | https://developer.withairbnb.com/ |
| API Terms of Service | https://www.airbnb.com/help/article/3418 |
| Payout/Belege (manuell) | https://www.airbnb.com/help/article/418 |

**⚠️ WICHTIG:** Airbnb hat **keine öffentliche API** für Hosts.
- API-Zugang nur auf Einladung (Partner-Programm)
- Kein Annehmen neuer Entwickler-Anfragen
- **Implementierungsansatz:** Playwright Browser-Automatisierung (ToS-Risiko beachten!)
- Risiko: Kontoaussetzung bei Erkennung

---

## Booking.com

| Ressource | URL |
|-----------|-----|
| Connectivity API Docs | https://developers.booking.com/connectivity/docs |
| Partner-Portal | https://partner.booking.com/ |
| Rechnungen/Steuern (manuell) | https://partner.booking.com/en-us/help/commission-invoices-tax |

**Status:** Neue Partnerschaften aktuell **pausiert**
**Auth (wenn verfügbar):** B.XML mit username/password + hotel_id
**Key Endpoints (wenn Partnerschaft):**
- `GET /connectivity-payments/reservations/{id}` — Zahlungsdetails
- Monatliche Auszüge als XLS/CSV exportierbar

**Fallback v1:** Manueller PDF-Upload durch Nutzer

---

## n8n (Workflow Automation)

| Ressource | URL |
|-----------|-----|
| Dokumentation | https://docs.n8n.io/ |
| Integrations-Verzeichnis | https://n8n.io/integrations/ |
| GitHub (Self-hosted) | https://github.com/n8n-io/n8n |
| Community Lexware-Node | https://github.com/adrijanb/n8n-node-lexware |
| Community Lexware-Node 2 | https://www.npmjs.com/package/@pixelandprocess_de/n8n-nodes-lexware-office |

**Hosting:** Self-hosted kostenlos, Cloud ab €24/Monat
**Smoobu:** Kein nativer Node — HTTP Request Node verwenden
**Lexware:** Community-Nodes verfügbar (s.o.)

---

## Architektur-Entscheidung: n8n + Next.js

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Web-App                   │
│  - Admin Dashboard (Einstellungen, Übersicht)       │
│  - City Tax Konfiguration                           │
│  - Gäste-Rechnungsformular (public)                 │
│  - Dokument-Freigabe-Interface                      │
└─────────────────────┬───────────────────────────────┘
                      │ API Routes
┌─────────────────────▼───────────────────────────────┐
│                    Supabase                         │
│  - Objekt-Einstellungen                             │
│  - City Tax Regeln                                  │
│  - Rechnungs-Status                                 │
│  - Gäste-Formulardaten                              │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│                   n8n (self-hosted)                 │
│  - Workflow: Neue Buchung → Rechnung erstellen      │
│  - Workflow: Timing-Regeln einhalten                │
│  - Workflow: Belege hochladen                       │
│  - Erweiterbar für neue Plattformen                 │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
    ┌──────▼──────┐           ┌───────▼───────┐
    │   Smoobu    │           │Lexware Office │
    │     API     │           │     API       │
    └─────────────┘           └───────────────┘
```
