import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/receipts/[id]/download — returns a short-lived signed URL to view the file
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { data: receipt, error } = await supabase
      .from("receipts")
      .select("file_path, file_name")
      .eq("id", id)
      .single()

    if (error || !receipt || !receipt.file_path) {
      return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 })
    }

    // Generate a 60-minute signed URL
    const serviceSupabase = getServiceSupabase()
    const { data: signedData, error: signedError } = await serviceSupabase.storage
      .from("receipts")
      .createSignedUrl(receipt.file_path, 3600)

    if (signedError || !signedData?.signedUrl) {
      throw signedError ?? new Error("Signed URL konnte nicht erstellt werden")
    }

    return NextResponse.json({ url: signedData.signedUrl, fileName: receipt.file_name })
  } catch (err) {
    console.error("GET /api/receipts/[id]/download error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
