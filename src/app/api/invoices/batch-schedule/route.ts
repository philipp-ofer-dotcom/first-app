import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const batchSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  // Only schedule bookings with these statuses (default: pending + error)
  includeStatuses: z
    .array(z.enum(["pending", "error"]))
    .optional()
    .default(["pending", "error"]),
})

// Marks all invoices for bookings in the given checkin date range as "ready"
// (scheduled_for = now) so the next cron run (or immediate trigger) processes them.
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
    const parsed = batchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { fromDate, toDate, includeStatuses } = parsed.data

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: "Von-Datum muss vor dem Bis-Datum liegen" },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    // Find all bookings in the date range that are confirmed and not zero-amount
    const { data: bookings, error: fetchError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        booking_status,
        invoices ( id, status )
      `
      )
      .eq("booking_status", "confirmed")
      .gte("checkin_date", fromDate)
      .lte("checkin_date", toDate)
      .gt("total_amount", 0)

    if (fetchError) throw fetchError

    let scheduled = 0
    let skipped = 0

    for (const booking of bookings ?? []) {
      const invoice = Array.isArray(booking.invoices)
        ? booking.invoices[0]
        : booking.invoices

      const currentStatus = (invoice as { status?: string } | null)?.status

      // Skip already created invoices
      if (currentStatus === "created" || currentStatus === "creating") {
        skipped++
        continue
      }

      // Only process if status matches the requested filter
      if (
        currentStatus &&
        !(includeStatuses as string[]).includes(currentStatus)
      ) {
        skipped++
        continue
      }

      if (invoice && (invoice as { id: string }).id) {
        // Update existing invoice to ready
        await supabase
          .from("invoices")
          .update({
            status: "ready",
            scheduled_for: now,
            error_message: null,
            updated_at: now,
          })
          .eq("id", (invoice as { id: string }).id)
      } else {
        // Create new invoice record (booking exists but no invoice yet)
        await supabase.from("invoices").insert({
          booking_id: booking.id,
          status: "ready",
          scheduled_for: now,
        })
      }

      scheduled++
    }

    return NextResponse.json({ success: true, scheduled, skipped })
  } catch (err) {
    console.error("POST /api/invoices/batch-schedule error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
