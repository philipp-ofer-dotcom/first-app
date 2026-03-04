"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  RefreshCw, ExternalLink, FileText, CalendarRange, Loader2,
  Link2, Copy, Check, Pencil, AlertTriangle,
} from "lucide-react"
import { SortableTableHead, type SortDirection } from "@/components/sortable-table-head"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"

import type { BookingWithInvoice, InvoiceStatus } from "@/lib/types"

// -- Helpers ------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

const EU_COUNTRIES = [
  { code: "DE", name: "Deutschland" },
  { code: "AT", name: "Oesterreich" },
  { code: "CH", name: "Schweiz" },
  { code: "FR", name: "Frankreich" },
  { code: "IT", name: "Italien" },
  { code: "NL", name: "Niederlande" },
  { code: "BE", name: "Belgien" },
  { code: "PL", name: "Polen" },
  { code: "ES", name: "Spanien" },
  { code: "GB", name: "Grossbritannien" },
  { code: "US", name: "USA" },
  { code: "OTHER", name: "Anderes Land" },
]

type TabFilter = "all" | InvoiceStatus

const TAB_FILTERS: { value: TabFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "pending", label: "Ausstehend" },
  { value: "ready", label: "Bereit" },
  { value: "created", label: "Erstellt" },
  { value: "error", label: "Fehler" },
  { value: "skipped", label: "Uebersprungen" },
]

function getStatusBadge(booking: BookingWithInvoice) {
  if (booking.bookingStatus === "cancelled") {
    return (
      <Badge variant="destructive" className="bg-gray-500 hover:bg-gray-500/80">
        Storniert
      </Badge>
    )
  }

  const status = booking.invoice?.status ?? "pending"

  const map: Record<InvoiceStatus, { label: string; className: string }> = {
    pending: {
      label: "Ausstehend",
      className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
    },
    ready: {
      label: "Bereit",
      className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
    },
    creating: {
      label: "Wird erstellt",
      className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
    },
    created: {
      label: "Erstellt",
      className: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
    },
    error: {
      label: "Fehler",
      className: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
    },
    skipped: {
      label: "Uebersprungen",
      className: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
    },
    cancelled: {
      label: "Storniert",
      className: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
    },
  }

  const info = map[status]
  return (
    <Badge variant="outline" className={info.className}>
      {info.label}
    </Badge>
  )
}

// -- Invoice Editor Sheet fields ---------------------------------------------

interface BillingFields {
  firstName: string
  lastName: string
  companyName: string
  street: string
  zip: string
  city: string
  countryCode: string
  vatId: string
  email: string
}

function emptyBillingFields(): BillingFields {
  return {
    firstName: "",
    lastName: "",
    companyName: "",
    street: "",
    zip: "",
    city: "",
    countryCode: "DE",
    vatId: "",
    email: "",
  }
}

function bookingToBillingFields(booking: BookingWithInvoice): BillingFields {
  const req = booking.invoiceRequest
  if (!req) return emptyBillingFields()
  return {
    firstName: req.firstName ?? "",
    lastName: req.lastName ?? "",
    companyName: req.companyName ?? "",
    street: req.street ?? "",
    zip: req.zip ?? "",
    city: req.city ?? "",
    countryCode: req.countryCode ?? "DE",
    vatId: req.vatId ?? "",
    email: req.email ?? "",
  }
}

// -- Component ----------------------------------------------------------------

export default function InvoicesPage() {
  const [bookings, setBookings] = useState<BookingWithInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabFilter>("all")
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  function toggleSort(field: string) {
    if (sortField === field) {
      if (sortDir === "asc") { setSortDir("desc") }
      else if (sortDir === "desc") { setSortDir(null); setSortField(null) }
      else { setSortDir("asc") }
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchFrom, setBatchFrom] = useState("")
  const [batchTo, setBatchTo] = useState("")
  const [isBatching, setIsBatching] = useState(false)
  const [batchResult, setBatchResult] = useState<{ scheduled: number; skipped: number } | null>(null)

  // Editor sheet state
  const [editorBooking, setEditorBooking] = useState<BookingWithInvoice | null>(null)
  const [editorFields, setEditorFields] = useState<BillingFields>(emptyBillingFields())
  const [isSavingEditor, setIsSavingEditor] = useState(false)
  const [isStornoLoading, setIsStornoLoading] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [editorSuccess, setEditorSuccess] = useState(false)

  const fetchBookings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/bookings")
      if (!res.ok) throw new Error("Fehler beim Laden der Buchungen")
      const json = await res.json()
      setBookings(json.bookings ?? [])
    } catch {
      setBookings([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/bookings/sync", { method: "POST" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error("Sync Fehler:", json.error)
      }
      await fetchBookings()
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleCreateInvoice(bookingId: string) {
    const res = await fetch(`/api/invoices/${bookingId}/create`, { method: "POST" })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error("Rechnung Fehler:", json.error)
    }
    await fetchBookings()
  }

  async function handleRetry(bookingId: string) {
    const res = await fetch(`/api/invoices/${bookingId}/retry`, { method: "POST" })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error("Retry Fehler:", json.error)
    }
    await fetchBookings()
  }

  async function handleGenerateLink(bookingId: string) {
    setGeneratingLinkFor(bookingId)
    try {
      await fetch("/api/invoice-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      })
      await fetchBookings()
    } finally {
      setGeneratingLinkFor(null)
    }
  }

  async function handleCopyLink(token: string) {
    const url = `${window.location.origin}/invoice-form/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  async function handleBatch() {
    if (!batchFrom || !batchTo) return
    setIsBatching(true)
    setBatchResult(null)
    try {
      const res = await fetch("/api/invoices/batch-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: batchFrom, toDate: batchTo }),
      })
      const json = await res.json()
      if (res.ok) {
        setBatchResult({ scheduled: json.scheduled, skipped: json.skipped })
        await fetchBookings()
      }
    } finally {
      setIsBatching(false)
    }
  }

  function openEditor(booking: BookingWithInvoice) {
    setEditorBooking(booking)
    setEditorFields(bookingToBillingFields(booking))
    setEditorError(null)
    setEditorSuccess(false)
  }

  function closeEditor() {
    setEditorBooking(null)
  }

  async function handleSaveEditor() {
    if (!editorBooking) return
    setIsSavingEditor(true)
    setEditorError(null)
    setEditorSuccess(false)
    try {
      const res = await fetch(`/api/invoice-requests/${editorBooking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorFields),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditorError(json.error ?? "Fehler beim Speichern")
        return
      }
      setEditorSuccess(true)
      await fetchBookings()
      // Refresh editor booking state
      setTimeout(() => setEditorSuccess(false), 3000)
    } finally {
      setIsSavingEditor(false)
    }
  }

  async function handleStornoRecreate() {
    if (!editorBooking) return
    setIsStornoLoading(true)
    setEditorError(null)
    try {
      // Save the current billing fields first
      await fetch(`/api/invoice-requests/${editorBooking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorFields),
      })
      // Then trigger storno + recreate
      const res = await fetch(`/api/invoices/${editorBooking.id}/storno-recreate`, {
        method: "POST",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditorError(json.error ?? "Storno fehlgeschlagen")
        return
      }
      await fetchBookings()
      closeEditor()
    } finally {
      setIsStornoLoading(false)
    }
  }

  const filteredBookings = useMemo(() => {
    const filtered = bookings.filter((b) => {
      if (activeTab === "all") return true
      if (b.bookingStatus === "cancelled") return activeTab === "cancelled"
      const status = b.invoice?.status ?? "pending"
      return status === activeTab
    })

    if (!sortField || !sortDir) return filtered

    return [...filtered].sort((a, b) => {
      let av: string | number = ""
      let bv: string | number = ""
      if (sortField === "smoobuId") { av = a.smoobuBookingId; bv = b.smoobuBookingId }
      else if (sortField === "guestName") { av = a.guestName; bv = b.guestName }
      else if (sortField === "property") { av = a.propertyName ?? ""; bv = b.propertyName ?? "" }
      else if (sortField === "checkin") { av = a.checkinDate; bv = b.checkinDate }
      else if (sortField === "checkout") { av = a.checkoutDate; bv = b.checkoutDate }
      else if (sortField === "amount") { av = a.totalAmount; bv = b.totalAmount }
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [bookings, activeTab, sortField, sortDir])

  function renderAction(booking: BookingWithInvoice) {
    if (booking.bookingStatus === "cancelled") {
      return (
        <Badge variant="destructive" className="text-xs">
          Storniert
        </Badge>
      )
    }

    const status = booking.invoice?.status ?? "pending"

    if (status === "pending" || status === "ready") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleCreateInvoice(booking.id)}
          aria-label={`Rechnung erstellen fuer ${booking.guestName}`}
        >
          Rechnung erstellen
        </Button>
      )
    }

    if (status === "error") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950"
          onClick={() => handleRetry(booking.id)}
          aria-label={`Erneut versuchen fuer ${booking.guestName}`}
        >
          Erneut versuchen
        </Button>
      )
    }

    if (status === "created" && booking.invoice?.lexwareInvoiceId) {
      return (
        <Button
          size="sm"
          variant="outline"
          asChild
          aria-label={`In Lexware oeffnen fuer ${booking.guestName}`}
        >
          <a
            href={`https://app.lexoffice.de/permalink/invoices/view/${booking.invoice.lexwareInvoiceId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            In Lexware
          </a>
        </Button>
      )
    }

    return null
  }

  const invoiceCreated = editorBooking?.invoice?.status === "created"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rechnungen</h1>
          <p className="text-sm text-muted-foreground">
            Buchungen und Rechnungsstatus verwalten
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Batch dialog */}
          <Dialog
            open={batchOpen}
            onOpenChange={(open) => {
              setBatchOpen(open)
              if (!open) setBatchResult(null)
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" aria-label="Rechnungen fuer Zeitraum erstellen">
                <CalendarRange className="mr-2 h-4 w-4" />
                Zeitraum-Rechnungen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Rechnungen fuer Zeitraum erstellen</DialogTitle>
                <DialogDescription>
                  Alle ausstehenden Buchungen im gewaehlten Anreise-Zeitraum werden
                  zur Rechnungserstellung vorgemerkt.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="batch-from">Anreise von</Label>
                    <Input
                      id="batch-from"
                      type="date"
                      value={batchFrom}
                      onChange={(e) => setBatchFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch-to">Anreise bis</Label>
                    <Input
                      id="batch-to"
                      type="date"
                      value={batchTo}
                      onChange={(e) => setBatchTo(e.target.value)}
                      min={batchFrom}
                    />
                  </div>
                </div>
                {batchResult && (
                  <p className="rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-300">
                    {batchResult.scheduled} Rechnung{batchResult.scheduled !== 1 ? "en" : ""} vorgemerkt
                    {batchResult.skipped > 0 && ` · ${batchResult.skipped} uebersprungen`}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBatchOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleBatch}
                  disabled={!batchFrom || !batchTo || isBatching}
                >
                  {isBatching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarRange className="mr-2 h-4 w-4" />
                  )}
                  {isBatching ? "Wird verarbeitet..." : "Vormerken"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            onClick={handleSync}
            disabled={isSyncing}
            aria-label="Buchungen synchronisieren"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Synchronisiere..." : "Buchungen synchronisieren"}
          </Button>
        </div>
      </div>

      {/* Tabs + Table */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabFilter)}
      >
        <TabsList className="flex-wrap">
          {TAB_FILTERS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_FILTERS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {isLoading ? (
              <LoadingSkeleton />
            ) : filteredBookings.length === 0 ? (
              <EmptyState filter={t.label} />
            ) : (
              <BookingsTable
                bookings={filteredBookings}
                renderAction={renderAction}
                onGenerateLink={handleGenerateLink}
                onCopyLink={handleCopyLink}
                onEdit={openEditor}
                generatingLinkFor={generatingLinkFor}
                copiedToken={copiedToken}
                sortField={sortField}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Invoice Editor Sheet */}
      <Sheet open={!!editorBooking} onOpenChange={(open) => { if (!open) closeEditor() }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Rechnungsdaten bearbeiten</SheetTitle>
            <SheetDescription>
              {editorBooking && (
                <>
                  {editorBooking.guestName} · {editorBooking.propertyName}
                  <br />
                  {formatDate(editorBooking.checkinDate)} – {formatDate(editorBooking.checkoutDate)}
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Warning if invoice already created */}
            {invoiceCreated && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Fuer diese Buchung wurde bereits eine Rechnung in Lexware erstellt
                  ({editorBooking?.invoice?.lexwareInvoiceNumber ?? editorBooking?.invoice?.lexwareInvoiceId}).
                  Aenderungen erfordern eine Stornierung und Neuerstellung.
                </AlertDescription>
              </Alert>
            )}

            {editorError && (
              <Alert variant="destructive">
                <AlertDescription>{editorError}</AlertDescription>
              </Alert>
            )}

            {editorSuccess && (
              <Alert className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">
                <AlertDescription>Rechnungsdaten gespeichert.</AlertDescription>
              </Alert>
            )}

            {/* Name */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Kontaktperson</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editor-firstName">Vorname</Label>
                  <Input
                    id="editor-firstName"
                    value={editorFields.firstName}
                    onChange={(e) => setEditorFields((p) => ({ ...p, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editor-lastName">Nachname</Label>
                  <Input
                    id="editor-lastName"
                    value={editorFields.lastName}
                    onChange={(e) => setEditorFields((p) => ({ ...p, lastName: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Company */}
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Unternehmen <span className="text-muted-foreground font-normal">(optional)</span>
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editor-companyName">Firmenname</Label>
                  <Input
                    id="editor-companyName"
                    value={editorFields.companyName}
                    onChange={(e) => setEditorFields((p) => ({ ...p, companyName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editor-vatId">USt-IdNr.</Label>
                  <Input
                    id="editor-vatId"
                    value={editorFields.vatId}
                    onChange={(e) => setEditorFields((p) => ({ ...p, vatId: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Rechnungsadresse</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editor-street">Strasse und Hausnummer</Label>
                  <Input
                    id="editor-street"
                    value={editorFields.street}
                    onChange={(e) => setEditorFields((p) => ({ ...p, street: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="editor-zip">PLZ</Label>
                    <Input
                      id="editor-zip"
                      value={editorFields.zip}
                      onChange={(e) => setEditorFields((p) => ({ ...p, zip: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="editor-city">Ort</Label>
                    <Input
                      id="editor-city"
                      value={editorFields.city}
                      onChange={(e) => setEditorFields((p) => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editor-countryCode">Land</Label>
                  <Select
                    value={editorFields.countryCode}
                    onValueChange={(v) => setEditorFields((p) => ({ ...p, countryCode: v }))}
                  >
                    <SelectTrigger id="editor-countryCode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EU_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Email */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Rechnungsversand</p>
              <div className="space-y-1.5">
                <Label htmlFor="editor-email">E-Mail-Adresse</Label>
                <Input
                  id="editor-email"
                  type="email"
                  value={editorFields.email}
                  onChange={(e) => setEditorFields((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="mt-6 flex-col gap-2">
            {/* Storno + Recreate button (only when invoice already created) */}
            {invoiceCreated && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleStornoRecreate}
                disabled={isStornoLoading || isSavingEditor}
              >
                {isStornoLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isStornoLoading ? "Wird storniert..." : "Stornieren & Neu erstellen"}
              </Button>
            )}

            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={closeEditor}
                disabled={isSavingEditor || isStornoLoading}
              >
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveEditor}
                disabled={isSavingEditor || isStornoLoading}
              >
                {isSavingEditor && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSavingEditor ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// -- Sub-components -----------------------------------------------------------

const LINK_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "Link erstellt", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400" },
  opened: { label: "Geöffnet", className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400" },
  submitted: { label: "Ausgefüllt", className: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400" },
  invoice_created: { label: "Rechnung erstellt", className: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400" },
}

function BookingsTable({
  bookings,
  renderAction,
  onGenerateLink,
  onCopyLink,
  onEdit,
  generatingLinkFor,
  copiedToken,
  sortField,
  sortDir,
  onSort,
}: {
  bookings: BookingWithInvoice[]
  renderAction: (b: BookingWithInvoice) => React.ReactNode
  onGenerateLink: (bookingId: string) => void
  onCopyLink: (token: string) => void
  onEdit: (booking: BookingWithInvoice) => void
  generatingLinkFor: string | null
  copiedToken: string | null
  sortField: string | null
  sortDir: SortDirection
  onSort: (field: string) => void
}) {
  return (
    <TooltipProvider>
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Buchungs-ID" field="smoobuId" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            <SortableTableHead label="Gastname" field="guestName" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            <SortableTableHead label="Objekt" field="property" currentField={sortField} currentDir={sortDir} onSort={onSort} className="hidden md:table-cell" />
            <SortableTableHead label="Anreise" field="checkin" currentField={sortField} currentDir={sortDir} onSort={onSort} className="hidden lg:table-cell" />
            <SortableTableHead label="Abreise" field="checkout" currentField={sortField} currentDir={sortDir} onSort={onSort} className="hidden lg:table-cell" />
            <SortableTableHead label="Betrag" field="amount" currentField={sortField} currentDir={sortDir} onSort={onSort} className="text-right" />
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Formular</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking.id}>
              <TableCell className="font-mono text-sm">
                {booking.smoobuBookingId}
              </TableCell>
              <TableCell className="font-medium">
                {booking.guestName}
              </TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">
                {booking.propertyName}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {formatDate(booking.checkinDate)}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {formatDate(booking.checkoutDate)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(booking.totalAmount)}
              </TableCell>
              <TableCell>{getStatusBadge(booking)}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {booking.bookingStatus !== "cancelled" && (
                  <div className="flex items-center gap-1.5">
                    {booking.invoiceRequest ? (
                      <>
                        <Badge
                          variant="outline"
                          className={`text-xs ${LINK_STATUS_MAP[booking.invoiceRequest.status]?.className ?? ""}`}
                        >
                          {LINK_STATUS_MAP[booking.invoiceRequest.status]?.label}
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => onCopyLink(booking.invoiceRequest!.token)}
                              aria-label="Link kopieren"
                            >
                              {copiedToken === booking.invoiceRequest.token ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-medium mb-1">Link kopieren</p>
                            <p className="text-xs text-muted-foreground break-all">
                              {typeof window !== "undefined"
                                ? `${window.location.origin}/invoice-form/${booking.invoiceRequest.token}`
                                : `/invoice-form/${booking.invoiceRequest.token}`}
                            </p>
                            <p className="text-xs mt-1 text-amber-600">⚠ Kein automatischer E-Mail-Versand — Link manuell an Gast weiterleiten</p>
                          </TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onGenerateLink(booking.id)}
                        disabled={generatingLinkFor === booking.id}
                        aria-label="Formular-Link generieren"
                      >
                        {generatingLinkFor === booking.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Link2 className="mr-1 h-3 w-3" />
                        )}
                        Link generieren
                      </Button>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {booking.bookingStatus !== "cancelled" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => onEdit(booking)}
                          aria-label="Rechnungsdaten bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Rechnungsdaten bearbeiten</TooltipContent>
                    </Tooltip>
                  )}
                  {renderAction(booking)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  )
}

function LoadingSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Buchungs-ID</TableHead>
            <TableHead>Gastname</TableHead>
            <TableHead className="hidden md:table-cell">Objekt</TableHead>
            <TableHead className="hidden lg:table-cell">Anreise</TableHead>
            <TableHead className="hidden lg:table-cell">Abreise</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-28" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-16 text-center">
      <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Keine Buchungen</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {filter === "Alle"
          ? "Es wurden noch keine Buchungen synchronisiert."
          : `Keine Buchungen mit Status "${filter}" gefunden.`}
      </p>
      {filter === "Alle" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Klicken Sie auf &quot;Buchungen synchronisieren&quot; um Buchungen aus
          Smoobu zu laden.
        </p>
      )}
    </div>
  )
}
