import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id,
        smoobu_booking_id,
        property_id,
        guest_name,
        guest_email,
        checkin_date,
        checkout_date,
        total_amount,
        num_guests,
        booking_status,
        synced_at,
        properties ( name, display_name ),
        invoices (
          id,
          status,
          scheduled_for,
          lexware_invoice_id,
          lexware_invoice_number,
          error_message,
          retry_count
        ),
        invoice_requests (
          id,
          token,
          status,
          expires_at,
          submitted_at,
          email
        )
      `
      )
      .order("checkin_date", { ascending: false })
      .limit(500)

    if (error) throw error

    // Shape into BookingWithInvoice format expected by the frontend
    const bookings = (data ?? []).map((row) => {
      const property = Array.isArray(row.properties)
        ? row.properties[0]
        : row.properties
      const invoice = Array.isArray(row.invoices)
        ? row.invoices[0]
        : row.invoices
      const invoiceReq = Array.isArray(
        (row as unknown as { invoice_requests?: unknown }).invoice_requests
      )
        ? ((row as unknown as { invoice_requests: unknown[] }).invoice_requests[0] as { id: string; token: string; status: string; expires_at: string; submitted_at: string | null; email: string | null } | undefined)
        : ((row as unknown as { invoice_requests?: { id: string; token: string; status: string; expires_at: string; submitted_at: string | null; email: string | null } | null }).invoice_requests ?? undefined)

      return {
        id: row.id,
        smoobuBookingId: row.smoobu_booking_id,
        propertyId: row.property_id,
        propertyName:
          (property as { display_name?: string | null; name?: string } | null)
            ?.display_name ||
          (property as { name?: string } | null)?.name ||
          "Unbekanntes Objekt",
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        checkinDate: row.checkin_date,
        checkoutDate: row.checkout_date,
        totalAmount: Number(row.total_amount),
        numGuests: row.num_guests,
        bookingStatus: row.booking_status,
        invoice: invoice
          ? {
              id: (invoice as { id: string }).id,
              bookingId: row.id,
              status: (invoice as { status: string }).status,
              scheduledFor:
                (invoice as { scheduled_for: string | null }).scheduled_for,
              lexwareInvoiceId:
                (invoice as { lexware_invoice_id: string | null })
                  .lexware_invoice_id,
              lexwareInvoiceNumber:
                (invoice as { lexware_invoice_number: string | null })
                  .lexware_invoice_number,
              errorMessage:
                (invoice as { error_message: string | null }).error_message,
              retryCount: (invoice as { retry_count: number }).retry_count,
            }
          : undefined,
        invoiceRequest: invoiceReq
          ? {
              id: invoiceReq.id,
              token: invoiceReq.token,
              bookingId: row.id,
              status: invoiceReq.status,
              expiresAt: invoiceReq.expires_at,
              submittedAt: invoiceReq.submitted_at,
              email: invoiceReq.email,
            }
          : undefined,
      }
    })

    return NextResponse.json({ bookings })
  } catch (err) {
    console.error("GET /api/bookings error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
