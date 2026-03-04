import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

// GET /api/documents — combined invoices + receipts overview
// Query params: type (invoice|receipt), platform, status, dateFrom, dateTo, format (csv)
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const typeFilter = searchParams.get("type") // "invoice" | "receipt" | null
    const platform = searchParams.get("platform")
    const status = searchParams.get("status")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const format = searchParams.get("format") // "csv" | null

    // ── Fetch receipts ────────────────────────────────────────────────────────
    const receipts: DocumentRow[] = []
    if (!typeFilter || typeFilter === "receipt") {
      let q = supabase
        .from("receipts")
        .select(
          `id, platform, booking_reference, booking_id, status,
           file_name, receipt_date, amount, error_message, notes,
           transferred_at, lexware_document_id, created_at,
           bookings ( guest_name, checkin_date, checkout_date,
             properties ( name, display_name ) )`
        )
        .order("created_at", { ascending: false })
        .limit(500)

      if (platform) q = q.eq("platform", platform)
      if (status) q = q.eq("status", status)
      if (dateFrom) q = q.gte("receipt_date", dateFrom)
      if (dateTo) q = q.lte("receipt_date", dateTo)

      const { data, error } = await q
      if (error) throw error

      for (const row of data ?? []) {
        const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
        const property = booking
          ? Array.isArray((booking as { properties?: unknown }).properties)
            ? ((booking as { properties?: unknown[] }).properties?.[0] as { name?: string; display_name?: string | null } | undefined)
            : ((booking as { properties?: { name?: string; display_name?: string | null } | null }).properties)
          : null

        receipts.push({
          id: row.id,
          type: "receipt",
          platform: row.platform,
          bookingReference: row.booking_reference,
          bookingId: row.booking_id,
          guestName: (booking as { guest_name?: string } | null)?.guest_name ?? null,
          propertyName: property?.display_name ?? property?.name ?? null,
          date: row.receipt_date,
          amount: row.amount !== null ? Number(row.amount) : null,
          status: row.status,
          errorMessage: row.error_message,
          notes: row.notes,
          lexwareId: row.lexware_document_id,
          lexwareNumber: null,
          transferredAt: row.transferred_at,
          createdAt: row.created_at,
          fileName: row.file_name,
        })
      }
    }

    // ── Fetch invoices ────────────────────────────────────────────────────────
    const invoices: DocumentRow[] = []
    if (!typeFilter || typeFilter === "invoice") {
      let q = supabase
        .from("invoices")
        .select(
          `id, status, lexware_invoice_id, lexware_invoice_number,
           error_message, created_at,
           bookings ( id, smoobu_booking_id, guest_name, checkin_date, checkout_date,
             total_amount, properties ( name, display_name ) )`
        )
        .order("created_at", { ascending: false })
        .limit(500)

      if (status) q = q.eq("status", status)
      if (dateFrom) q = q.gte("created_at", dateFrom)
      if (dateTo) q = q.lte("created_at", dateTo)

      const { data, error } = await q
      if (error) throw error

      for (const row of data ?? []) {
        const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
        const property = booking
          ? Array.isArray((booking as { properties?: unknown }).properties)
            ? ((booking as { properties?: unknown[] }).properties?.[0] as { name?: string; display_name?: string | null } | undefined)
            : ((booking as { properties?: { name?: string; display_name?: string | null } | null }).properties)
          : null

        invoices.push({
          id: row.id,
          type: "invoice",
          platform: "smoobu",
          bookingReference: (booking as { smoobu_booking_id?: string } | null)?.smoobu_booking_id ?? null,
          bookingId: (booking as { id?: string } | null)?.id ?? null,
          guestName: (booking as { guest_name?: string } | null)?.guest_name ?? null,
          propertyName: property?.display_name ?? property?.name ?? null,
          date: (booking as { checkin_date?: string } | null)?.checkin_date ?? null,
          amount: (booking as { total_amount?: unknown } | null)?.total_amount !== undefined
            ? Number((booking as { total_amount: unknown }).total_amount)
            : null,
          status: row.status,
          errorMessage: row.error_message,
          notes: null,
          lexwareId: row.lexware_invoice_id,
          lexwareNumber: row.lexware_invoice_number,
          transferredAt: null,
          createdAt: row.created_at,
          fileName: null,
        })
      }
    }

    // ── Combine and sort ──────────────────────────────────────────────────────
    const all = [...receipts, ...invoices].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // ── CSV export ────────────────────────────────────────────────────────────
    if (format === "csv") {
      const rows = [
        [
          "Typ", "Datum", "Plattform", "Buchungsreferenz", "Gastname",
          "Objekt", "Betrag", "Status", "Lexware-ID", "Erstellt am",
        ],
        ...all.map((d) => [
          d.type === "invoice" ? "Rechnung" : "Beleg",
          d.date ?? "",
          d.platform ?? "",
          d.bookingReference ?? "",
          d.guestName ?? "",
          d.propertyName ?? "",
          d.amount !== null ? d.amount.toFixed(2) : "",
          d.status,
          d.lexwareId ?? d.lexwareNumber ?? "",
          d.createdAt.split("T")[0],
        ]),
      ]

      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n")

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dokumente-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      })
    }

    return NextResponse.json({ documents: all, total: all.length })
  } catch (err) {
    console.error("GET /api/documents error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

export interface DocumentRow {
  id: string
  type: "invoice" | "receipt"
  platform: string | null
  bookingReference: string | null
  bookingId: string | null
  guestName: string | null
  propertyName: string | null
  date: string | null
  amount: number | null
  status: string
  errorMessage: string | null
  notes: string | null
  lexwareId: string | null
  lexwareNumber: string | null
  transferredAt: string | null
  createdAt: string
  fileName: string | null
}
