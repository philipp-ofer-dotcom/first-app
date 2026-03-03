import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { encrypt } from "@/lib/encryption"

const saveSchema = z.object({
  apiKey: z.string().min(1, "API-Key darf nicht leer sein"),
})

const platformSchema = z.enum(["smoobu", "lexware"])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params

    // Validate platform
    const platformResult = platformSchema.safeParse(platform)
    if (!platformResult.success) {
      return NextResponse.json(
        { error: "Ungueltige Plattform. Erlaubt: smoobu, lexware" },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    // Parse and validate body
    const body = await request.json()
    const bodyResult = saveSchema.safeParse(body)
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: bodyResult.error.issues[0]?.message ?? "Ungueltige Eingabe" },
        { status: 400 }
      )
    }

    const { apiKey } = bodyResult.data
    const encryptedKey = encrypt(apiKey)

    // Upsert: insert or update based on platform
    const { error } = await supabase
      .from("integration_settings")
      .upsert(
        {
          platform: platformResult.data,
          api_key_encrypted: encryptedKey,
          last_test_status: "untested",
          last_tested_at: null,
          last_error_msg: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "platform" }
      )

    if (error) {
      console.error("Upsert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("POST /api/integrations/[platform]/save error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
