import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

// Retry: reset status to 'ready' so process-scheduled picks it up,
// or trigger immediate creation if within rate limit.
// For simplicity, we reset to 'ready' and let n8n handle it.
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

    // Find the invoice for this booking
    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("id, status, retry_count")
      .eq("booking_id", bookingId)
      .limit(1)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json(
        { error: "Keine Rechnung fuer diese Buchung gefunden" },
        { status: 404 }
      )
    }

    if (invoice.status === "created") {
      return NextResponse.json(
        { error: "Rechnung wurde bereits erfolgreich erstellt" },
        { status: 409 }
      )
    }

    if (invoice.status === "creating") {
      return NextResponse.json(
        { error: "Rechnung wird gerade erstellt — bitte warten" },
        { status: 409 }
      )
    }

    // Reset to 'ready' so the next cron run picks it up
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "ready",
        scheduled_for: new Date().toISOString(), // Due immediately
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, message: "Rechnung wird beim naechsten Lauf erneut versucht" })
  } catch (err) {
    console.error("POST /api/invoices/[bookingId]/retry error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
