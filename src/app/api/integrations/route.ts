import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { data: integrations, error } = await supabase
      .from("integration_settings")
      .select(
        "id, platform, last_tested_at, last_test_status, last_error_msg, created_at, updated_at"
      )
      .limit(10)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map to frontend shape, never expose the encrypted key
    const result = (integrations ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      hasApiKey: true, // If a row exists, a key was saved
      lastTestedAt: row.last_tested_at,
      lastTestStatus: row.last_test_status,
      lastErrorMsg: row.last_error_msg,
    }))

    // Ensure both platforms are represented
    const platforms = ["smoobu", "lexware"] as const
    const fullResult = platforms.map((platform) => {
      const existing = result.find((r) => r.platform === platform)
      if (existing) return existing
      return {
        id: null,
        platform,
        hasApiKey: false,
        lastTestedAt: null,
        lastTestStatus: "untested",
        lastErrorMsg: null,
      }
    })

    return NextResponse.json(fullResult)
  } catch (err) {
    console.error("GET /api/integrations error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
