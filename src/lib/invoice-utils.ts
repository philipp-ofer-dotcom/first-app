// PROJ-3: Shared utilities for invoice scheduling and Lexware payload building

import type { TimingType } from "./types"

// Calculate the scheduled_for timestamp based on timing settings
export function calculateScheduledFor(
  checkinDate: string,
  checkoutDate: string,
  timingType: TimingType,
  timingDays: number
): Date {
  const checkin = new Date(checkinDate + "T00:00:00Z")
  const checkout = new Date(checkoutDate + "T00:00:00Z")

  switch (timingType) {
    case "before_checkin":
      return new Date(checkin.getTime() - timingDays * 24 * 60 * 60 * 1000)
    case "on_checkin":
      return checkin
    case "after_checkin":
      return new Date(checkin.getTime() + timingDays * 24 * 60 * 60 * 1000)
    case "on_checkout":
      return checkout
    case "after_checkout":
      return new Date(checkout.getTime() + timingDays * 24 * 60 * 60 * 1000)
  }
}

export function calculateNights(checkinDate: string, checkoutDate: string): number {
  const checkin = new Date(checkinDate + "T00:00:00Z")
  const checkout = new Date(checkoutDate + "T00:00:00Z")
  const diff = checkout.getTime() - checkin.getTime()
  return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)))
}

function formatGermanDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = d.getUTCFullYear()
  return `${day}.${month}.${year}`
}

// ---- Lexware payload types ------------------------------------------------

export interface LexwareAddress {
  name: string
  street?: string
  zip?: string
  city?: string
  countryCode?: string
}

export interface LexwareLineItem {
  type: "custom"
  name: string
  description?: string
  quantity: number
  unitName: string
  unitPrice: {
    currency: "EUR"
    netAmount: number
    taxRatePercentage: number
  }
  discountPercentage: number
}

export interface LexwareInvoicePayload {
  type: "invoice"
  voucherDate: string
  address: LexwareAddress
  lineItems: LexwareLineItem[]
  taxConditions: { taxType: string }
  shippingConditions: { shippingType: string }
  remark?: string
}

export interface CityTaxData {
  isActive: boolean
  amountPerPersonNight: number
  taxLabel: string | null
}

export interface GuestBillingData {
  name?: string
  companyName?: string
  street?: string
  zip?: string
  city?: string
  countryCode?: string
}

// Build a Lexware Office invoice payload from booking data
export function buildLexwarePayload(params: {
  guestName: string
  guestAddress?: { street?: string; zip?: string; city?: string; countryCode?: string } | null
  propertyName: string
  smoobuBookingId: string
  checkinDate: string
  checkoutDate: string
  totalAmount: number
  numGuests: number
  cityTax?: CityTaxData | null
  guestBillingData?: GuestBillingData | null
}): LexwareInvoicePayload {
  const {
    guestName,
    guestAddress,
    propertyName,
    smoobuBookingId,
    checkinDate,
    checkoutDate,
    totalAmount,
    numGuests,
    cityTax,
    guestBillingData,
  } = params

  const nights = calculateNights(checkinDate, checkoutDate)
  const checkinFmt = formatGermanDate(checkinDate)
  const checkoutFmt = formatGermanDate(checkoutDate)

  // PROJ-4: prefer guest billing data when available
  const billingName =
    guestBillingData?.companyName || guestBillingData?.name || guestName
  const billingAddr = guestBillingData ?? guestAddress

  const address: LexwareAddress = {
    name: billingName,
    street: billingAddr?.street,
    zip: billingAddr?.zip,
    city: billingAddr?.city,
    countryCode: billingAddr?.countryCode ?? "DE",
  }

  // Calculate city tax total (if active)
  // City tax is included in the Smoobu totalAmount — so we subtract it from the
  // accommodation line to avoid double-counting on the invoice.
  let cityTaxTotal = 0
  if (cityTax?.isActive && cityTax.amountPerPersonNight > 0) {
    cityTaxTotal = Math.round(numGuests * nights * cityTax.amountPerPersonNight * 100) / 100
  }

  const accommodationTotal = Math.max(0, totalAmount - cityTaxTotal)
  const nightlyRate = nights > 0 ? accommodationTotal / nights : accommodationTotal

  const lineItems: LexwareLineItem[] = [
    {
      type: "custom",
      name: `Unterkunft: ${propertyName}`,
      description:
        `Buchungs-ID: ${smoobuBookingId} | Anreise: ${checkinFmt} | Abreise: ${checkoutFmt}` +
        ` | ${nights} Nacht${nights !== 1 ? "e" : ""}, ${numGuests} Person${numGuests !== 1 ? "en" : ""}`,
      quantity: Math.max(nights, 1),
      unitName: "Nacht",
      unitPrice: {
        currency: "EUR",
        netAmount: Math.round(nightlyRate * 100) / 100,
        taxRatePercentage: 0,
      },
      discountPercentage: 0,
    },
  ]

  if (cityTax?.isActive && cityTaxTotal > 0) {
    lineItems.push({
      type: "custom",
      name: cityTax.taxLabel || "Kurtaxe",
      description: `${numGuests} Person${numGuests !== 1 ? "en" : ""} × ${nights} Nacht${nights !== 1 ? "e" : ""} × ${cityTax.amountPerPersonNight.toFixed(2)} €`,
      quantity: 1,
      unitName: "Pauschale",
      unitPrice: {
        currency: "EUR",
        netAmount: cityTaxTotal,
        taxRatePercentage: 0,  // City tax is VAT-exempt (0%)
      },
      discountPercentage: 0,
    })
  }

  return {
    type: "invoice",
    voucherDate: new Date().toISOString().split("T")[0],
    address,
    lineItems,
    taxConditions: { taxType: "vatfree" },
    shippingConditions: { shippingType: "none" },
    remark: `Smoobu Buchungs-ID: ${smoobuBookingId}`,
  }
}
