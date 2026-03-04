import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decrypt } from "@/lib/encryption"
import { logger } from "@/lib/logger"

const createSchema = z.object({
  bookingId: z.string().uuid(),
})

// POST /api/invoice-requests
// Creates (or regenerates) a guest billing form link for a booking.
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungueltige Daten" }, { status: 400 })
    }

    const { bookingId } = parsed.data

    // Verify booking exists and is confirmed
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, checkout_date, booking_status, smoobu_booking_id")
      .eq("id", bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Buchung nicht gefunden" }, { status: 404 })
    }

    if (booking.booking_status === "cancelled") {
      return NextResponse.json(
        { error: "Stornierte Buchungen koennen keinen Formular-Link erhalten" },
        { status: 400 }
      )
    }

    // Expires: checkout_date + 3 months
    const expiresAt = new Date(booking.checkout_date + "T23:59:59Z")
    expiresAt.setMonth(expiresAt.getMonth() + 3)

    // Generate a new secure token (two UUIDs concatenated = 256 bits entropy)
    const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`

    // Upsert: if link exists, regenerate token and reset status
    const { data: existing } = await supabase
      .from("invoice_requests")
      .select("id, status")
      .eq("booking_id", bookingId)
      .limit(1)
      .single()

    const now = new Date().toISOString()

    if (existing) {
      // Don't regenerate if invoice already created
      if (existing.status === "invoice_created") {
        return NextResponse.json(
          { error: "Rechnung wurde bereits erstellt — Link kann nicht neu generiert werden" },
          { status: 409 }
        )
      }

      await supabase
        .from("invoice_requests")
        .update({
          token,
          status: "pending",
          expires_at: expiresAt.toISOString(),
          submitted_at: null,
          first_name: null,
          last_name: null,
          company_name: null,
          street: null,
          zip: null,
          city: null,
          country_code: "DE",
          vat_id: null,
          email: null,
          updated_at: now,
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("invoice_requests").insert({
        token,
        booking_id: bookingId,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
    }

    // Try to set Smoobu custom placeholder [linkRechnungsdatenAnpassen]
    // This allows the link to be used in Smoobu message templates automatically.
    // Failures here are non-critical — link still works without it.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const formUrl = `${appUrl}/invoice-form/${token}`

    try {
      const { data: smoobuIntegration } = await supabase
        .from("integration_settings")
        .select("api_key_encrypted")
        .eq("platform", "smoobu")
        .limit(1)
        .single()

      if (smoobuIntegration && booking.smoobu_booking_id) {
        const smoobuApiKey = decrypt(smoobuIntegration.api_key_encrypted)
        const smoobuBookingId = Number(booking.smoobu_booking_id)

        const phRes = await fetch("https://login.smoobu.com/api/custom-placeholders", {
          method: "POST",
          headers: {
            "Api-Key": smoobuApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: "linkRechnungsdatenAnpassen",
            defaultValue: formUrl,
            type: 1,
            foreignId: smoobuBookingId,
          }),
          signal: AbortSignal.timeout(10000),
        })

        if (phRes.ok) {
          await logger.info("booking", "smoobu_placeholder_set", "Smoobu Platzhalter [linkRechnungsdatenAnpassen] gesetzt", {
            entityType: "booking", entityId: bookingId,
            details: { smoobuBookingId, formUrl },
          })
        } else {
          const txt = await phRes.text().catch(() => "")
          await logger.warn("booking", "smoobu_placeholder_failed", `Smoobu Platzhalter konnte nicht gesetzt werden (HTTP ${phRes.status})`, {
            entityType: "booking", entityId: bookingId,
            details: { status: phRes.status, response: txt.slice(0, 200) },
          })
        }
      }
    } catch (phErr) {
      // Non-critical — just log
      await logger.warn("booking", "smoobu_placeholder_failed", `Smoobu Platzhalter Fehler: ${phErr instanceof Error ? phErr.message : "Unbekannt"}`, {
        entityType: "booking", entityId: bookingId,
      })
    }

    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      formUrl,
    })
  } catch (err) {
    console.error("POST /api/invoice-requests error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
