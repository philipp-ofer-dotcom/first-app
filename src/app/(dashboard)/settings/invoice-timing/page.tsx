"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Clock, Save, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

import type {
  InvoiceTimingSetting,
  TimingType,
  InvoiceMode,
  Property,
} from "@/lib/types"

// -- Constants ----------------------------------------------------------------

const TIMING_OPTIONS: { value: TimingType; label: string; hasDays: boolean }[] = [
  { value: "before_checkin", label: "X Tage vor Anreise", hasDays: true },
  { value: "on_checkin", label: "Am Anreisetag", hasDays: false },
  { value: "after_checkin", label: "X Tage nach Anreise", hasDays: true },
  { value: "on_checkout", label: "Am Abreisetag", hasDays: false },
  { value: "after_checkout", label: "X Tage nach Abreise", hasDays: true },
]

function getTimingLabel(timingType: TimingType, timingDays: number): string {
  switch (timingType) {
    case "before_checkin":
      return `${timingDays} Tage vor Anreise`
    case "on_checkin":
      return "Am Anreisetag"
    case "after_checkin":
      return `${timingDays} Tage nach Anreise`
    case "on_checkout":
      return "Am Abreisetag"
    case "after_checkout":
      return `${timingDays} Tage nach Abreise`
  }
}

function getModeLabel(mode: InvoiceMode): string {
  return mode === "automatic" ? "Automatisch" : "Manuell"
}

function timingHasDays(timingType: TimingType): boolean {
  return TIMING_OPTIONS.find((o) => o.value === timingType)?.hasDays ?? false
}

// -- Page Component -----------------------------------------------------------

export default function InvoiceTimingPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [properties, setProperties] = useState<Property[]>([])
  const [globalSetting, setGlobalSetting] =
    useState<InvoiceTimingSetting | null>(null)
  const [overrides, setOverrides] = useState<InvoiceTimingSetting[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/invoice-settings")
      if (!res.ok) throw new Error("Fehler beim Laden")
      const json = await res.json()
      const all: InvoiceTimingSetting[] = (json.settings ?? []).map(
        (s: { id: string; propertyId: string | null; timingType: string; timingDays: number; invoiceMode: string }) => ({
          id: s.id,
          propertyId: s.propertyId,
          timingType: s.timingType as TimingType,
          timingDays: s.timingDays,
          invoiceMode: s.invoiceMode as InvoiceMode,
        })
      )
      const global = all.find((s) => !s.propertyId) ?? {
        id: "global-new",
        propertyId: null,
        timingType: "before_checkin" as TimingType,
        timingDays: 3,
        invoiceMode: "automatic" as InvoiceMode,
      }
      setGlobalSetting(global)
      setOverrides(all.filter((s) => s.propertyId))
      setProperties(
        (json.properties ?? []).map((p: { id: string; name: string; display_name?: string | null; smoobu_id?: string }) => ({
          id: p.id,
          smoobuId: p.smoobu_id ?? "",
          name: p.name,
          location: "",
          displayName: p.display_name ?? null,
          notes: null,
          isActive: true,
          isArchived: false,
          syncedAt: null,
        }))
      )
    } catch {
      // keep empty state
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function handleSaveGlobal() {
    if (!globalSetting) return
    setIsSaving(true)
    try {
      await fetch("/api/invoice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [
            {
              propertyId: null,
              timingType: globalSetting.timingType,
              timingDays: globalSetting.timingDays,
              invoiceMode: globalSetting.invoiceMode,
            },
          ],
        }),
      })
      await fetchSettings()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddOverride(override: InvoiceTimingSetting) {
    await fetch("/api/invoice-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: [
          {
            propertyId: override.propertyId,
            timingType: override.timingType,
            timingDays: override.timingDays,
            invoiceMode: override.invoiceMode,
          },
        ],
      }),
    })
    setDialogOpen(false)
    await fetchSettings()
  }

  async function handleDeleteOverride(id: string) {
    await fetch(`/api/invoice-settings?id=${id}`, { method: "DELETE" })
    setOverrides((prev) => prev.filter((o) => o.id !== id))
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (!globalSetting) {
    return null
  }

  // Properties that don't yet have an override
  const availableProperties = properties.filter(
    (p) => !overrides.some((o) => o.propertyId === p.id)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Rechnungs-Timing
        </h1>
        <p className="text-sm text-muted-foreground">
          Konfigurieren Sie, wann Rechnungen erstellt werden sollen
        </p>
      </div>

      {/* Global Setting Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Globale Einstellung
          </CardTitle>
          <CardDescription>
            Diese Einstellung gilt fuer alle Objekte, sofern kein
            objektspezifischer Override vorhanden ist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timing Type */}
          <div className="space-y-2">
            <Label htmlFor="timing-type">Erstellungszeitpunkt</Label>
            <Select
              value={globalSetting.timingType}
              onValueChange={(v) =>
                setGlobalSetting({
                  ...globalSetting,
                  timingType: v as TimingType,
                  timingDays: timingHasDays(v as TimingType)
                    ? globalSetting.timingDays || 1
                    : 0,
                })
              }
            >
              <SelectTrigger id="timing-type" className="w-full max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Days Input */}
          {timingHasDays(globalSetting.timingType) && (
            <div className="space-y-2">
              <Label htmlFor="timing-days">Anzahl Tage</Label>
              <Input
                id="timing-days"
                type="number"
                min={1}
                max={30}
                value={globalSetting.timingDays}
                onChange={(e) =>
                  setGlobalSetting({
                    ...globalSetting,
                    timingDays: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-full max-w-[120px]"
                aria-label="Anzahl Tage"
              />
            </div>
          )}

          <Separator />

          {/* Invoice Mode */}
          <div className="space-y-3">
            <Label>Rechnungsmodus</Label>
            <RadioGroup
              value={globalSetting.invoiceMode}
              onValueChange={(v) =>
                setGlobalSetting({
                  ...globalSetting,
                  invoiceMode: v as InvoiceMode,
                })
              }
              className="space-y-3"
            >
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="automatic" id="mode-automatic" />
                <div className="space-y-1">
                  <Label htmlFor="mode-automatic" className="cursor-pointer">
                    Automatisch
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Rechnungen werden automatisch zum festgelegten Zeitpunkt
                    erstellt
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="manual" id="mode-manual" />
                <div className="space-y-1">
                  <Label htmlFor="mode-manual" className="cursor-pointer">
                    Manuell
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Rechnungen werden vorbereitet und muessen manuell
                    freigegeben werden
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          <Button onClick={handleSaveGlobal} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? "Wird gespeichert..." : "Speichern"}
          </Button>
        </CardContent>
      </Card>

      {/* Per-Property Overrides */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Pro-Objekt Overrides</CardTitle>
              <CardDescription>
                Abweichende Timing-Einstellungen fuer einzelne Objekte
              </CardDescription>
            </div>
            <AddOverrideDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              properties={availableProperties}
              onAdd={handleAddOverride}
            />
          </div>
        </CardHeader>
        <CardContent>
          {overrides.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
              <Clock className="mb-4 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Keine Overrides konfiguriert. Alle Objekte verwenden die
                globale Einstellung.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {overrides.map((override) => {
                const property = properties.find(
                  (p) => p.id === override.propertyId
                )
                return (
                  <Card key={override.id} className="bg-muted/50">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {property?.name ?? "Unbekanntes Objekt"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getTimingLabel(
                            override.timingType,
                            override.timingDays
                          )}{" "}
                          &middot; {getModeLabel(override.invoiceMode)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteOverride(override.id)}
                        aria-label={`Override loeschen fuer ${property?.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// -- Add Override Dialog ------------------------------------------------------

interface AddOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  onAdd: (override: InvoiceTimingSetting) => Promise<void>
}

function AddOverrideDialog({
  open,
  onOpenChange,
  properties,
  onAdd,
}: AddOverrideDialogProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [timingType, setTimingType] = useState<TimingType>("on_checkin")
  const [timingDays, setTimingDays] = useState(1)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("automatic")

  function handleSubmit() {
    if (!selectedPropertyId) return
    onAdd({
      id: `override-${Date.now()}`,
      propertyId: selectedPropertyId,
      timingType,
      timingDays: timingHasDays(timingType) ? timingDays : 0,
      invoiceMode,
    })
    // Reset form
    setSelectedPropertyId("")
    setTimingType("on_checkin")
    setTimingDays(1)
    setInvoiceMode("automatic")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Override hinzufuegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Objekt-Override hinzufuegen</DialogTitle>
          <DialogDescription>
            Legen Sie abweichende Timing-Einstellungen fuer ein bestimmtes
            Objekt fest.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Property Select */}
          <div className="space-y-2">
            <Label htmlFor="override-property">Objekt</Label>
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle Objekte haben bereits einen Override.
              </p>
            ) : (
              <Select
                value={selectedPropertyId}
                onValueChange={setSelectedPropertyId}
              >
                <SelectTrigger id="override-property">
                  <SelectValue placeholder="Objekt auswaehlen" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Timing Type */}
          <div className="space-y-2">
            <Label htmlFor="override-timing">Erstellungszeitpunkt</Label>
            <Select
              value={timingType}
              onValueChange={(v) => setTimingType(v as TimingType)}
            >
              <SelectTrigger id="override-timing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Days */}
          {timingHasDays(timingType) && (
            <div className="space-y-2">
              <Label htmlFor="override-days">Anzahl Tage</Label>
              <Input
                id="override-days"
                type="number"
                min={1}
                max={30}
                value={timingDays}
                onChange={(e) =>
                  setTimingDays(parseInt(e.target.value, 10) || 1)
                }
                className="w-[120px]"
              />
            </div>
          )}

          {/* Mode */}
          <div className="space-y-2">
            <Label>Rechnungsmodus</Label>
            <RadioGroup
              value={invoiceMode}
              onValueChange={(v) => setInvoiceMode(v as InvoiceMode)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="automatic"
                  id="override-mode-automatic"
                />
                <Label
                  htmlFor="override-mode-automatic"
                  className="cursor-pointer"
                >
                  Automatisch
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="override-mode-manual" />
                <Label
                  htmlFor="override-mode-manual"
                  className="cursor-pointer"
                >
                  Manuell
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPropertyId || properties.length === 0}
          >
            Hinzufuegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -- Loading Skeleton ---------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
