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

    // Fetch all non-archived properties
    const { data: properties, error: propError } = await supabase
      .from("properties")
      .select(
        "id, smoobu_id, name, location, display_name, notes, is_active, is_archived, synced_at"
      )
      .eq("is_archived", false)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500)

    if (propError) {
      return NextResponse.json({ error: propError.message }, { status: 500 })
    }

    // Fetch all city_tax_configs with age_groups joined
    // We need the most recent config per property where valid_from <= today
    const today = new Date().toISOString().split("T")[0]

    const { data: configs, error: configError } = await supabase
      .from("city_tax_configs")
      .select(
        "id, property_id, is_active, tax_label, amount_per_person_night, show_separately, valid_from, created_at, city_tax_age_groups(id, age_from, age_to, percentage, sort_order)"
      )
      .lte("valid_from", today)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)

    if (configError) {
      return NextResponse.json({ error: configError.message }, { status: 500 })
    }

    // Build a map: property_id -> latest config
    const configMap = new Map<string, typeof configs[number]>()
    for (const cfg of configs ?? []) {
      // First match per property_id is the latest (due to ordering)
      if (!configMap.has(cfg.property_id)) {
        configMap.set(cfg.property_id, cfg)
      }
    }

    // Map to frontend shape (camelCase)
    const result = (properties ?? []).map((row) => {
      const cfg = configMap.get(row.id)

      const ageGroups = cfg
        ? (cfg.city_tax_age_groups ?? [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((ag) => ({
              id: ag.id,
              ageFrom: ag.age_from,
              ageTo: ag.age_to,
              percentage: ag.percentage,
            }))
        : []

      return {
        id: row.id,
        smoobuId: row.smoobu_id,
        name: row.name,
        location: row.location,
        displayName: row.display_name,
        notes: row.notes,
        isActive: row.is_active,
        isArchived: row.is_archived,
        syncedAt: row.synced_at,
        cityTaxConfig: cfg
          ? {
              id: cfg.id,
              propertyId: cfg.property_id,
              isActive: cfg.is_active,
              taxLabel: cfg.tax_label ?? "",
              amountPerPersonNight: Number(cfg.amount_per_person_night),
              showSeparately: cfg.show_separately,
              validFrom: cfg.valid_from,
              ageGroups,
              createdAt: cfg.created_at,
            }
          : null,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error("GET /api/city-tax error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
