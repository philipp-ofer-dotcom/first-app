import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

// Public endpoint — uses service role to bypass RLS, token is the auth mechanism
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Cancel an existing Lexware invoice (creates a Storno on their side)
async function cancelLexwareInvoice(apiKey: string, lexwareInvoiceId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.lexware.io/v1/invoices/${lexwareInvoiceId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

const submitSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  companyName: z.string().optional().default(""),
  street: z.string().min(1, "Strasse ist erforderlich"),
  zip: z.string().min(3, "PLZ ist erforderlich"),
  city: z.string().min(1, "Ort ist erforderlich"),
  countryCode: z.string().length(2).default("DE"),
  vatId: z.string().optional().default(""),
  email: z.string().email("Gueltige E-Mail-Adresse erforderlich"),
})

// GET /api/invoice-form/[token]
// Returns booking info + current form data for the public form. Marks as "opened".
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < 10) {
      return NextResponse.json({ error: "Ungueltiger Token" }, { status: 400 })
    }

    const supabase = getServiceSupabase()

    const { data: req, error } = await supabase
      .from("invoice_requests")
      .select(
        `
        id, token, status, expires_at,
        first_name, last_name, company_name, street, zip, city, country_code, vat_id, email,
        submitted_at,
        bookings (
          id, smoobu_booking_id, guest_name, checkin_date, checkout_date,
          total_amount, num_guests,
          properties ( name, display_name )
        )
      `
      )
      .eq("token", token)
      .single()

    if (error || !req) {
      return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 })
    }

    // Check expiry
    if (new Date(req.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link abgelaufen" }, { status: 410 })
    }

    // Mark as opened (if still pending)
    if (req.status === "pending") {
      await supabase
        .from("invoice_requests")
        .update({ status: "opened", updated_at: new Date().toISOString() })
        .eq("id", req.id)
    }

    const booking = Array.isArray(req.bookings) ? req.bookings[0] : req.bookings
    const property = booking
      ? Array.isArray(
          (booking as { properties?: unknown }).properties
        )
        ? ((booking as { properties?: unknown[] }).properties?.[0] as { name?: string; display_name?: string | null } | undefined)
        : ((booking as { properties?: { name?: string; display_name?: string | null } | null }).properties)
      : null

    return NextResponse.json({
      status: req.status,
      expiresAt: req.expires_at,
      submittedAt: req.submitted_at,
      booking: booking
        ? {
            smoobuBookingId: (booking as { smoobu_booking_id: string }).smoobu_booking_id,
            guestName: (booking as { guest_name: string }).guest_name,
            checkinDate: (booking as { checkin_date: string }).checkin_date,
            checkoutDate: (booking as { checkout_date: string }).checkout_date,
            propertyName:
              (property as { display_name?: string | null; name?: string } | null)?.display_name ||
              (property as { name?: string } | null)?.name ||
              "Ferienwohnung",
          }
        : null,
      // Pre-fill with existing data if guest has already opened the form
      formData:
        req.status !== "pending"
          ? {
              firstName: req.first_name ?? "",
              lastName: req.last_name ?? "",
              companyName: req.company_name ?? "",
              street: req.street ?? "",
              zip: req.zip ?? "",
              city: req.city ?? "",
              countryCode: req.country_code ?? "DE",
              vatId: req.vat_id ?? "",
              email: req.email ?? "",
            }
          : null,
    })
  } catch (err) {
    console.error("GET /api/invoice-form/[token] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

// POST /api/invoice-form/[token]
// Guest submits their billing data.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = getServiceSupabase()

    const { data: req, error } = await supabase
      .from("invoice_requests")
      .select("id, status, expires_at, booking_id")
      .eq("token", token)
      .single()

    if (error || !req) {
      return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 })
    }

    if (new Date(req.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link abgelaufen" }, { status: 410 })
    }

    if (req.status === "submitted" || req.status === "invoice_created") {
      return NextResponse.json(
        { error: "Daten wurden bereits eingereicht" },
        { status: 409 }
      )
    }

    const body = await request.json()
    const parsed = submitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bitte alle Pflichtfelder ausfullen", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const d = parsed.data
    const now = new Date().toISOString()

    // Save billing data to invoice_request
    await supabase
      .from("invoice_requests")
      .update({
        status: "submitted",
        first_name: d.firstName,
        last_name: d.lastName,
        company_name: d.companyName || null,
        street: d.street,
        zip: d.zip,
        city: d.city,
        country_code: d.countryCode,
        vat_id: d.vatId || null,
        email: d.email,
        submitted_at: now,
        updated_at: now,
      })
      .eq("id", req.id)

    // Copy billing data to the invoice record so process-scheduled uses it
    const billingData = {
      name: `${d.firstName} ${d.lastName}`,
      companyName: d.companyName || null,
      street: d.street,
      zip: d.zip,
      city: d.city,
      countryCode: d.countryCode,
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status, lexware_invoice_id, lexware_invoice_number")
      .eq("booking_id", req.booking_id)
      .limit(1)
      .single()

    if (invoice) {
      // If invoice was already created in Lexware, storno it and re-queue
      if (invoice.status === "created" && invoice.lexware_invoice_id) {
        // Get Lexware API key
        const { data: integration } = await supabase
          .from("integration_settings")
          .select("api_key_encrypted")
          .eq("platform", "lexware")
          .limit(1)
          .single()

        if (integration) {
          const { decrypt } = await import("@/lib/encryption")
          const lexwareApiKey = decrypt(integration.api_key_encrypted)
          await cancelLexwareInvoice(lexwareApiKey, invoice.lexware_invoice_id)
        }

        // Reset invoice to 'ready' with new billing data so it gets recreated
        await supabase
          .from("invoices")
          .update({
            status: "ready",
            scheduled_for: now,
            lexware_invoice_id: null,
            lexware_invoice_number: null,
            error_message: `Storniert durch Gast: ${invoice.lexware_invoice_number ?? invoice.lexware_invoice_id}`,
            guest_billing_data: billingData,
            updated_at: now,
          })
          .eq("id", invoice.id)
      } else {
        // Just update the billing data for future invoice creation
        await supabase
          .from("invoices")
          .update({ guest_billing_data: billingData, updated_at: now })
          .eq("id", invoice.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("POST /api/invoice-form/[token] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
