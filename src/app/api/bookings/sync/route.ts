import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decrypt } from "@/lib/encryption"
import { calculateScheduledFor } from "@/lib/invoice-utils"
import type { TimingType, InvoiceMode } from "@/lib/types"
import { logger } from "@/lib/logger"

interface SmoobuPriceElement {
  type: string    // e.g. "base", "cleaning", "cityTax", "discount", "extraPerson", ...
  name: string
  amount: number
  quantity: number
  currencyCode: string
}

interface SmoobuReservation {
  id: number
  arrival: string
  departure: string
  apartment: { id: number; name: string }
  "guest-name": string
  email: string | null
  adults: number
  children: number
  price: number
  "is-blocked-booking"?: boolean
  type: string
  priceElements?: SmoobuPriceElement[]
}

interface SmoobuReservationsResponse {
  page: number
  per_page_count: number
  total_count: number
  pageCount: number
  bookings: SmoobuReservation[]
}

async function fetchSmoobuReservations(
  apiKey: string,
  page = 1,
  perPage = 100
): Promise<SmoobuReservationsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(perPage),
    includePriceElements: "true",  // needed for cleaning fee and city tax breakdown
  })
  const res = await fetch(`https://login.smoobu.com/api/reservations?${params}`, {
    headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`Smoobu API Fehler: HTTP ${res.status}`)
  }
  return res.json()
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    // Get Smoobu API key
    const { data: integration, error: intError } = await supabase
      .from("integration_settings")
      .select("api_key_encrypted")
      .eq("platform", "smoobu")
      .limit(1)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: "Kein Smoobu API-Key hinterlegt" },
        { status: 400 }
      )
    }
    const apiKey = decrypt(integration.api_key_encrypted)

    // Get active properties (keyed by smoobu_id)
    const { data: properties } = await supabase
      .from("properties")
      .select("id, smoobu_id, name")
      .eq("is_active", true)
      .eq("is_archived", false)

    const propertyBySmoobuId = new Map(
      (properties ?? []).map((p) => [String(p.smoobu_id), p])
    )

    // Get timing settings (global fallback)
    const { data: timingSettings } = await supabase
      .from("invoice_timing_settings")
      .select("property_id, timing_type, timing_days, invoice_mode")

    const globalTiming = (timingSettings ?? []).find((s) => !s.property_id)
    const timingByPropertyId = new Map(
      (timingSettings ?? [])
        .filter((s) => s.property_id)
        .map((s) => [s.property_id, s])
    )

    // Fetch all reservations (paginated)
    let page = 1
    let totalPages = 1
    let synced = 0
    let skipped = 0
    const errors: string[] = []

    do {
      const response = await fetchSmoobuReservations(apiKey, page, 100)
      totalPages = response.pageCount

      for (const res of response.bookings ?? []) {
        // Skip blocked dates (owner-blocked, not actual guest bookings)
        if (res["is-blocked-booking"] === true) {
          skipped++
          continue
        }

        // Skip unknown types that are not bookings or their modifications
        const validTypes = ["reservation", "modification", "cancellation"]
        if (!validTypes.includes(res.type)) {
          skipped++
          continue
        }

        const property = propertyBySmoobuId.get(String(res.apartment?.id))
        if (!property) {
          skipped++
          continue
        }

        // Determine booking status from type
        const bookingStatus = res.type === "cancellation" ? "cancelled" : "confirmed"

        // Extract cleaning fee from priceElements if available
        const cleaningFee = res.priceElements
          ? (res.priceElements.find((el) => el.type === "cleaning")?.amount ?? null)
          : null

        // Upsert booking
        const { data: booking, error: upsertError } = await supabase
          .from("bookings")
          .upsert(
            {
              smoobu_booking_id: String(res.id),
              property_id: property.id,
              guest_name: res["guest-name"] || "",
              guest_email: res.email || null,
              checkin_date: res.arrival,
              checkout_date: res.departure,
              total_amount: res.price || 0,
              num_guests: (res.adults || 1) + (res.children || 0),
              booking_status: bookingStatus,
              cleaning_fee: cleaningFee,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "smoobu_booking_id", ignoreDuplicates: false }
          )
          .select("id")
          .single()

        if (upsertError || !booking) {
          errors.push(`Buchung ${res.id}: ${upsertError?.message}`)
          continue
        }

        // Create invoice record if it doesn't exist yet
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("booking_id", booking.id)
          .limit(1)
          .single()

        if (!existingInvoice) {
          const timing =
            timingByPropertyId.get(property.id) ?? globalTiming

          // Skip bookings with zero amount
          if (res.price === 0) {
            await supabase.from("invoices").insert({
              booking_id: booking.id,
              status: "skipped",
              error_message: "Buchungsbetrag ist 0",
            })
            synced++
            continue
          }

          let status: string = "pending"
          let scheduledFor: string | null = null

          if (timing) {
            const scheduledDate = calculateScheduledFor(
              res.arrival,
              res.departure,
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

        synced++
      }

      page++
    } while (page <= totalPages)

    await logger.info("sync", "bookings_synced", `Smoobu Sync abgeschlossen: ${synced} Buchungen importiert, ${skipped} übersprungen`, {
      details: { synced, skipped, errors: errors.length },
    })

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler"
    console.error("POST /api/bookings/sync error:", err)
    await logger.error("sync", "bookings_sync_failed", `Smoobu Sync fehlgeschlagen: ${errorMsg}`, {
      details: { error: errorMsg },
    })
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
