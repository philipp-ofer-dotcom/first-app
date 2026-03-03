"use client"

import * as React from "react"
import { RefreshCw, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PropertiesTable } from "@/components/properties-table"
import type { Property } from "@/lib/types"

export default function PropertiesPage() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [properties, setProperties] = React.useState<Property[]>([])
  const [lastSyncedAt, setLastSyncedAt] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function loadProperties() {
      try {
        const res = await fetch("/api/properties")
        if (res.ok) {
          const data = await res.json()
          setProperties(data)
          // Set lastSyncedAt from the most recent synced property
          const latest = data.reduce(
            (max: string | null, p: Property) =>
              p.syncedAt && (!max || p.syncedAt > max) ? p.syncedAt : max,
            null as string | null
          )
          if (latest) setLastSyncedAt(latest)
        }
      } catch (err) {
        console.error("Failed to load properties:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadProperties()
  }, [])

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/properties/sync", { method: "POST" })
      const data = await res.json()

      if (res.ok && data.properties) {
        setProperties(data.properties)
        setLastSyncedAt(data.syncedAt)
      } else {
        console.error("Sync failed:", data.error)
      }
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    // Optimistic update
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isActive } : p))
    )
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) {
        // Revert on failure
        setProperties((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isActive: !isActive } : p))
        )
      }
    } catch {
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isActive: !isActive } : p))
      )
    }
  }

  async function handleUpdateNotes(id: string, notes: string) {
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, notes } : p))
    )
    try {
      await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      })
    } catch (err) {
      console.error("Failed to update notes:", err)
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Noch nie"
    const date = new Date(dateStr)
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Objekte</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre Ferienwohnungen aus Smoobu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Letzter Sync: {formatDate(lastSyncedAt)}
          </span>
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            variant="outline"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Synchronisiere...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Jetzt synchronisieren
              </>
            )}
          </Button>
        </div>
      </div>

      <PropertiesTable
        properties={properties}
        isLoading={isLoading}
        onToggleActive={handleToggleActive}
        onUpdateNotes={handleUpdateNotes}
      />
    </div>
  )
}
