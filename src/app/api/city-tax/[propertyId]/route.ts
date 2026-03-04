import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

// PATCH /api/city-tax/[propertyId]
// Toggles is_active on the CURRENT config row — no new history entry created.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })

    const { propertyId } = await params
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(propertyId)) {
      return NextResponse.json({ error: "Ungültige Property-ID" }, { status: 400 })
    }

    const body = await request.json()
    const { isActive } = z.object({ isActive: z.boolean() }).parse(body)

    const today = new Date().toISOString().split("T")[0]

    // Find the most recent config that is currently in effect (valid_from <= today)
    const { data: current, error: fetchErr } = await supabase
      .from("city_tax_configs")
      .select("id")
      .eq("property_id", propertyId)
      .lte("valid_from", today)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Keine aktive Konfiguration gefunden" }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from("city_tax_configs")
      .update({ is_active: isActive })
      .eq("id", current.id)

    if (updateErr) {
      return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PATCH /api/city-tax/[propertyId] error:", err)
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}

const ageGroupSchema = z.object({
  ageFrom: z.number().int().min(0).nullable(),
  ageTo: z.number().int().min(0).nullable(),
  percentage: z.number().int().min(0).max(100),
  sortOrder: z.number().int().min(0).default(0),
})

const cityTaxConfigSchema = z.object({
  isActive: z.boolean(),
  taxLabel: z.string().max(200).nullable().default(null),
  amountPerPersonNight: z.number().min(0).max(99999999.99),
  showSeparately: z.boolean().default(true),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)"),
  ageGroups: z.array(ageGroupSchema).max(20),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { propertyId } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(propertyId)) {
      return NextResponse.json({ error: "Ungültige Property-ID" }, { status: 400 })
    }

    // Verify property exists and is not archived
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("is_archived", false)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: "Objekt nicht gefunden" }, { status: 404 })
    }

    // Parse and validate body
    const body = await request.json()
    const parsed = cityTaxConfigSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { isActive, taxLabel, amountPerPersonNight, showSeparately, validFrom, ageGroups } =
      parsed.data

    // ALWAYS INSERT a new row (immutable history, never UPDATE)
    const { data: newConfig, error: insertError } = await supabase
      .from("city_tax_configs")
      .insert({
        property_id: propertyId,
        is_active: isActive,
        tax_label: taxLabel,
        amount_per_person_night: amountPerPersonNight,
        show_separately: showSeparately,
        valid_from: validFrom,
      })
      .select("id, property_id, is_active, tax_label, amount_per_person_night, show_separately, valid_from, created_at")
      .single()

    if (insertError || !newConfig) {
      console.error("Insert city_tax_configs error:", insertError)
      return NextResponse.json(
        { error: "Fehler beim Speichern der City Tax Konfiguration" },
        { status: 500 }
      )
    }

    // Insert age groups linked to the new config
    let insertedAgeGroups: Array<{
      id: string
      age_from: number | null
      age_to: number | null
      percentage: number
      sort_order: number
    }> = []

    if (ageGroups.length > 0) {
      const ageGroupRows = ageGroups.map((ag, index) => ({
        city_tax_config_id: newConfig.id,
        age_from: ag.ageFrom,
        age_to: ag.ageTo,
        percentage: ag.percentage,
        sort_order: ag.sortOrder ?? index,
      }))

      const { data: agData, error: agError } = await supabase
        .from("city_tax_age_groups")
        .insert(ageGroupRows)
        .select("id, age_from, age_to, percentage, sort_order")

      if (agError) {
        console.error("Insert city_tax_age_groups error:", agError)
        return NextResponse.json(
          { error: "Fehler beim Speichern der Altersgruppen" },
          { status: 500 }
        )
      }

      insertedAgeGroups = agData ?? []
    }

    // Return the new config with age groups in camelCase
    const result = {
      id: newConfig.id,
      propertyId: newConfig.property_id,
      isActive: newConfig.is_active,
      taxLabel: newConfig.tax_label ?? "",
      amountPerPersonNight: Number(newConfig.amount_per_person_night),
      showSeparately: newConfig.show_separately,
      validFrom: newConfig.valid_from,
      ageGroups: insertedAgeGroups
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ag) => ({
          id: ag.id,
          ageFrom: ag.age_from,
          ageTo: ag.age_to,
          percentage: ag.percentage,
        })),
      createdAt: newConfig.created_at,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("PUT /api/city-tax/[propertyId] error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
