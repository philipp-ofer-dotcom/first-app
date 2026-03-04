import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { encrypt, decrypt } from "@/lib/encryption"

const saveSchema = z.object({
  email: z.string().email().optional().nullable(),
  password: z.string().min(1).optional().nullable(),
  totpSecret: z.string().optional().nullable(),
  n8nWebhookUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
})

type Platform = "airbnb" | "booking"

// GET /api/platform-credentials/[platform] — returns non-sensitive credential info
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { data, error } = await supabase
      .from("platform_credentials")
      .select("id, platform, email_encrypted, n8n_webhook_url, last_login_at, last_error, is_active, updated_at")
      .eq("platform", platform as Platform)
      .single()

    if (error && error.code !== "PGRST116") throw error // PGRST116 = row not found

    if (!data) {
      return NextResponse.json({ credentials: null })
    }

    return NextResponse.json({
      credentials: {
        platform: data.platform,
        hasEmail: !!data.email_encrypted,
        hasPassword: false, // never reveal
        email: data.email_encrypted ? decrypt(data.email_encrypted) : null,
        n8nWebhookUrl: data.n8n_webhook_url,
        lastLoginAt: data.last_login_at,
        lastError: data.last_error,
        isActive: data.is_active,
        updatedAt: data.updated_at,
      },
    })
  } catch (err) {
    console.error("GET /api/platform-credentials/[platform] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

// PUT /api/platform-credentials/[platform] — save/update credentials
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    if (!["airbnb", "booking"].includes(platform)) {
      return NextResponse.json({ error: "Unbekannte Plattform" }, { status: 400 })
    }

    const body = await request.json()
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungueltige Daten" }, { status: 400 })
    }

    const d = parsed.data
    const now = new Date().toISOString()

    const updates: Record<string, unknown> = { updated_at: now }
    if (d.email !== undefined) updates.email_encrypted = d.email ? encrypt(d.email) : null
    if (d.password !== undefined) updates.password_encrypted = d.password ? encrypt(d.password) : null
    if (d.totpSecret !== undefined) updates.totp_secret_encrypted = d.totpSecret ? encrypt(d.totpSecret) : null
    if (d.n8nWebhookUrl !== undefined) updates.n8n_webhook_url = d.n8nWebhookUrl
    if (d.isActive !== undefined) updates.is_active = d.isActive

    // Check if row exists
    const { data: existing } = await supabase
      .from("platform_credentials")
      .select("id")
      .eq("platform", platform)
      .single()

    if (existing) {
      await supabase
        .from("platform_credentials")
        .update(updates)
        .eq("platform", platform)
    } else {
      await supabase
        .from("platform_credentials")
        .insert({ platform, ...updates })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PUT /api/platform-credentials/[platform] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
