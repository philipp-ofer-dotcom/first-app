import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

// Webhook endpoint called by n8n after it downloads a receipt via Playwright.
// Auth: Bearer <CRON_SECRET> or x-webhook-secret header
//
// Payload: { platform, bookingReference, bookingId?, receiptDate?, amount?,
//            pdfBase64, fileName, notes? }

const webhookSchema = z.object({
  platform: z.enum(["airbnb", "booking", "smoobu", "manual"]),
  bookingReference: z.string().optional(),
  bookingId: z.string().uuid().optional(),
  receiptDate: z.string().optional(),
  amount: z.number().optional(),
  pdfBase64: z.string().min(1),
  fileName: z.string().default("receipt.pdf"),
  notes: z.string().optional(),
  // n8n can pass a receiptId to update an existing pending record instead of creating new
  receiptId: z.string().uuid().optional(),
})

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true

  const auth = request.headers.get("Authorization")
  if (auth === `Bearer ${secret}`) return true

  const headerSecret = request.headers.get("x-webhook-secret")
  return headerSecret === secret
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = webhookSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const d = parsed.data
    const supabase = getServiceSupabase()

    // Decode PDF
    let pdfBuffer: Buffer
    try {
      pdfBuffer = Buffer.from(d.pdfBase64, "base64")
    } catch {
      return NextResponse.json({ error: "Ungueltige Base64-Daten" }, { status: 400 })
    }

    if (pdfBuffer.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Datei zu groß (max. 20 MB)" }, { status: 400 })
    }

    // Upsert receipt record
    let receiptId = d.receiptId
    if (!receiptId) {
      const { data: newReceipt, error: insertError } = await supabase
        .from("receipts")
        .insert({
          platform: d.platform,
          booking_reference: d.bookingReference,
          booking_id: d.bookingId ?? null,
          status: "downloading",
          file_name: d.fileName,
          receipt_date: d.receiptDate ?? null,
          amount: d.amount ?? null,
          notes: d.notes ?? null,
        })
        .select("id")
        .single()

      if (insertError || !newReceipt) throw insertError
      receiptId = newReceipt.id
    } else {
      await supabase
        .from("receipts")
        .update({ status: "downloading", updated_at: new Date().toISOString() })
        .eq("id", receiptId)
    }

    // Upload to Supabase Storage
    const ext = d.fileName.split(".").pop() ?? "pdf"
    const filePath = `${d.platform}/${new Date().getFullYear()}/${receiptId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(filePath, pdfBuffer, {
        contentType: ext === "pdf" ? "application/pdf" : "image/jpeg",
        upsert: true,
      })

    if (uploadError) {
      await supabase
        .from("receipts")
        .update({
          status: "error",
          error_message: `Upload fehlgeschlagen: ${uploadError.message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receiptId)
      throw uploadError
    }

    // Mark as downloaded
    await supabase
      .from("receipts")
      .update({
        status: "downloaded",
        file_path: filePath,
        file_name: d.fileName,
        file_size_bytes: pdfBuffer.length,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId)

    return NextResponse.json({ success: true, id: receiptId })
  } catch (err) {
    console.error("POST /api/receipts/webhook error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
