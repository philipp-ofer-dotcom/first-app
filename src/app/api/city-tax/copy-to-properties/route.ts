import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const schema = z.object({
  sourcePropertyId: z.string().uuid(),
  targetPropertyIds: z.array(z.string().uuid()).min(1).max(50),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// POST /api/city-tax/copy-to-properties
// Copies the CURRENT city tax config (including age groups) from one property to others.
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten", details: parsed.error.flatten() }, { status: 400 })
    }

    const { sourcePropertyId, targetPropertyIds, validFrom } = parsed.data
    const today = new Date().toISOString().split("T")[0]

    // Load the current config (most recent valid_from <= today) from source property
    const { data: sourceConfig, error: srcErr } = await supabase
      .from("city_tax_configs")
      .select("id, is_active, tax_label, amount_per_person_night, show_separately, city_tax_age_groups(age_from, age_to, percentage, sort_order)")
      .eq("property_id", sourcePropertyId)
      .lte("valid_from", today)
      .order("valid_from", { ascending: false })
      .limit(1)
      .single()

    if (srcErr || !sourceConfig) {
      return NextResponse.json({ error: "Keine aktuelle City Tax Konfiguration für dieses Objekt gefunden" }, { status: 404 })
    }

    const results: Array<{ propertyId: string; success: boolean; error?: string }> = []

    for (const targetPropertyId of targetPropertyIds) {
      try {
        // Insert new config entry for target property
        const { data: newConfig, error: insertErr } = await supabase
          .from("city_tax_configs")
          .insert({
            property_id: targetPropertyId,
            is_active: sourceConfig.is_active,
            tax_label: sourceConfig.tax_label,
            amount_per_person_night: sourceConfig.amount_per_person_night,
            show_separately: sourceConfig.show_separately,
            valid_from: validFrom,
          })
          .select("id")
          .single()

        if (insertErr || !newConfig) {
          results.push({ propertyId: targetPropertyId, success: false, error: insertErr?.message })
          continue
        }

        // Copy age groups
        const ageGroups = sourceConfig.city_tax_age_groups ?? []
        if (ageGroups.length > 0) {
          await supabase.from("city_tax_age_groups").insert(
            ageGroups.map((ag) => ({
              city_tax_config_id: newConfig.id,
              age_from: ag.age_from,
              age_to: ag.age_to,
              percentage: ag.percentage,
              sort_order: ag.sort_order,
            }))
          )
        }

        results.push({ propertyId: targetPropertyId, success: true })
      } catch (e) {
        results.push({ propertyId: targetPropertyId, success: false, error: String(e) })
      }
    }

    const successCount = results.filter((r) => r.success).length
    return NextResponse.json({ success: true, copied: successCount, total: targetPropertyIds.length, results })
  } catch (err) {
    console.error("POST /api/city-tax/copy-to-properties error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
