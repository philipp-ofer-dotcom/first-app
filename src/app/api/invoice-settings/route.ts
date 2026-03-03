import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const timingSettingSchema = z.object({
  propertyId: z.string().uuid().nullable(),
  timingType: z.enum([
    "before_checkin",
    "on_checkin",
    "after_checkin",
    "on_checkout",
    "after_checkout",
  ]),
  timingDays: z.number().int().min(0).max(90),
  invoiceMode: z.enum(["automatic", "manual"]),
})

const putSchema = z.object({
  settings: z.array(timingSettingSchema).min(1),
})

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("invoice_timing_settings")
      .select("id, property_id, timing_type, timing_days, invoice_mode")
      .order("property_id", { ascending: true, nullsFirst: true })

    if (error) throw error

    // Also fetch active properties for the UI
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, display_name, smoobu_id")
      .eq("is_active", true)
      .eq("is_archived", false)
      .order("name")

    const settings = (data ?? []).map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      timingType: row.timing_type,
      timingDays: row.timing_days,
      invoiceMode: row.invoice_mode,
    }))

    return NextResponse.json({ settings, properties: properties ?? [] })
  } catch (err) {
    console.error("GET /api/invoice-settings error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    for (const s of parsed.data.settings) {
      const row = {
        property_id: s.propertyId,
        timing_type: s.timingType,
        timing_days: s.timingDays,
        invoice_mode: s.invoiceMode,
        updated_at: now,
      }

      if (s.propertyId === null) {
        // Upsert global setting (property_id IS NULL — use a special approach)
        const { data: existing } = await supabase
          .from("invoice_timing_settings")
          .select("id")
          .is("property_id", null)
          .limit(1)
          .single()

        if (existing) {
          await supabase
            .from("invoice_timing_settings")
            .update(row)
            .eq("id", existing.id)
        } else {
          await supabase.from("invoice_timing_settings").insert(row)
        }
      } else {
        // Upsert per-property setting
        const { data: existing } = await supabase
          .from("invoice_timing_settings")
          .select("id")
          .eq("property_id", s.propertyId)
          .limit(1)
          .single()

        if (existing) {
          await supabase
            .from("invoice_timing_settings")
            .update(row)
            .eq("id", existing.id)
        } else {
          await supabase.from("invoice_timing_settings").insert(row)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PUT /api/invoice-settings error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Keine ID angegeben" }, { status: 400 })
    }

    const { error } = await supabase
      .from("invoice_timing_settings")
      .delete()
      .eq("id", id)
      .not("property_id", "is", null) // Protect: global setting cannot be deleted

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/invoice-settings error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
