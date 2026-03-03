import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decrypt } from "@/lib/encryption"
import { buildLexwarePayload, type CityTaxData, type GuestBillingData } from "@/lib/invoice-utils"

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
  return {
    invoiceId: data.id ?? data.resourceUri ?? "",
    invoiceNumber: data.voucherNumber ?? data.invoiceNumber ?? "",
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    // Fetch booking with property info
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id, smoobu_booking_id, guest_name, guest_address,
        checkin_date, checkout_date, total_amount, num_guests,
        booking_status, property_id,
        properties ( name, display_name )
      `
      )
      .eq("id", bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 })
    }

    if (booking.booking_status === "cancelled") {
      return NextResponse.json(
        { error: "Stornierte Buchungen koennen keine Rechnung erhalten" },
        { status: 400 }
      )
    }

    const totalAmount = Number(booking.total_amount)
    if (totalAmount === 0) {
      return NextResponse.json(
        { error: "Buchungsbetrag ist 0 — Rechnung wird uebersprungen" },
        { status: 400 }
      )
    }

    // Fetch or create invoice record
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, status, guest_billing_data, retry_count")
      .eq("booking_id", bookingId)
      .limit(1)
      .single()

    if (existingInvoice?.status === "created") {
      return NextResponse.json(
        { error: "Fuer diese Buchung wurde bereits eine Rechnung erstellt" },
        { status: 409 }
      )
    }

    // Get Lexware API key
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

    // Mark as creating (duplicate protection)
    if (existingInvoice) {
      await supabase
        .from("invoices")
        .update({ status: "creating", updated_at: new Date().toISOString() })
        .eq("id", existingInvoice.id)
    } else {
      await supabase.from("invoices").insert({
        booking_id: bookingId,
        status: "creating",
      })
    }

    // Re-fetch invoice to get the id
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, guest_billing_data, retry_count")
      .eq("booking_id", bookingId)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: "Invoice record fehlt" }, { status: 500 })
    }

    try {
      const property = Array.isArray(booking.properties)
        ? booking.properties[0]
        : booking.properties
      const propertyName =
        (property as { display_name?: string | null; name?: string } | null)
          ?.display_name ||
        (property as { name?: string } | null)?.name ||
        "Ferienwohnung"

      // City tax lookup
      const { data: cityTaxConfig } = await supabase
        .from("city_tax_configs")
        .select("is_active, amount_per_person_night, tax_label")
        .eq("property_id", booking.property_id)
        .eq("is_active", true)
        .lte("valid_from", booking.checkin_date)
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
        guestName: booking.guest_name,
        guestAddress: booking.guest_address as Record<string, string> | null,
        propertyName,
        smoobuBookingId: booking.smoobu_booking_id,
        checkinDate: booking.checkin_date,
        checkoutDate: booking.checkout_date,
        totalAmount,
        numGuests: booking.num_guests,
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

      return NextResponse.json({
        success: true,
        invoiceId,
        invoiceNumber,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler"

      await supabase
        .from("invoices")
        .update({
          status: "error",
          error_message: errorMsg,
          retry_count: (invoice.retry_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)

      return NextResponse.json({ error: errorMsg }, { status: 502 })
    }
  } catch (err) {
    console.error("POST /api/invoices/[bookingId]/create error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
