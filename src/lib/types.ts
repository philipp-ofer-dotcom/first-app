// PROJ-1: Plattform-Integration & Grundeinstellungen — TypeScript interfaces

export type PlatformType = "smoobu" | "lexware"

export type TestStatus = "success" | "error" | "untested"

export interface IntegrationSetting {
  id: string
  platform: PlatformType
  hasApiKey: boolean
  lastTestedAt: string | null
  lastTestStatus: TestStatus
  lastErrorMsg: string | null
}

export interface Property {
  id: string
  smoobuId: string
  name: string
  location: string
  displayName: string | null
  notes: string | null
  isActive: boolean
  isArchived: boolean
  syncedAt: string | null
}

export interface StatusCardProps {
  title: string
  description: string
  status: TestStatus
  lastTestedAt: string | null
  errorMessage?: string | null
  isLoading?: boolean
}

export interface IntegrationCardProps {
  platform: PlatformType
  title: string
  description: string
  hasApiKey: boolean
  lastTestStatus: TestStatus
  lastTestedAt: string | null
  lastErrorMsg: string | null
  onSave: (apiKey: string) => Promise<void>
  onTest: () => Promise<void>
  isSaving?: boolean
  isTesting?: boolean
}

export interface PropertyRowProps {
  property: Property
  onToggleActive: (id: string, isActive: boolean) => void
  onUpdateNotes: (id: string, notes: string) => void
}

// PROJ-2: City Tax Konfiguration

export interface AgeGroup {
  id: string
  ageFrom: number | null
  ageTo: number | null
  percentage: number
}

export interface CityTaxConfig {
  id: string
  propertyId: string
  isActive: boolean
  taxLabel: string
  amountPerPersonNight: number
  showSeparately: boolean
  validFrom: string
  ageGroups: AgeGroup[]
  createdAt: string
  isFuture?: boolean
}

export interface PropertyWithCityTax extends Property {
  cityTaxConfig: CityTaxConfig | null
  allCityTaxConfigs?: CityTaxConfig[]
}

// PROJ-3: Automatische Rechnungserstellung (Smoobu → Lexware)

export type TimingType =
  | "before_checkin"
  | "on_checkin"
  | "after_checkin"
  | "on_checkout"
  | "after_checkout"

export type InvoiceMode = "automatic" | "manual"

export interface InvoiceTimingSetting {
  id: string
  propertyId: string | null
  timingType: TimingType
  timingDays: number
  invoiceMode: InvoiceMode
}

export type BookingStatus = "confirmed" | "cancelled"

export type InvoiceStatus =
  | "pending"
  | "ready"
  | "creating"
  | "created"
  | "error"
  | "skipped"
  | "cancelled"

export interface Booking {
  id: string
  smoobuBookingId: string
  propertyId: string
  propertyName: string
  guestName: string
  guestEmail: string | null
  checkinDate: string
  checkoutDate: string
  totalAmount: number
  numGuests: number
  bookingStatus: BookingStatus
}

export interface Invoice {
  id: string
  bookingId: string
  status: InvoiceStatus
  scheduledFor: string | null
  lexwareInvoiceId: string | null
  lexwareInvoiceNumber: string | null
  errorMessage: string | null
  retryCount: number
}

export interface BookingWithInvoice extends Booking {
  invoice?: Invoice
  invoiceRequest?: InvoiceRequest
}

// PROJ-4: Gäste-Rechnungsformular

export type InvoiceRequestStatus = "pending" | "opened" | "submitted" | "invoice_created"

export interface InvoiceRequest {
  id: string
  token: string
  bookingId: string
  status: InvoiceRequestStatus
  firstName: string | null
  lastName: string | null
  companyName: string | null
  street: string | null
  zip: string | null
  city: string | null
  countryCode: string
  vatId: string | null
  email: string | null
  expiresAt: string
  submittedAt: string | null
}

// PROJ-5: Beleg-Download

export type ReceiptPlatform = "airbnb" | "booking" | "smoobu" | "manual"

export type ReceiptStatus =
  | "pending"
  | "downloading"
  | "downloaded"
  | "error"
  | "transferred"

export interface Receipt {
  id: string
  platform: ReceiptPlatform
  bookingReference: string | null
  bookingId: string | null
  status: ReceiptStatus
  fileName: string | null
  fileSizeBytes: number | null
  receiptDate: string | null
  amount: number | null
  errorMessage: string | null
  notes: string | null
  transferredAt: string | null
  lexwareDocumentId: string | null
  createdAt: string
  updatedAt: string
  booking: {
    smoobuBookingId: string
    guestName: string
    checkinDate: string
    checkoutDate: string
    propertyName: string
  } | null
}

export interface PlatformCredentials {
  platform: string
  hasEmail: boolean
  email: string | null
  n8nWebhookUrl: string | null
  lastLoginAt: string | null
  lastError: string | null
  isActive: boolean
  updatedAt: string
}

export interface GuestBillingFormData {
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
