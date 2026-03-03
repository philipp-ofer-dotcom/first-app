"use client"

import * as React from "react"
import { Plus, Trash2, Calculator, AlertTriangle } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { AgeGroup, CityTaxConfig, Property } from "@/lib/types"

interface CityTaxConfigSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property
  config: CityTaxConfig | null
  onSave: (config: Omit<CityTaxConfig, "id" | "createdAt">) => Promise<void>
}

function generateId() {
  return crypto.randomUUID()
}

function defaultAgeGroups(): AgeGroup[] {
  return [
    { id: generateId(), ageFrom: 0, ageTo: 5, percentage: 0 },
    { id: generateId(), ageFrom: 6, ageTo: 17, percentage: 50 },
    { id: generateId(), ageFrom: 18, ageTo: null, percentage: 100 },
  ]
}

interface AgeGroupValidation {
  hasOverlaps: boolean
  hasGaps: boolean
  messages: string[]
}

function validateAgeGroups(groups: AgeGroup[]): AgeGroupValidation {
  const result: AgeGroupValidation = {
    hasOverlaps: false,
    hasGaps: false,
    messages: [],
  }

  if (groups.length === 0) return result

  // Sort by ageFrom
  const sorted = [...groups].sort((a, b) => (a.ageFrom ?? 0) - (b.ageFrom ?? 0))

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]

    const currentEnd = current.ageTo ?? 999
    const nextStart = next.ageFrom ?? 0

    if (currentEnd >= nextStart) {
      result.hasOverlaps = true
      result.messages.push(
        `Uberlappung: Gruppe ${current.ageFrom ?? 0}-${current.ageTo ?? "+"} und ${next.ageFrom ?? 0}-${next.ageTo ?? "+"}`
      )
    } else if (currentEnd + 1 < nextStart) {
      result.hasGaps = true
      result.messages.push(
        `Lucke: Alter ${currentEnd + 1} bis ${nextStart - 1} nicht abgedeckt`
      )
    }
  }

  return result
}

function calculateCityTax(
  persons: number,
  nights: number,
  ages: number[],
  amount: number,
  ageGroups: AgeGroup[]
): number {
  if (nights === 0 || persons === 0 || amount === 0) return 0

  // If no ages provided, use max rate for all persons
  if (ages.length === 0) {
    const maxPercentage = ageGroups.length > 0
      ? Math.max(...ageGroups.map((g) => g.percentage))
      : 100
    return persons * nights * amount * (maxPercentage / 100)
  }

  let total = 0
  for (const age of ages) {
    // Find matching age group
    const group = ageGroups.find((g) => {
      const from = g.ageFrom ?? 0
      const to = g.ageTo ?? 999
      return age >= from && age <= to
    })
    const percentage = group ? group.percentage : 100 // Fallback to max
    total += nights * amount * (percentage / 100)
  }
  return total
}

export function CityTaxConfigSheet({
  open,
  onOpenChange,
  property,
  config,
  onSave,
}: CityTaxConfigSheetProps) {
  const [isSaving, setIsSaving] = React.useState(false)

  // Form state
  const [taxLabel, setTaxLabel] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [showSeparately, setShowSeparately] = React.useState(true)
  const [ageGroups, setAgeGroups] = React.useState<AgeGroup[]>([])

  // Preview state
  const [previewPersons, setPreviewPersons] = React.useState("2")
  const [previewNights, setPreviewNights] = React.useState("3")
  const [previewAges, setPreviewAges] = React.useState("")

  // Reset form when config/property changes
  React.useEffect(() => {
    if (open) {
      if (config) {
        setTaxLabel(config.taxLabel)
        setAmount(config.amountPerPersonNight.toString().replace(".", ","))
        setValidFrom(config.validFrom)
        setShowSeparately(config.showSeparately)
        setAgeGroups(config.ageGroups.length > 0 ? config.ageGroups : defaultAgeGroups())
      } else {
        setTaxLabel("")
        setAmount("2,50")
        setValidFrom(new Date().toISOString().split("T")[0])
        setShowSeparately(true)
        setAgeGroups(defaultAgeGroups())
      }
      setPreviewPersons("2")
      setPreviewNights("3")
      setPreviewAges("")
    }
  }, [open, config])

  const validation = validateAgeGroups(ageGroups)
  const hasValidationWarning = validation.hasOverlaps || validation.hasGaps

  // Parse amount
  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0

  // Calculate preview
  const parsedPersons = parseInt(previewPersons) || 0
  const parsedNights = parseInt(previewNights) || 0
  const parsedAges = previewAges
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n))

  const previewTotal = calculateCityTax(
    parsedPersons,
    parsedNights,
    parsedAges,
    parsedAmount,
    ageGroups
  )

  function handleAddAgeGroup() {
    const sorted = [...ageGroups].sort((a, b) => (a.ageFrom ?? 0) - (b.ageFrom ?? 0))
    const lastGroup = sorted[sorted.length - 1]
    const newFrom = lastGroup ? (lastGroup.ageTo ?? 0) + 1 : 0

    setAgeGroups([
      ...ageGroups,
      {
        id: generateId(),
        ageFrom: newFrom,
        ageTo: null,
        percentage: 100,
      },
    ])
  }

  function handleRemoveAgeGroup(id: string) {
    setAgeGroups(ageGroups.filter((g) => g.id !== id))
  }

  function handleAgeGroupChange(
    id: string,
    field: keyof AgeGroup,
    value: string
  ) {
    setAgeGroups(
      ageGroups.map((g) => {
        if (g.id !== id) return g
        if (field === "ageFrom" || field === "ageTo") {
          const num = value === "" ? null : parseInt(value)
          return { ...g, [field]: isNaN(num as number) ? null : num }
        }
        if (field === "percentage") {
          const num = parseFloat(value) || 0
          return { ...g, percentage: Math.min(100, Math.max(0, num)) }
        }
        return g
      })
    )
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await onSave({
        propertyId: property.id,
        isActive: true,
        taxLabel,
        amountPerPersonNight: parsedAmount,
        showSeparately,
        validFrom,
        ageGroups,
      })
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save city tax config:", err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>City Tax konfigurieren</SheetTitle>
          <SheetDescription>
            {property.name} &mdash; {property.location}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Tax Label */}
          <div className="space-y-2">
            <Label htmlFor="tax-label">Steuerbezeichnung</Label>
            <Input
              id="tax-label"
              placeholder="z.B. Kurtaxe Karlsruhe"
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Betrag pro Person/Nacht</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                &euro;
              </span>
              <Input
                id="amount"
                className="pl-8"
                placeholder="2,50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Valid From */}
          <div className="space-y-2">
            <Label htmlFor="valid-from">Gueltig ab</Label>
            <Input
              id="valid-from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>

          {/* Show Separately Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-separately">Separat auf Rechnung ausweisen</Label>
              <p className="text-sm text-muted-foreground">
                City Tax als eigene Position anzeigen
              </p>
            </div>
            <Switch
              id="show-separately"
              checked={showSeparately}
              onCheckedChange={setShowSeparately}
              aria-label="Separat auf Rechnung ausweisen"
            />
          </div>

          <Separator />

          {/* Age Groups */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Altersgruppen</Label>
              {hasValidationWarning && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Warnung
                </Badge>
              )}
            </div>

            {hasValidationWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-1">
                    {validation.messages.map((msg, idx) => (
                      <li key={idx} className="text-sm">{msg}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              {ageGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Von</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={group.ageFrom ?? ""}
                      onChange={(e) =>
                        handleAgeGroupChange(group.id, "ageFrom", e.target.value)
                      }
                      aria-label={`Altersgruppe von Alter`}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Bis</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="unbegr."
                      value={group.ageTo ?? ""}
                      onChange={(e) =>
                        handleAgeGroupChange(group.id, "ageTo", e.target.value)
                      }
                      aria-label={`Altersgruppe bis Alter`}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Satz %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="100"
                      value={group.percentage}
                      onChange={(e) =>
                        handleAgeGroupChange(group.id, "percentage", e.target.value)
                      }
                      aria-label={`Prozentsatz`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAgeGroup(group.id)}
                    aria-label="Altersgruppe entfernen"
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddAgeGroup}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Altersgruppe hinzufuegen
            </Button>
          </div>

          <Separator />

          {/* Preview Calculator */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4" />
                Vorschau-Rechner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="preview-persons" className="text-xs">
                    Anzahl Personen
                  </Label>
                  <Input
                    id="preview-persons"
                    type="number"
                    min={0}
                    value={previewPersons}
                    onChange={(e) => setPreviewPersons(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="preview-nights" className="text-xs">
                    Anzahl Naechte
                  </Label>
                  <Input
                    id="preview-nights"
                    type="number"
                    min={0}
                    value={previewNights}
                    onChange={(e) => setPreviewNights(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="preview-ages" className="text-xs">
                  Alter der Personen (kommagetrennt, optional)
                </Label>
                <Input
                  id="preview-ages"
                  placeholder="z.B. 35, 32, 7"
                  value={previewAges}
                  onChange={(e) => setPreviewAges(e.target.value)}
                />
                {parsedAges.length === 0 && parsedPersons > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ohne Altersangabe wird der Maximalsatz verwendet.
                  </p>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">City Tax gesamt:</span>
                <span className="text-lg font-bold">
                  {previewTotal.toLocaleString("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <SheetFooter className="flex gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !taxLabel || parsedAmount <= 0}
            className="flex-1"
          >
            {isSaving ? "Speichert..." : "Speichern"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
