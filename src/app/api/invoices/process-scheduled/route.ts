import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/encryption"
import { buildLexwarePayload, type CityTaxData, type GuestBillingData } from "@/lib/invoice-utils"

// This endpoint is called by:
//   - Vercel Cron Jobs (automatic, every 15 min after deploy)
//   - n8n (with Authorization: Bearer <CRON_SECRET>)
//   - Manual trigger from the UI (with Authorization: Bearer <CRON_SECRET>)
//
// Auth: If CRON_SECRET env var is set → require Bearer token.
//       If not set (e.g. Vercel Cron without secret) → allow all.
//       Vercel Cron Jobs also send the x-vercel-cron: 1 header which we accept.
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase service role not configured")
  }
  return createClient(url, serviceKey)
}

function isAuthorized(request: Request): boolean {
  // Vercel Cron sends this header — always allow
  if (request.headers.get("x-vercel-cron") === "1") return true

  const cronSecret = process.env.CRON_SECRET
  // If no secret configured → open (useful for Vercel Cron without secret)
  if (!cronSecret) return true

  const authHeader = request.headers.get("Authorization")
  return authHeader === `Bearer ${cronSecret}`
}

async function createLexwareInvoice(
  apiKey: string,
  payload: ReturnType<typeof buildLexwarePayload>
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const res = await fetch("https://api.lexware.io/v1/invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Lexware API Fehler: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  // Lexware Office API returns { id, voucherNumber, ... }
  return {
    invoiceId: data.id ?? data.resourceUri ?? "",
    invoiceNumber: data.voucherNumber ?? data.invoiceNumber ?? "",
  }
}

// Rate limiter: ensures max 2 requests per second to Lexware
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 })
  }

  try {
    const supabase = getServiceSupabase()

    // Fetch Lexware API key
    const { data: integration, error: intError } = await supabase
      .from("integration_settings")
      .select("api_key_encrypted")
      .eq("platform", "lexware")
      .limit(1)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: "Kein Lexware API-Key hinterlegt" },
        { status: 400 }
      )
    }
    const lexwareApiKey = decrypt(integration.api_key_encrypted)

    // Fetch all invoices that are due (status='ready', scheduled_for <= now)
    const now = new Date().toISOString()
    const { data: dueInvoices, error: fetchError } = await supabase
      .from("invoices")
      .select(
        `
        id,
        booking_id,
        guest_billing_data,
        bookings (
          id,
          smoobu_booking_id,
          guest_name,
          guest_email,
          guest_address,
          checkin_date,
          checkout_date,
          total_amount,
          num_guests,
          booking_status,
          property_id,
          properties ( name, display_name )
        )
      `
      )
      .eq("status", "ready")
      .lte("scheduled_for", now)
      .limit(50) // Process max 50 per run to stay within rate limits

    if (fetchError) throw fetchError

    const results = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0,
    }

    for (const invoice of dueInvoices ?? []) {
      const booking = Array.isArray(invoice.bookings)
        ? invoice.bookings[0]
        : invoice.bookings

      if (!booking) {
        results.skipped++
        continue
      }

      // Skip cancelled bookings
      if ((booking as { booking_status: string }).booking_status === "cancelled") {
        await supabase
          .from("invoices")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", invoice.id)
        results.skipped++
        continue
      }

      // Skip zero-amount bookings
      const totalAmount = Number((booking as { total_amount: number }).total_amount)
      if (totalAmount === 0) {
        await supabase
          .from("invoices")
          .update({
            status: "skipped",
            error_message: "Buchungsbetrag ist 0",
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id)
        results.skipped++
        continue
      }

      // Mark as "creating" to prevent duplicate processing
      await supabase
        .from("invoices")
        .update({ status: "creating", updated_at: new Date().toISOString() })
        .eq("id", invoice.id)

      try {
        const bk = booking as {
          smoobu_booking_id: string
          guest_name: string
          guest_address: Record<string, string> | null
          checkin_date: string
          checkout_date: string
          total_amount: number
          num_guests: number
          property_id: string
          properties: { name: string; display_name?: string | null } | { name: string; display_name?: string | null }[] | null
        }

        const property = Array.isArray(bk.properties)
          ? bk.properties[0]
          : bk.properties
        const propertyName =
          property?.display_name || property?.name || "Ferienwohnung"

        // Look up active city tax config for this property
        const { data: cityTaxConfig } = await supabase
          .from("city_tax_configs")
          .select("is_active, amount_per_person_night, tax_label")
          .eq("property_id", bk.property_id)
          .eq("is_active", true)
          .lte("valid_from", bk.checkin_date)
          .order("valid_from", { ascending: false })
          .limit(1)
          .single()

        const cityTax: CityTaxData | null = cityTaxConfig
          ? {
              isActive: cityTaxConfig.is_active,
              amountPerPersonNight: Number(cityTaxConfig.amount_per_person_night),
              taxLabel: cityTaxConfig.tax_label,
            }
          : null

        const guestBillingData = invoice.guest_billing_data as GuestBillingData | null

        const payload = buildLexwarePayload({
          guestName: bk.guest_name,
          guestAddress: bk.guest_address,
          propertyName,
          smoobuBookingId: bk.smoobu_booking_id,
          checkinDate: bk.checkin_date,
          checkoutDate: bk.checkout_date,
          totalAmount: Number(bk.total_amount),
          numGuests: bk.num_guests,
          cityTax,
          guestBillingData,
        })

        const { invoiceId, invoiceNumber } = await createLexwareInvoice(
          lexwareApiKey,
          payload
        )

        await supabase
          .from("invoices")
          .update({
            status: "created",
            lexware_invoice_id: invoiceId,
            lexware_invoice_number: invoiceNumber,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id)

        results.created++

        // Rate limiting: max 2 req/s → wait 600ms between calls
        await sleep(600)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler"
        console.error(`Invoice ${invoice.id} creation failed:`, errorMsg)

        await supabase
          .from("invoices")
          .update({
            status: "error",
            error_message: errorMsg,
            retry_count: (invoice as unknown as { retry_count?: number }).retry_count ?? 0 + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id)

        results.errors++

        // Still wait between calls even on error
        await sleep(600)
      }

      results.processed++
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error("POST /api/invoices/process-scheduled error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
