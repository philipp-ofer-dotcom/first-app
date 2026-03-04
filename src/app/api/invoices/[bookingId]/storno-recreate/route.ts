import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/encryption"
import type { GuestBillingData } from "@/lib/invoice-utils"

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/invoices/[bookingId]/storno-recreate
// Admin: Cancel the Lexware invoice and re-queue for recreation with current billing data.
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

    // Fetch the invoice
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("id, status, lexware_invoice_id, lexware_invoice_number")
      .eq("booking_id", bookingId)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 })
    }

    if (invoice.status !== "created") {
      return NextResponse.json(
        { error: "Nur erstellte Rechnungen koennen storniert werden" },
        { status: 409 }
      )
    }

    if (!invoice.lexware_invoice_id) {
      return NextResponse.json(
        { error: "Keine Lexware-Rechnungs-ID vorhanden" },
        { status: 409 }
      )
    }

    // Get Lexware API key (service role for integration_settings)
    const serviceSupabase = getServiceSupabase()
    const { data: integration, error: intError } = await serviceSupabase
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

    // Cancel in Lexware (creates a Storno document on their side)
    const cancelRes = await fetch(
      `https://api.lexware.io/v1/invoices/${invoice.lexware_invoice_id}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lexwareApiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      }
    )

    if (!cancelRes.ok) {
      const text = await cancelRes.text().catch(() => "")
      return NextResponse.json(
        { error: `Lexware Storno fehlgeschlagen: HTTP ${cancelRes.status} — ${text.slice(0, 200)}` },
        { status: 502 }
      )
    }

    // Fetch latest billing data from invoice_requests (if any)
    const { data: invoiceReq } = await supabase
      .from("invoice_requests")
      .select("first_name, last_name, company_name, street, zip, city, country_code, vat_id, email")
      .eq("booking_id", bookingId)
      .single()

    const billingData: GuestBillingData | null = invoiceReq
      ? {
          name: `${invoiceReq.first_name ?? ""} ${invoiceReq.last_name ?? ""}`.trim(),
          companyName: invoiceReq.company_name ?? undefined,
          street: invoiceReq.street ?? undefined,
          zip: invoiceReq.zip ?? undefined,
          city: invoiceReq.city ?? undefined,
          countryCode: invoiceReq.country_code ?? undefined,
        }
      : null

    const now = new Date().toISOString()

    // Reset invoice: back to 'ready' so process-scheduled creates a new one
    await supabase
      .from("invoices")
      .update({
        status: "ready",
        scheduled_for: now,
        lexware_invoice_id: null,
        lexware_invoice_number: null,
        error_message: `Storniert: ${invoice.lexware_invoice_number ?? invoice.lexware_invoice_id}`,
        ...(billingData ? { guest_billing_data: billingData } : {}),
        updated_at: now,
      })
      .eq("id", invoice.id)

    // Mark invoice_request as needing new processing
    if (invoiceReq) {
      await supabase
        .from("invoice_requests")
        .update({ status: "submitted", updated_at: now })
        .eq("booking_id", bookingId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("POST /api/invoices/[bookingId]/storno-recreate error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
