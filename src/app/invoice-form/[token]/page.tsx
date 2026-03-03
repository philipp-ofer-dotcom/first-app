"use client"

import { useState, useEffect, use } from "react"
import { Loader2, CheckCircle, Clock, Home } from "lucide-react"

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
import { Separator } from "@/components/ui/separator"

// ---- Types ------------------------------------------------------------------

interface BookingInfo {
  smoobuBookingId: string
  guestName: string
  checkinDate: string
  checkoutDate: string
  propertyName: string
}

interface FormValues {
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

type PageStatus =
  | "loading"
  | "form"
  | "already_submitted"
  | "invoice_created"
  | "expired"
  | "not_found"
  | "success"
  | "error"

// ---- Helpers ----------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z")
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
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

// ---- Page -------------------------------------------------------------------

export default function InvoiceFormPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [pageStatus, setPageStatus] = useState<PageStatus>("loading")
  const [booking, setBooking] = useState<BookingInfo | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState<FormValues>({
    firstName: "",
    lastName: "",
    companyName: "",
    street: "",
    zip: "",
    city: "",
    countryCode: "DE",
    vatId: "",
    email: "",
  })

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/invoice-form/${token}`)
        if (res.status === 404) { setPageStatus("not_found"); return }
        if (res.status === 410) { setPageStatus("expired"); return }
        if (!res.ok) { setPageStatus("error"); return }

        const json = await res.json()

        if (json.status === "submitted" || json.status === "invoice_created") {
          setPageStatus(
            json.status === "invoice_created" ? "invoice_created" : "already_submitted"
          )
          return
        }

        setBooking(json.booking)

        if (json.formData) {
          setForm({
            firstName: json.formData.firstName || "",
            lastName: json.formData.lastName || "",
            companyName: json.formData.companyName || "",
            street: json.formData.street || "",
            zip: json.formData.zip || "",
            city: json.formData.city || "",
            countryCode: json.formData.countryCode || "DE",
            vatId: json.formData.vatId || "",
            email: json.formData.email || "",
          })
        }

        setPageStatus("form")
      } catch {
        setPageStatus("error")
      }
    }
    load()
  }, [token])

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!form.firstName.trim()) newErrors.firstName = "Pflichtfeld"
    if (!form.lastName.trim()) newErrors.lastName = "Pflichtfeld"
    if (!form.street.trim()) newErrors.street = "Pflichtfeld"
    if (!form.zip.trim()) newErrors.zip = "Pflichtfeld"
    if (!form.city.trim()) newErrors.city = "Pflichtfeld"
    if (!form.email.trim()) newErrors.email = "Pflichtfeld"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Ungueltige E-Mail-Adresse"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/invoice-form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (res.status === 409) {
        setPageStatus("already_submitted")
        return
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (json.details) {
          const fieldErrors: Record<string, string> = {}
          Object.entries(json.details).forEach(([k, v]) => {
            fieldErrors[k] = Array.isArray(v) ? v[0] : String(v)
          })
          setErrors(fieldErrors)
        }
        return
      }

      setPageStatus("success")
    } finally {
      setIsSubmitting(false)
    }
  }

  function field(
    id: keyof FormValues,
    label: string,
    required = false,
    type = "text"
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Input
          id={id}
          type={type}
          value={form[id]}
          onChange={(e) => setForm((p) => ({ ...p, [id]: e.target.value }))}
          className={errors[id] ? "border-destructive" : ""}
          autoComplete={id === "email" ? "email" : undefined}
        />
        {errors[id] && (
          <p className="text-xs text-destructive">{errors[id]}</p>
        )}
      </div>
    )
  }

  // ---- Render states --------------------------------------------------------

  if (pageStatus === "loading") {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageWrapper>
    )
  }

  if (pageStatus === "expired") {
    return (
      <PageWrapper>
        <StatusCard
          icon={<Clock className="h-12 w-12 text-muted-foreground" />}
          title="Link abgelaufen"
          description="Dieser Link ist leider nicht mehr gueltig. Bitte kontaktieren Sie uns direkt."
        />
      </PageWrapper>
    )
  }

  if (pageStatus === "not_found" || pageStatus === "error") {
    return (
      <PageWrapper>
        <StatusCard
          icon={<Home className="h-12 w-12 text-muted-foreground" />}
          title="Link nicht gefunden"
          description="Dieser Link existiert nicht. Bitte pruefen Sie die URL oder kontaktieren Sie uns."
        />
      </PageWrapper>
    )
  }

  if (pageStatus === "already_submitted") {
    return (
      <PageWrapper>
        <StatusCard
          icon={<CheckCircle className="h-12 w-12 text-green-500" />}
          title="Daten bereits eingereicht"
          description="Sie haben Ihre Rechnungsdaten bereits erfolgreich uebermittelt. Wir werden die Rechnung bald erstellen."
          success
        />
      </PageWrapper>
    )
  }

  if (pageStatus === "invoice_created") {
    return (
      <PageWrapper>
        <StatusCard
          icon={<CheckCircle className="h-12 w-12 text-green-500" />}
          title="Rechnung wurde bereits erstellt"
          description="Die Rechnung fuer diese Buchung wurde bereits erstellt und versendet."
          success
        />
      </PageWrapper>
    )
  }

  if (pageStatus === "success") {
    return (
      <PageWrapper>
        <StatusCard
          icon={<CheckCircle className="h-12 w-12 text-green-500" />}
          title="Vielen Dank!"
          description="Ihre Rechnungsdaten wurden erfolgreich gespeichert. Die Rechnung wird nach Ihrem Anreisetag per E-Mail zugeschickt."
          success
        />
      </PageWrapper>
    )
  }

  // ---- Main form ------------------------------------------------------------

  return (
    <PageWrapper>
      {/* Booking info */}
      {booking && (
        <Card className="mb-6 bg-muted/40">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Ihre Buchung
            </p>
            <p className="font-semibold">{booking.propertyName}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(booking.checkinDate)} – {formatDate(booking.checkoutDate)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Buchungs-Nr.: {booking.smoobuBookingId}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Rechnungsdaten</CardTitle>
          <CardDescription>
            Bitte geben Sie die Daten an, die auf Ihrer Rechnung erscheinen sollen.
            Pflichtfelder sind mit <span className="text-destructive">*</span> markiert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Name */}
            <div>
              <p className="text-sm font-medium mb-3">Kontaktperson</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("firstName", "Vorname", true)}
                {field("lastName", "Nachname", true)}
              </div>
            </div>

            <Separator />

            {/* Company */}
            <div>
              <p className="text-sm font-medium mb-3">
                Unternehmen{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </p>
              <div className="space-y-4">
                {field("companyName", "Firmenname")}
                {field("vatId", "USt-IdNr.")}
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div>
              <p className="text-sm font-medium mb-3">Rechnungsadresse</p>
              <div className="space-y-4">
                {field("street", "Strasse und Hausnummer", true)}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    {field("zip", "PLZ", true)}
                  </div>
                  <div className="col-span-2">
                    {field("city", "Ort", true)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="countryCode">Land</Label>
                  <Select
                    value={form.countryCode}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, countryCode: v }))
                    }
                  >
                    <SelectTrigger id="countryCode">
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
            <div>
              <p className="text-sm font-medium mb-3">Rechnungsversand</p>
              {field("email", "E-Mail-Adresse fuer Rechnungsversand", true, "email")}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubmitting ? "Wird gespeichert..." : "Rechnungsdaten absenden"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageWrapper>
  )
}

// ---- Layout helpers ---------------------------------------------------------

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Rechnungsformular</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bitte geben Sie Ihre Rechnungsdaten ein
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

function StatusCard({
  icon,
  title,
  description,
  success = false,
}: {
  icon: React.ReactNode
  title: string
  description: string
  success?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-12 text-center">
        <div className="mb-4">{icon}</div>
        <h2
          className={`text-xl font-semibold ${success ? "text-green-700 dark:text-green-400" : ""}`}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">{description}</p>
      </CardContent>
    </Card>
  )
}
