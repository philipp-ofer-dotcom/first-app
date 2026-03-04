#!/usr/bin/env node
/**
 * Airbnb Receipt Downloader
 * ─────────────────────────
 * Logs into Airbnb, downloads the receipt PDF for a booking,
 * and sends it to the app's webhook endpoint.
 *
 * Usage:
 *   node scripts/airbnb-receipt.js --booking HMXXXXXXXXXX
 *   node scripts/airbnb-receipt.js --booking HMXXXXXXXXXX --headless false
 *
 * Setup:
 *   cd scripts
 *   npm install
 *   npx playwright install chromium
 *   cp .env.example .env   # fill in your credentials
 *
 * ⚠️  IMPORTANT: This script uses browser automation which violates
 * Airbnb's Terms of Service. Use at your own risk.
 */

import { chromium } from "playwright"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"
import * as OTPAuth from "otpauth"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, ".env") })

// ── Config ──────────────────────────────────────────────────────────────────

const {
  AIRBNB_EMAIL,
  AIRBNB_PASSWORD,
  AIRBNB_TOTP_SECRET,
  APP_URL = "http://localhost:3000",
  WEBHOOK_SECRET,
  SESSION_FILE = resolve(__dirname, ".airbnb-session.json"),
} = process.env

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=")
      return [k, v ?? "true"]
    })
)

const bookingRef = args.booking
const headless = args.headless !== "false"

if (!bookingRef) {
  console.error("❌  Bitte eine Buchungsreferenz angeben: --booking HMXXXXXXXXXX")
  process.exit(1)
}

if (!AIRBNB_EMAIL || !AIRBNB_PASSWORD) {
  console.error("❌  AIRBNB_EMAIL und AIRBNB_PASSWORD muessen in scripts/.env gesetzt sein.")
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTOTPCode() {
  if (!AIRBNB_TOTP_SECRET) return null
  const totp = new OTPAuth.TOTP({ secret: AIRBNB_TOTP_SECRET, digits: 6, period: 30 })
  return totp.generate()
}

function loadSession() {
  if (existsSync(SESSION_FILE)) {
    try {
      return JSON.parse(readFileSync(SESSION_FILE, "utf-8"))
    } catch {}
  }
  return null
}

function saveSession(cookies) {
  writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2))
}

async function sendToWebhook(pdfBuffer, fileName, bookingReference) {
  const webhookUrl = `${APP_URL}/api/receipts/webhook`
  const pdfBase64 = pdfBuffer.toString("base64")

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(WEBHOOK_SECRET ? { Authorization: `Bearer ${WEBHOOK_SECRET}` } : {}),
    },
    body: JSON.stringify({
      platform: "airbnb",
      bookingReference,
      pdfBase64,
      fileName,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Webhook fehlgeschlagen: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  const json = await res.json()
  return json.id
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📋  Lade Beleg fuer Airbnb-Buchung: ${bookingRef}`)

  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 50 })
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "de-DE",
  })

  // Restore saved session (cookies) to skip login if possible
  const savedCookies = loadSession()
  if (savedCookies) {
    await context.addCookies(savedCookies)
    console.log("🍪  Gespeicherte Session geladen.")
  }

  const page = await context.newPage()

  try {
    // ── Step 1: Check if we're still logged in ──────────────────────────────
    await page.goto("https://www.airbnb.de/account-settings/personal-info", {
      waitUntil: "networkidle",
      timeout: 30000,
    })

    const isLoggedIn = await page
      .locator('[data-testid="header-profile-menu"]')
      .isVisible()
      .catch(() => false)

    if (!isLoggedIn) {
      console.log("🔐  Nicht eingeloggt — starte Login...")

      // Navigate to login
      await page.goto("https://www.airbnb.de/login", { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2000)

      // Click "Continue with email"
      const emailBtn = page.locator('button:has-text("E-Mail"), button:has-text("email"), [data-testid="email-login-link"]')
      if (await emailBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailBtn.first().click()
        await page.waitForTimeout(1000)
      }

      // Enter email
      const emailInput = page.locator('input[type="email"], input[name="email"]')
      await emailInput.first().fill(AIRBNB_EMAIL)
      await page.keyboard.press("Enter")
      await page.waitForTimeout(2000)

      // Enter password
      const passwordInput = page.locator('input[type="password"], input[name="password"]')
      await passwordInput.first().fill(AIRBNB_PASSWORD)
      await page.keyboard.press("Enter")
      await page.waitForTimeout(3000)

      // Handle 2FA if needed
      const tfaInput = page.locator('input[name="token"], input[placeholder*="Code"], input[placeholder*="code"]')
      if (await tfaInput.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const code = getTOTPCode()
        if (code) {
          console.log("🔑  2FA Code eingeben...")
          await tfaInput.first().fill(code)
          await page.keyboard.press("Enter")
          await page.waitForTimeout(3000)
        } else {
          console.error("❌  2FA erforderlich aber kein TOTP-Secret konfiguriert.")
          console.error("    Setze AIRBNB_TOTP_SECRET in scripts/.env")
          await browser.close()
          process.exit(1)
        }
      }

      // Save session for next run
      const cookies = await context.cookies()
      saveSession(cookies)
      console.log("✅  Login erfolgreich, Session gespeichert.")
    } else {
      console.log("✅  Bereits eingeloggt.")
    }

    // ── Step 2: Find the booking and its receipt ────────────────────────────
    console.log(`🔍  Suche Buchung ${bookingRef}...`)

    // Navigate to reservations page
    await page.goto(
      `https://www.airbnb.de/hosting/reservations/all?confirmationCode=${bookingRef}`,
      { waitUntil: "networkidle", timeout: 30000 }
    )
    await page.waitForTimeout(2000)

    // Look for the booking link
    const bookingLink = page.locator(`a[href*="${bookingRef}"]`).first()
    if (await bookingLink.isVisible({ timeout: 10000 }).catch(() => false)) {
      await bookingLink.click()
      await page.waitForTimeout(2000)
    } else {
      // Try direct URL
      await page.goto(
        `https://www.airbnb.de/hosting/reservations/details/${bookingRef}`,
        { waitUntil: "networkidle", timeout: 30000 }
      )
      await page.waitForTimeout(2000)
    }

    // ── Step 3: Find and click the receipt/invoice link ─────────────────────
    // Look for "Beleg", "Quittung", "Receipt", "Invoice" link
    const receiptSelectors = [
      'a:has-text("Beleg")',
      'a:has-text("Quittung")',
      'a:has-text("Receipt")',
      'a:has-text("Invoice")',
      'a:has-text("Zahlungsbeleg")',
      '[data-testid*="receipt"]',
      '[data-testid*="invoice"]',
    ]

    let receiptUrl = null
    for (const selector of receiptSelectors) {
      const link = page.locator(selector).first()
      if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
        receiptUrl = await link.getAttribute("href")
        console.log(`📄  Beleg-Link gefunden: ${selector}`)
        break
      }
    }

    let pdfBuffer

    if (receiptUrl) {
      // Navigate to receipt page and print to PDF
      const fullUrl = receiptUrl.startsWith("http")
        ? receiptUrl
        : `https://www.airbnb.de${receiptUrl}`
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 30000 })
      await page.waitForTimeout(2000)

      // Print current page as PDF
      pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      })
      console.log(`📥  PDF erstellt (${Math.round(pdfBuffer.length / 1024)} KB)`)
    } else {
      // Fallback: print the entire current reservation page as PDF
      console.log("⚠️   Kein direkter Beleg-Link gefunden — drucke aktuelle Seite als PDF.")
      pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      })
      console.log(`📥  Seiten-PDF erstellt (${Math.round(pdfBuffer.length / 1024)} KB)`)
    }

    // ── Step 4: Send to webhook ─────────────────────────────────────────────
    const fileName = `airbnb-${bookingRef}-${new Date().toISOString().split("T")[0]}.pdf`
    console.log(`📤  Sende an ${APP_URL}/api/receipts/webhook ...`)

    const receiptId = await sendToWebhook(pdfBuffer, fileName, bookingRef)
    console.log(`✅  Beleg gespeichert! ID: ${receiptId}`)

    // Update session cookies
    const updatedCookies = await context.cookies()
    saveSession(updatedCookies)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("❌  Fehler:", err.message)
  process.exit(1)
})
