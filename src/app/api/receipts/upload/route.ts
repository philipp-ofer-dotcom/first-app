import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/receipts/upload
// Accepts multipart/form-data: file, platform, bookingReference, bookingId, receiptDate, amount, notes
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const platform = (formData.get("platform") as string) || "manual"
    const bookingReference = (formData.get("bookingReference") as string) || null
    const bookingId = (formData.get("bookingId") as string) || null
    const receiptDate = (formData.get("receiptDate") as string) || null
    const amount = formData.get("amount") ? Number(formData.get("amount")) : null
    const notes = (formData.get("notes") as string) || null

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 })
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Datei zu groß (max. 20 MB)" }, { status: 400 })
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Dateityp nicht erlaubt (nur PDF, JPEG, PNG)" }, { status: 400 })
    }

    // Create receipt record first to get the ID for the file path
    const { data: receipt, error: insertError } = await supabase
      .from("receipts")
      .insert({
        platform,
        booking_reference: bookingReference,
        booking_id: bookingId || null,
        status: "downloaded",
        file_name: file.name,
        file_size_bytes: file.size,
        receipt_date: receiptDate || null,
        amount: amount || null,
        notes: notes || null,
      })
      .select("id")
      .single()

    if (insertError || !receipt) throw insertError

    // Upload file to Supabase Storage
    const serviceSupabase = getServiceSupabase()
    const ext = file.name.split(".").pop() ?? "pdf"
    const filePath = `${platform}/${new Date().getFullYear()}/${receipt.id}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await serviceSupabase.storage
      .from("receipts")
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      // Clean up receipt record on upload failure
      await supabase.from("receipts").delete().eq("id", receipt.id)
      throw uploadError
    }

    // Update receipt with file path
    await supabase
      .from("receipts")
      .update({ file_path: filePath, updated_at: new Date().toISOString() })
      .eq("id", receipt.id)

    return NextResponse.json({ success: true, id: receipt.id })
  } catch (err) {
    console.error("POST /api/receipts/upload error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
