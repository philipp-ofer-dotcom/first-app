"use client"

import * as React from "react"
import { Landmark, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CityTaxConfigSheet } from "@/components/city-tax-config-sheet"

import type { CityTaxConfig, PropertyWithCityTax } from "@/lib/types"

export default function CityTaxPage() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [properties, setProperties] = React.useState<PropertyWithCityTax[]>([])

  // Sheet state
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [selectedProperty, setSelectedProperty] = React.useState<PropertyWithCityTax | null>(null)

  const loadProperties = React.useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/city-tax")
      if (!res.ok) throw new Error("Fehler beim Laden der Objekte")
      const data: PropertyWithCityTax[] = await res.json()
      setProperties(data)
    } catch (err) {
      console.error("Failed to load properties:", err)
      setError(
        err instanceof Error ? err.message : "Unbekannter Fehler beim Laden"
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadProperties()
  }, [loadProperties])

  async function handleToggleCityTax(propertyId: string, active: boolean) {
    const property = properties.find((p) => p.id === propertyId)
    if (!property) return

    const config = property.cityTaxConfig

    try {
      const res = await fetch(`/api/city-tax/${propertyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: active,
          taxLabel: config?.taxLabel ?? "",
          amountPerPersonNight: config?.amountPerPersonNight ?? 0,
          showSeparately: config?.showSeparately ?? true,
          validFrom: config?.validFrom ?? new Date().toISOString().split("T")[0],
          ageGroups: (config?.ageGroups ?? []).map((ag, i) => ({
            ageFrom: ag.ageFrom,
            ageTo: ag.ageTo,
            percentage: ag.percentage,
            sortOrder: i,
          })),
        }),
      })

      if (!res.ok) throw new Error("Fehler beim Speichern")

      const saved: CityTaxConfig = await res.json()
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propertyId ? { ...p, cityTaxConfig: saved } : p
        )
      )
    } catch (err) {
      console.error("Failed to toggle city tax:", err)
      // Reload to get consistent state
      loadProperties()
    }
  }

  function handleOpenConfig(property: PropertyWithCityTax) {
    setSelectedProperty(property)
    setSheetOpen(true)
  }

  async function handleSaveConfig(
    config: Omit<CityTaxConfig, "id" | "createdAt">
  ) {
    const res = await fetch(`/api/city-tax/${config.propertyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: config.isActive,
        taxLabel: config.taxLabel,
        amountPerPersonNight: config.amountPerPersonNight,
        showSeparately: config.showSeparately,
        validFrom: config.validFrom,
        ageGroups: config.ageGroups.map((ag, i) => ({
          ageFrom: ag.ageFrom,
          ageTo: ag.ageTo,
          percentage: ag.percentage,
          sortOrder: i,
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }))
      throw new Error(err.error || "Fehler beim Speichern")
    }

    const saved: CityTaxConfig = await res.json()
    setProperties((prev) =>
      prev.map((p) =>
        p.id === config.propertyId ? { ...p, cityTaxConfig: saved } : p
      )
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">City Tax</h1>
          <p className="text-muted-foreground">
            Konfigurieren Sie die Kurtaxe pro Objekt.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">City Tax</h1>
        </div>
        <p className="text-muted-foreground">
          Konfigurieren Sie die Kurtaxe / Tourismusabgabe pro Objekt.
        </p>
      </div>

      {/* Empty state */}
      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Keine Objekte vorhanden</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Es wurden noch keine aktiven Objekte gefunden. Synchronisieren Sie
              zuerst Ihre Objekte unter Einstellungen.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Property list */
        <div className="grid gap-4">
          {properties.map((property) => {
            const isActive = property.cityTaxConfig?.isActive ?? false
            const hasConfig =
              property.cityTaxConfig !== null &&
              property.cityTaxConfig.taxLabel !== ""

            return (
              <Card key={property.id}>
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Property info */}
                  <div className="flex items-center gap-4 min-w-0">
                    <Switch
                      checked={isActive}
                      onCheckedChange={(checked) =>
                        handleToggleCityTax(property.id, checked)
                      }
                      aria-label={`City Tax fuer ${property.name} ${isActive ? "deaktivieren" : "aktivieren"}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {property.name}
                        </span>
                        <Badge variant={isActive ? "default" : "secondary"}>
                          {isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                        {hasConfig && isActive && (
                          <Badge variant="outline" className="text-xs">
                            {property.cityTaxConfig!.amountPerPersonNight.toLocaleString(
                              "de-DE",
                              { style: "currency", currency: "EUR" }
                            )}{" "}
                            / Person / Nacht
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {property.location}
                      </p>
                    </div>
                  </div>

                  {/* Configure button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenConfig(property)}
                    className="shrink-0"
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Konfigurieren
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Config Sheet */}
      {selectedProperty && (
        <CityTaxConfigSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          property={selectedProperty}
          config={selectedProperty.cityTaxConfig}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  )
}
