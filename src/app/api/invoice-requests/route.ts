import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

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
      .select("id, checkout_date, booking_status")
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

    // Expires: checkout_date + 7 days
    const expiresAt = new Date(booking.checkout_date + "T23:59:59Z")
    expiresAt.setDate(expiresAt.getDate() + 7)

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

    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    console.error("POST /api/invoice-requests error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
