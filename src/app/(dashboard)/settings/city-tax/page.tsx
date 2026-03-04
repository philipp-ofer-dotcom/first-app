"use client"

import * as React from "react"
import {
  Landmark, Settings2, Copy, ChevronDown, ChevronUp, Trash2, CalendarPlus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { CityTaxConfigSheet } from "@/components/city-tax-config-sheet"

import type { CityTaxConfig, PropertyWithCityTax } from "@/lib/types"

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

function nextYearDate() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1, 0, 1)
  return d.toISOString().split("T")[0]
}

export default function CityTaxPage() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [properties, setProperties] = React.useState<PropertyWithCityTax[]>([])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [selectedProperty, setSelectedProperty] = React.useState<PropertyWithCityTax | null>(null)
  const [sheetInitialDate, setSheetInitialDate] = React.useState<string | null>(null)

  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false)
  const [copySource, setCopySource] = React.useState<PropertyWithCityTax | null>(null)
  const [copyTargets, setCopyTargets] = React.useState<Set<string>>(new Set())
  const [copyValidFrom, setCopyValidFrom] = React.useState(new Date().toISOString().split("T")[0])
  const [isCopying, setIsCopying] = React.useState(false)
  const [copyResult, setCopyResult] = React.useState<string | null>(null)

  const [expandedTimelines, setExpandedTimelines] = React.useState<Set<string>>(new Set())
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set())

  const loadProperties = React.useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/city-tax")
      if (!res.ok) throw new Error("Fehler beim Laden der Objekte")
      const data: PropertyWithCityTax[] = await res.json()
      setProperties(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => { loadProperties() }, [loadProperties])

  async function handleToggleCityTax(propertyId: string, active: boolean) {
    // Optimistic update — flip the switch immediately, no reload flicker
    setProperties((prev) =>
      prev.map((p) =>
        p.id !== propertyId || !p.cityTaxConfig
          ? p
          : { ...p, cityTaxConfig: { ...p.cityTaxConfig, isActive: active } }
      )
    )
    setTogglingIds((prev) => new Set(prev).add(propertyId))
    try {
      const res = await fetch(`/api/city-tax/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: active }),
      })
      if (!res.ok) {
        // Revert on failure
        await loadProperties()
      }
    } catch {
      await loadProperties()
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(propertyId); return next })
    }
  }

  function handleOpenConfig(property: PropertyWithCityTax, prefillDate?: string) {
    setSelectedProperty(property)
    setSheetInitialDate(prefillDate ?? null)
    setSheetOpen(true)
  }

  async function handleSaveConfig(config: Omit<CityTaxConfig, "id" | "createdAt">) {
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
          ageFrom: ag.ageFrom, ageTo: ag.ageTo, percentage: ag.percentage, sortOrder: i,
        })),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }))
      throw new Error(err.error || "Fehler beim Speichern")
    }
    await loadProperties()
  }

  async function handleDeleteFutureEntry(propertyId: string, configId: string) {
    const res = await fetch(`/api/city-tax/${propertyId}/history?configId=${configId}`, { method: "DELETE" })
    if (res.ok) await loadProperties()
  }

  function toggleTimeline(propertyId: string) {
    setExpandedTimelines((prev) => {
      const next = new Set(prev)
      if (next.has(propertyId)) next.delete(propertyId)
      else next.add(propertyId)
      return next
    })
  }

  function openCopyDialog(property: PropertyWithCityTax) {
    setCopySource(property)
    setCopyTargets(new Set())
    setCopyValidFrom(new Date().toISOString().split("T")[0])
    setCopyResult(null)
    setCopyDialogOpen(true)
  }

  async function handleCopy() {
    if (!copySource || copyTargets.size === 0) return
    setIsCopying(true)
    try {
      const res = await fetch("/api/city-tax/copy-to-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePropertyId: copySource.id,
          targetPropertyIds: Array.from(copyTargets),
          validFrom: copyValidFrom,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCopyResult(`✓ ${data.copied} von ${data.total} Objekte erfolgreich kopiert`)
        await loadProperties()
      } else {
        setCopyResult(`Fehler: ${data.error}`)
      }
    } finally {
      setIsCopying(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="h-8 w-48 mb-2" /><Skeleton className="h-4 w-80" /></div>
        <div className="grid gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">City Tax</h1>
          <p className="text-muted-foreground">Konfigurieren Sie die Kurtaxe pro Objekt.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Erneut versuchen</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const today = new Date().toISOString().split("T")[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">City Tax</h1>
        </div>
        <p className="text-muted-foreground">
          Konfigurieren Sie die Kurtaxe / Tourismusabgabe pro Objekt.
        </p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Keine Objekte vorhanden</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Es wurden noch keine aktiven Objekte gefunden. Synchronisieren Sie zuerst Ihre Objekte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {properties.map((property) => {
            const isActive = property.cityTaxConfig?.isActive ?? false
            const hasConfig = property.cityTaxConfig !== null && property.cityTaxConfig.taxLabel !== ""
            const allConfigs = property.allCityTaxConfigs ?? []
            const futureConfigs = allConfigs.filter((c) => c.isFuture)
            const pastCurrentConfigs = allConfigs.filter((c) => !c.isFuture)
            const isTimelineExpanded = expandedTimelines.has(property.id)

            return (
              <Card key={property.id}>
                <CardContent className="py-4">
                  {/* Main row */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => handleToggleCityTax(property.id, checked)}
                        disabled={togglingIds.has(property.id)}
                        aria-label={`City Tax für ${property.name}`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{property.name}</span>
                          <Badge variant={isActive ? "default" : "secondary"}>
                            {isActive ? "Aktiv" : "Inaktiv"}
                          </Badge>
                          {hasConfig && isActive && (
                            <Badge variant="outline" className="text-xs">
                              {property.cityTaxConfig!.amountPerPersonNight.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} / Person / Nacht
                            </Badge>
                          )}
                          {futureConfigs.length > 0 && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              {futureConfigs.length} geplante Änderung{futureConfigs.length !== 1 ? "en" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{property.location}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {property.cityTaxConfig && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openCopyDialog(property)}
                          title="Konfiguration auf andere Objekte kopieren"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleOpenConfig(property)}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Konfigurieren
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  {allConfigs.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <Collapsible open={isTimelineExpanded} onOpenChange={() => toggleTimeline(property.id)}>
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full">
                            {isTimelineExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span>Raten-Zeitplan ({allConfigs.length} Eintrag{allConfigs.length !== 1 ? "/"+"Einträge" : ""})</span>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-3 space-y-1">
                            {allConfigs.map((cfg) => {
                              const isCurrent = !cfg.isFuture && cfg.validFrom === pastCurrentConfigs[0]?.validFrom
                              const statusLabel = cfg.isFuture ? "Zukunft" : isCurrent ? "Aktuell" : "Vergangen"
                              const badgeClass = cfg.isFuture
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : isCurrent
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-gray-50 text-gray-500 border-gray-200"

                              return (
                                <div key={cfg.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/40">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">ab {formatDate(cfg.validFrom)}</span>
                                    <span className="text-xs text-muted-foreground">{cfg.taxLabel || "—"}</span>
                                    <span className="font-medium text-xs">
                                      {cfg.amountPerPersonNight.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Pers./Nacht
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${badgeClass}`}>{statusLabel}</span>
                                  </div>
                                  {cfg.isFuture && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                                      onClick={() => handleDeleteFutureEntry(property.id, cfg.id)}
                                      title="Eintrag löschen"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )
                            })}
                            <div className="pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleOpenConfig(property, nextYearDate())}
                              >
                                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                                Neue Rate ab {new Date().getFullYear() + 1} eintragen
                              </Button>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}
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
          config={
            sheetInitialDate && selectedProperty.cityTaxConfig
              ? { ...selectedProperty.cityTaxConfig, validFrom: sheetInitialDate }
              : selectedProperty.cityTaxConfig
          }
          onSave={handleSaveConfig}
        />
      )}

      {/* Copy to properties Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Konfiguration kopieren</DialogTitle>
            <DialogDescription>
              Aktuelle City Tax von &bdquo;{copySource?.name}&ldquo; auf andere Objekte übertragen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="copyValidFrom">Gültig ab</Label>
              <Input
                id="copyValidFrom"
                type="date"
                value={copyValidFrom}
                min={today}
                onChange={(e) => setCopyValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ziel-Objekte auswählen</Label>
              <div className="max-h-52 overflow-y-auto space-y-0.5 border rounded-md p-2">
                {properties
                  .filter((p) => p.id !== copySource?.id)
                  .map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 px-1 py-1.5 rounded text-sm">
                      <Checkbox
                        checked={copyTargets.has(p.id)}
                        onCheckedChange={(checked) => {
                          setCopyTargets((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(p.id)
                            else next.delete(p.id)
                            return next
                          })
                        }}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
              </div>
            </div>
            {copyResult && (
              <p className={`text-sm font-medium ${copyResult.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                {copyResult}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCopy} disabled={copyTargets.size === 0 || isCopying}>
              {isCopying ? "Kopiere..." : `Auf ${copyTargets.size} Objekt${copyTargets.size !== 1 ? "e" : ""} kopieren`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
