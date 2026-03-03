"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, ExternalLink, FileText, CalendarRange, Loader2, Link2, Copy, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { BookingWithInvoice, InvoiceStatus } from "@/lib/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

  const map: Record<
    InvoiceStatus,
    { label: string; className: string }
  > = {
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

// -- Component ----------------------------------------------------------------

export default function InvoicesPage() {
  const [bookings, setBookings] = useState<BookingWithInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabFilter>("all")
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchFrom, setBatchFrom] = useState("")
  const [batchTo, setBatchTo] = useState("")
  const [isBatching, setIsBatching] = useState(false)
  const [batchResult, setBatchResult] = useState<{ scheduled: number; skipped: number } | null>(null)

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

  const filteredBookings = bookings.filter((b) => {
    if (activeTab === "all") return true
    if (b.bookingStatus === "cancelled") return activeTab === "cancelled"
    const status = b.invoice?.status ?? "pending"
    return status === activeTab
  })

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
                generatingLinkFor={generatingLinkFor}
                copiedToken={copiedToken}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// -- Sub-components -----------------------------------------------------------

const LINK_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "Versendet", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400" },
  opened: { label: "Geoeffnet", className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400" },
  submitted: { label: "Ausgefuellt", className: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400" },
  invoice_created: { label: "Rechnung erstellt", className: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400" },
}

function BookingsTable({
  bookings,
  renderAction,
  onGenerateLink,
  onCopyLink,
  generatingLinkFor,
  copiedToken,
}: {
  bookings: BookingWithInvoice[]
  renderAction: (b: BookingWithInvoice) => React.ReactNode
  onGenerateLink: (bookingId: string) => void
  onCopyLink: (token: string) => void
  generatingLinkFor: string | null
  copiedToken: string | null
}) {
  return (
    <TooltipProvider>
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
                          <TooltipContent>Link kopieren</TooltipContent>
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
                {renderAction(booking)}
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
