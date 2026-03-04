import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const bodySchema = z.object({
  receiptIds: z.array(z.string().uuid()).min(1).max(100),
})

// POST /api/receipts/transfer-batch — transfer multiple receipts to Lexware
// Calls /api/receipts/[id]/transfer for each ID sequentially (rate-limit friendly)
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { receiptIds } = parsed.data

    // Build the base URL for internal API calls
    const origin =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000"

    // Retrieve auth cookies to forward to internal API
    const cookieHeader = request.headers.get("cookie") ?? ""

    const results: { id: string; success: boolean; error?: string; voucherId?: string }[] = []

    for (const id of receiptIds) {
      try {
        const res = await fetch(`${origin}/api/receipts/${id}/transfer`, {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(60000),
        })

        const data = await res.json()

        if (res.ok) {
          results.push({ id, success: true, voucherId: data.voucherId })
        } else if (res.status === 409) {
          // Already transferred — treat as success
          results.push({ id, success: true })
        } else {
          results.push({ id, success: false, error: data.error ?? `HTTP ${res.status}` })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
        results.push({ id, success: false, error: msg })
      }

      // Rate limit: ~500ms between requests (~2/s)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.length - successCount

    return NextResponse.json({ results, successCount, failCount })
  } catch (err) {
    console.error("POST /api/receipts/transfer-batch error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
