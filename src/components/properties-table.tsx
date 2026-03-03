"use client"

import * as React from "react"
import { Building2 } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { Property } from "@/lib/types"

interface PropertiesTableProps {
  properties: Property[]
  isLoading?: boolean
  onToggleActive: (id: string, isActive: boolean) => void
  onUpdateNotes: (id: string, notes: string) => void
}

function PropertiesTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-11" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Keine Objekte vorhanden</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Synchronisieren Sie zuerst Ihre Smoobu-Objekte, um sie hier zu sehen.
      </p>
    </div>
  )
}

export function PropertiesTable({
  properties,
  isLoading = false,
  onToggleActive,
  onUpdateNotes,
}: PropertiesTableProps) {
  const [editingNotes, setEditingNotes] = React.useState<Record<string, string>>({})

  if (isLoading) {
    return <PropertiesTableSkeleton />
  }

  if (properties.length === 0) {
    return <EmptyState />
  }

  function handleNotesChange(id: string, value: string) {
    setEditingNotes((prev) => ({ ...prev, [id]: value }))
  }

  function handleNotesBlur(id: string) {
    const value = editingNotes[id]
    if (value !== undefined) {
      onUpdateNotes(id, value)
      setEditingNotes((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const activeProperties = properties.filter((p) => !p.isArchived)
  const archivedProperties = properties.filter((p) => p.isArchived)

  return (
    <div className="space-y-4">
      {/* Desktop table view */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Smoobu-ID</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead className="text-center">Aktiv</TableHead>
              <TableHead>Notiz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeProperties.map((property) => (
              <TableRow key={property.id}>
                <TableCell className="font-medium">
                  {property.displayName || property.name}
                  {property.displayName && property.displayName !== property.name && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({property.name})
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {property.smoobuId}
                </TableCell>
                <TableCell>{property.location}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={property.isActive}
                    onCheckedChange={(checked) =>
                      onToggleActive(property.id, checked)
                    }
                    aria-label={`${property.name} aktivieren/deaktivieren`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Notiz hinzufuegen..."
                    value={
                      editingNotes[property.id] !== undefined
                        ? editingNotes[property.id]
                        : property.notes || ""
                    }
                    onChange={(e) =>
                      handleNotesChange(property.id, e.target.value)
                    }
                    onBlur={() => handleNotesBlur(property.id)}
                    className="h-8 max-w-xs"
                    aria-label={`Notiz fuer ${property.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
            {archivedProperties.map((property) => (
              <TableRow key={property.id} className="opacity-50">
                <TableCell className="font-medium">
                  {property.displayName || property.name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Archiviert
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {property.smoobuId}
                </TableCell>
                <TableCell>{property.location}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={false}
                    disabled
                    aria-label={`${property.name} archiviert`}
                  />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {property.notes || "-"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="flex flex-col gap-3 md:hidden">
        {activeProperties.map((property) => (
          <div
            key={property.id}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {property.displayName || property.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  ID: {property.smoobuId} | {property.location}
                </p>
              </div>
              <Switch
                checked={property.isActive}
                onCheckedChange={(checked) =>
                  onToggleActive(property.id, checked)
                }
                aria-label={`${property.name} aktivieren/deaktivieren`}
              />
            </div>
            <Input
              placeholder="Notiz hinzufuegen..."
              value={
                editingNotes[property.id] !== undefined
                  ? editingNotes[property.id]
                  : property.notes || ""
              }
              onChange={(e) =>
                handleNotesChange(property.id, e.target.value)
              }
              onBlur={() => handleNotesBlur(property.id)}
              className="h-8"
              aria-label={`Notiz fuer ${property.name}`}
            />
          </div>
        ))}
        {archivedProperties.map((property) => (
          <div
            key={property.id}
            className="rounded-lg border bg-card p-4 opacity-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {property.displayName || property.name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Archiviert
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  ID: {property.smoobuId} | {property.location}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
