import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET(
  _request: NextRequest,
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

    // Fetch all configs for this property, ordered by valid_from DESC
    const { data: configs, error } = await supabase
      .from("city_tax_configs")
      .select(
        "id, property_id, is_active, tax_label, amount_per_person_night, show_separately, valid_from, created_at, city_tax_age_groups(id, age_from, age_to, percentage, sort_order)"
      )
      .eq("property_id", propertyId)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map to frontend shape (camelCase)
    const result = (configs ?? []).map((cfg) => ({
      id: cfg.id,
      propertyId: cfg.property_id,
      isActive: cfg.is_active,
      taxLabel: cfg.tax_label ?? "",
      amountPerPersonNight: Number(cfg.amount_per_person_night),
      showSeparately: cfg.show_separately,
      validFrom: cfg.valid_from,
      ageGroups: (cfg.city_tax_age_groups ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ag) => ({
          id: ag.id,
          ageFrom: ag.age_from,
          ageTo: ag.age_to,
          percentage: ag.percentage,
        })),
      createdAt: cfg.created_at,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error("GET /api/city-tax/[propertyId]/history error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
