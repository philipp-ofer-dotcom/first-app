import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const updateSchema = z.object({
  bookingReference: z.string().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  receiptDate: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["pending", "downloading", "downloaded", "error", "transferred"]).optional(),
})

// PATCH /api/receipts/[id] — update receipt metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungueltige Daten" }, { status: 400 })
    }

    const d = parsed.data
    const { error } = await supabase
      .from("receipts")
      .update({
        ...(d.bookingReference !== undefined && { booking_reference: d.bookingReference }),
        ...(d.bookingId !== undefined && { booking_id: d.bookingId }),
        ...(d.receiptDate !== undefined && { receipt_date: d.receiptDate }),
        ...(d.amount !== undefined && { amount: d.amount }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...(d.status !== undefined && { status: d.status }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PATCH /api/receipts/[id] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

// DELETE /api/receipts/[id] — delete receipt + file
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { data: receipt, error: fetchError } = await supabase
      .from("receipts")
      .select("id, file_path")
      .eq("id", id)
      .single()

    if (fetchError || !receipt) {
      return NextResponse.json({ error: "Beleg nicht gefunden" }, { status: 404 })
    }

    // Delete file from storage first
    if (receipt.file_path) {
      const serviceSupabase = getServiceSupabase()
      await serviceSupabase.storage.from("receipts").remove([receipt.file_path])
    }

    // Delete DB record
    await supabase.from("receipts").delete().eq("id", id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/receipts/[id] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
