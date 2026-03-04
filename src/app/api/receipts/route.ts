import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

// GET /api/receipts — list all receipts (with optional filters)
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const platform = searchParams.get("platform")
    const status = searchParams.get("status")

    let query = supabase
      .from("receipts")
      .select(`
        id, platform, booking_reference, booking_id, status,
        file_name, file_size_bytes, receipt_date, amount,
        error_message, notes, transferred_at, lexware_document_id,
        created_at, updated_at,
        bookings ( smoobu_booking_id, guest_name, checkin_date, checkout_date,
          properties ( name, display_name ) )
      `)
      .order("created_at", { ascending: false })
      .limit(500)

    if (platform) query = query.eq("platform", platform)
    if (status) query = query.eq("status", status)

    const { data, error } = await query
    if (error) throw error

    const receipts = (data ?? []).map((row) => {
      const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
      const property = booking
        ? Array.isArray((booking as { properties?: unknown }).properties)
          ? ((booking as { properties?: unknown[] }).properties?.[0] as { name?: string; display_name?: string | null } | undefined)
          : ((booking as { properties?: { name?: string; display_name?: string | null } | null }).properties)
        : null

      return {
        id: row.id,
        platform: row.platform,
        bookingReference: row.booking_reference,
        bookingId: row.booking_id,
        status: row.status,
        fileName: row.file_name,
        fileSizeBytes: row.file_size_bytes,
        receiptDate: row.receipt_date,
        amount: row.amount ? Number(row.amount) : null,
        errorMessage: row.error_message,
        notes: row.notes,
        transferredAt: row.transferred_at,
        lexwareDocumentId: row.lexware_document_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        booking: booking ? {
          smoobuBookingId: (booking as { smoobu_booking_id: string }).smoobu_booking_id,
          guestName: (booking as { guest_name: string }).guest_name,
          checkinDate: (booking as { checkin_date: string }).checkin_date,
          checkoutDate: (booking as { checkout_date: string }).checkout_date,
          propertyName: property?.display_name || property?.name || "Unbekannt",
        } : null,
      }
    })

    return NextResponse.json({ receipts })
  } catch (err) {
    console.error("GET /api/receipts error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
