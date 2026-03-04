"use client"

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc" | null

interface SortableTableHeadProps {
  label: string
  field: string
  currentField: string | null
  currentDir: SortDirection
  onSort: (field: string) => void
  className?: string
}

export function SortableTableHead({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: SortableTableHeadProps) {
  const isActive = currentField === field

  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap", className)}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1 group">
        <span>{label}</span>
        <span className={cn(
          "text-muted-foreground transition-opacity",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"
        )}>
          {isActive && currentDir === "asc" && <ArrowUp className="h-3.5 w-3.5" />}
          {isActive && currentDir === "desc" && <ArrowDown className="h-3.5 w-3.5" />}
          {!isActive && <ArrowUpDown className="h-3.5 w-3.5" />}
        </span>
      </div>
    </TableHead>
  )
}

// Hook for client-side sorting
export function useSortableData<T>(
  data: T[],
  getValue: (item: T, field: string) => string | number | null | undefined
): {
  sorted: T[]
  sortField: string | null
  sortDir: SortDirection
  toggleSort: (field: string) => void
} {
  const [sortField, setSortField] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<SortDirection>(null)

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : prev === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortField(null)
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const sorted = React.useMemo(() => {
    if (!sortField || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = getValue(a, sortField) ?? ""
      const bv = getValue(b, sortField) ?? ""
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as)
    })
  }, [data, sortField, sortDir, getValue])

  return { sorted, sortField, sortDir, toggleSort }
}

// Need React import for the hook
import * as React from "react"
