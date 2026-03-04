import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/encryption"

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const PLATFORM_SUPPLIER: Record<string, string> = {
  airbnb: "Airbnb Ireland UC",
  booking: "Booking.com B.V.",
  smoobu: "Smoobu GmbH",
  manual: "Manuell",
}

async function uploadFileToLexware(
  apiKey: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType })
  formData.append("file", blob, fileName)
  formData.append("type", "voucher")

  const res = await fetch("https://api.lexware.io/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Lexware Datei-Upload: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.id as string
}

async function createLexwareVoucher(
  apiKey: string,
  opts: {
    fileId: string
    date: string
    amount: number | null
    supplierName: string
    description: string
  }
): Promise<string> {
  const voucherDate = new Date(opts.date + "T12:00:00").toISOString()

  const voucherItems =
    opts.amount !== null
      ? [{ amount: opts.amount, taxAmount: 0, taxRatePercent: 0, categoryId: null }]
      : []

  const payload = {
    voucherType: "purchaseInvoice",
    voucherStatus: "open",
    voucherDate,
    supplierName: opts.supplierName,
    description: opts.description,
    voucherItems,
    files: [opts.fileId],
  }

  const res = await fetch("https://api.lexware.io/v1/vouchers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Lexware Beleg-Erstellung: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return (data.id ?? data.resourceUri ?? "") as string
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    // Get receipt
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select(
        "id, platform, booking_reference, file_path, file_name, receipt_date, amount, status"
      )
      .eq("id", id)
      .single()

    if (receiptError || !receipt) {
      return NextResponse.json({ error: "Beleg nicht gefunden" }, { status: 404 })
    }

    if (!receipt.file_path) {
      return NextResponse.json({ error: "Keine Datei fuer diesen Beleg vorhanden" }, { status: 400 })
    }

    if (receipt.status === "transferred") {
      return NextResponse.json({ error: "Beleg wurde bereits uebertragen" }, { status: 409 })
    }

    // Get Lexware API key
    const { data: integration, error: intError } = await supabase
      .from("integration_settings")
      .select("api_key_encrypted")
      .eq("platform", "lexware")
      .limit(1)
      .single()

    if (intError || !integration) {
      return NextResponse.json({ error: "Kein Lexware API-Key hinterlegt" }, { status: 400 })
    }
    const lexwareApiKey = decrypt(integration.api_key_encrypted)

    // Download file from Supabase Storage
    const serviceSupabase = getServiceSupabase()
    const { data: fileData, error: downloadError } = await serviceSupabase.storage
      .from("receipts")
      .download(receipt.file_path)

    if (downloadError || !fileData) {
      throw new Error("Datei konnte nicht aus dem Speicher geladen werden")
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer())
    const ext = (receipt.file_name ?? "receipt.pdf").split(".").pop()?.toLowerCase() ?? "pdf"
    const mimeType = ext === "pdf" ? "application/pdf" : "image/jpeg"
    const fileName = receipt.file_name ?? `${receipt.platform}-${receipt.booking_reference ?? id}.pdf`

    // Upload file to Lexware
    const fileId = await uploadFileToLexware(lexwareApiKey, fileBuffer, fileName, mimeType)

    // Create voucher
    const supplier = PLATFORM_SUPPLIER[receipt.platform] ?? receipt.platform
    const description = receipt.booking_reference
      ? `${supplier} Beleg ${receipt.booking_reference}`
      : `${supplier} Beleg`

    const voucherId = await createLexwareVoucher(lexwareApiKey, {
      fileId,
      date: receipt.receipt_date ?? new Date().toISOString().split("T")[0],
      amount: receipt.amount !== null ? Number(receipt.amount) : null,
      supplierName: supplier,
      description,
    })

    // Update receipt status
    await supabase
      .from("receipts")
      .update({
        status: "transferred",
        lexware_document_id: voucherId,
        transferred_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    return NextResponse.json({ success: true, voucherId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Interner Serverfehler"
    console.error(`POST /api/receipts/${id}/transfer error:`, err)

    // Save error message on receipt
    try {
      const supabase = await createServerSupabaseClient()
      await supabase
        .from("receipts")
        .update({ error_message: msg, updated_at: new Date().toISOString() })
        .eq("id", id)
    } catch { /* ignore */ }

    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
