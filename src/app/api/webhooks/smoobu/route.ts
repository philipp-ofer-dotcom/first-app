import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calculateScheduledFor } from "@/lib/invoice-utils"
import type { TimingType, InvoiceMode } from "@/lib/types"

// This endpoint is public (called by Smoobu) — uses service role for DB writes
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase service role not configured")
  }
  return createClient(url, serviceKey)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Smoobu sends different action types; we only handle new/updated reservations
    const action: string = body?.action ?? ""
    if (!["newReservation", "modifiedReservation"].includes(action)) {
      return NextResponse.json({ received: true })
    }

    const data = body?.data
    if (!data?.id) {
      return NextResponse.json({ error: "Ungueltige Webhook-Daten" }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    // Find the property by Smoobu apartment ID
    const apartmentId = data.apartmentId ?? data.apartment?.id
    if (!apartmentId) {
      return NextResponse.json({ received: true, skipped: "no apartmentId" })
    }

    const { data: property } = await supabase
      .from("properties")
      .select("id, name")
      .eq("smoobu_id", String(apartmentId))
      .eq("is_active", true)
      .limit(1)
      .single()

    if (!property) {
      // Property not tracked in our system
      return NextResponse.json({ received: true, skipped: "property not found" })
    }

    const numGuests = (data.adults || 1) + (data.children || 0)
    const price = data.price || 0

    // Upsert booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .upsert(
        {
          smoobu_booking_id: String(data.id),
          property_id: property.id,
          guest_name: data["guest-name"] || "",
          guest_email: data.email || null,
          checkin_date: data.arrival,
          checkout_date: data.departure,
          total_amount: price,
          num_guests: numGuests,
          booking_status: "confirmed",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "smoobu_booking_id", ignoreDuplicates: false }
      )
      .select("id")
      .single()

    if (bookingError || !booking) {
      console.error("Webhook: booking upsert failed", bookingError)
      return NextResponse.json({ error: "DB Fehler" }, { status: 500 })
    }

    // Create invoice if not yet exists
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("booking_id", booking.id)
      .limit(1)
      .single()

    if (!existing) {
      if (price === 0) {
        await supabase.from("invoices").insert({
          booking_id: booking.id,
          status: "skipped",
          error_message: "Buchungsbetrag ist 0",
        })
      } else {
        const { data: timingSettings } = await supabase
          .from("invoice_timing_settings")
          .select("property_id, timing_type, timing_days, invoice_mode")

        const globalTiming = (timingSettings ?? []).find((s) => !s.property_id)
        const propertyTiming = (timingSettings ?? []).find(
          (s) => s.property_id === property.id
        )
        const timing = propertyTiming ?? globalTiming

        let status = "pending"
        let scheduledFor: string | null = null

        if (timing) {
          const scheduledDate = calculateScheduledFor(
            data.arrival,
            data.departure,
            timing.timing_type as TimingType,
            timing.timing_days
          )
          scheduledFor = scheduledDate.toISOString()
          status =
            (timing.invoice_mode as InvoiceMode) === "automatic"
              ? "ready"
              : "pending"
        }

        await supabase.from("invoices").insert({
          booking_id: booking.id,
          status,
          scheduled_for: scheduledFor,
        })
      }
    }

    return NextResponse.json({ received: true, bookingId: booking.id })
  } catch (err) {
    console.error("POST /api/webhooks/smoobu error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
