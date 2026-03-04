# Beleg-Download Scripts

Lokale Scripts fuer automatischen Airbnb-Beleg-Download via Playwright.

## Setup (einmalig)

```bash
cd scripts
npm install
npx playwright install chromium
cp .env.example .env
```

Dann `.env` mit deinen Zugangsdaten befuellen.

## Airbnb Beleg herunterladen

```bash
# Einzelne Buchung
node airbnb-receipt.js --booking HMXXXXXXXXXX

# Mit sichtbarem Browser (zum Debuggen)
node airbnb-receipt.js --booking HMXXXXXXXXXX --headless=false
```

## Was das Script macht

1. Oeffnet Chromium (headless = unsichtbar)
2. Loggt sich in Airbnb ein (speichert Session in `.airbnb-session.json`)
3. Navigiert zur Buchungsdetailseite
4. Findet den Beleg-Link oder druckt die Seite als PDF
5. Schickt das PDF an `APP_URL/api/receipts/webhook`
6. Der Beleg erscheint in der App unter "Belege"

## 2FA (Zwei-Faktor-Authentifizierung)

Falls Airbnb 2FA verlangt, den TOTP Secret aus der Authenticator-App in `.env` eintragen:

```
AIRBNB_TOTP_SECRET=JBSWY3DPEHPK3PXP
```

Den Secret bekommst du, wenn du 2FA in Airbnb einrichtest ("Barcode kann nicht gescannt werden" → zeigt den Text-Secret).

## Session-Persistenz

Nach dem ersten Login wird die Session in `.airbnb-session.json` gespeichert.
Bei naechsten Laeufen wird diese wiederverwendet (kein erneuter Login noetig).
Wird automatisch erneuert wenn abgelaufen.

## Troubleshooting

**Script findet den Beleg-Link nicht:**
- Mit `--headless=false` ausfuehren und die Seite beobachten
- Airbnb aendert regelmaessig ihre Seitenstruktur → ggf. Selektoren in `airbnb-receipt.js` anpassen

**Login schlaegt fehl:**
- `.airbnb-session.json` loeschen (erzwingt neuen Login)
- Passwort in `.env` pruefen
- Mit `--headless=false` manuell einloggen und CAPTCHA loesen

**Webhook-Fehler:**
- `APP_URL` und `WEBHOOK_SECRET` in `.env` pruefen
- App muss erreichbar sein (Vercel URL oder `localhost:3000` bei lokaler Entwicklung)

## Hinweis zu Airbnb ToS

Das automatische Herunterladen von Belegen via Browser-Automatisierung
**verstaesst gegen Airbnbs Nutzungsbedingungen** und kann zur Kontosperrung fuehren.
Nutzung auf eigenes Risiko.
