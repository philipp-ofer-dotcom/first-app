import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  companyName: z.string().optional(),
  street: z.string().min(1).optional(),
  zip: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  countryCode: z.string().length(2).optional(),
  vatId: z.string().optional(),
  email: z.string().email().optional(),
})

// PUT /api/invoice-requests/[bookingId]
// Admin can edit billing data at any point (storno handled separately).
export async function PUT(
  request: Request,
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

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data: req, error: fetchError } = await supabase
      .from("invoice_requests")
      .select("id, status, first_name, last_name")
      .eq("booking_id", bookingId)
      .single()

    if (fetchError || !req) {
      return NextResponse.json({ error: "Kein Formular-Link fuer diese Buchung" }, { status: 404 })
    }

    const d = parsed.data
    const now = new Date().toISOString()

    await supabase
      .from("invoice_requests")
      .update({
        ...(d.firstName !== undefined && { first_name: d.firstName }),
        ...(d.lastName !== undefined && { last_name: d.lastName }),
        ...(d.companyName !== undefined && { company_name: d.companyName }),
        ...(d.street !== undefined && { street: d.street }),
        ...(d.zip !== undefined && { zip: d.zip }),
        ...(d.city !== undefined && { city: d.city }),
        ...(d.countryCode !== undefined && { country_code: d.countryCode }),
        ...(d.vatId !== undefined && { vat_id: d.vatId }),
        ...(d.email !== undefined && { email: d.email }),
        updated_at: now,
      })
      .eq("id", req.id)

    // Sync billing data to invoice record so process-scheduled uses it
    const firstName = d.firstName ?? req.first_name ?? ""
    const lastName = d.lastName ?? req.last_name ?? ""
    const billingData = {
      name: `${firstName} ${lastName}`.trim(),
      companyName: d.companyName ?? undefined,
      street: d.street ?? undefined,
      zip: d.zip ?? undefined,
      city: d.city ?? undefined,
      countryCode: d.countryCode ?? undefined,
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("booking_id", bookingId)
      .limit(1)
      .single()

    // Only update guest_billing_data if invoice hasn't been sent to Lexware yet
    if (invoice && invoice.status !== "created") {
      await supabase
        .from("invoices")
        .update({ guest_billing_data: billingData, updated_at: now })
        .eq("id", invoice.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PUT /api/invoice-requests/[bookingId] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
