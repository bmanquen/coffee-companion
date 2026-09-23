import { createColumnHelper } from '@tanstack/react-table'
import { Crosshair } from 'lucide-react'
import type { ReactNode } from 'react'
import { DialedInToggleCell } from '@/components/brews/dialed-in-toggle-cell'
import { SealedBrewNotice } from '@/components/brews/sealed-brew-notice'
import { DetailList } from '@/components/detail-list'
import { daysOffRoast as computeDaysOffRoast } from '@/lib/brew'

type DeviceDialedIn = {
  dialedIn: boolean
  deviceName: string
  onToggle: () => void
}

export function deviceDialedInFor(
  brew: {
    id: string
    brewingDeviceId: string | null
    brewingDevice: { name: string } | null
  },
  control: {
    isDialedIn: (brewId: string, deviceId: string) => boolean
    toggle: (brew: { id: string; brewingDeviceId: string | null }) => void
  },
): DeviceDialedIn | undefined {
  if (!brew.brewingDeviceId || !brew.brewingDevice) return undefined
  return {
    dialedIn: control.isDialedIn(brew.id, brew.brewingDeviceId),
    deviceName: brew.brewingDevice.name,
    onToggle: () => control.toggle(brew),
  }
}

// The expandable detail region shared by every brew surface — the dashboard
// feeds and the Brews-page method sections alike — revealed when a card or a
// desktop table row is expanded (see ADR-0003: desktop tables mirror the card's
// summary/expander split). Holds the fields demoted out of the minimal summary:
// grinder, device, days off roast, notes, and the one method-specific `extra`
// slot (Water temp for pour over/french press, Environment for cold brew;
// espresso and aeropress omit it). The dial-in summary already carries grind,
// weights and time (see ADR-0002), so none of those repeat here.
// `daysOffRoast` undefined -> its row is hidden.
export function BrewDetails({
  grinder,
  device,
  extra,
  daysOffRoast,
  notes,
  deviceDialedIn,
}: {
  grinder: { name: string; brand: string }
  device: { name: string; brand: string }
  extra?: { label: string; value: string }
  daysOffRoast?: number | null
  notes: string | null
  deviceDialedIn?: DeviceDialedIn
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Grinder', value: `${grinder.name} (${grinder.brand})` },
    { label: 'Device', value: `${device.name} (${device.brand})` },
    ...(extra ? [{ label: extra.label, value: extra.value }] : []),
    ...(daysOffRoast !== undefined
      ? [
          {
            label: 'Days off roast',
            value: daysOffRoast != null ? `${daysOffRoast}d` : '-',
          },
        ]
      : []),
    ...(deviceDialedIn
      ? [
          {
            label: 'Dialed-in for device',
            value: (
              <span className="flex items-center gap-2">
                <DialedInToggleCell
                  dialedIn={deviceDialedIn.dialedIn}
                  onLabel={`Dialed in for ${deviceDialedIn.deviceName} — clear`}
                  offLabel={`Mark as dialed in for ${deviceDialedIn.deviceName}`}
                  onToggle={deviceDialedIn.onToggle}
                />
                <span>{deviceDialedIn.deviceName}</span>
              </span>
            ),
          },
        ]
      : []),
  ]

  return <DetailList rows={rows} notes={notes} />
}

// The data a brew detail sub-row reads, kept structural so any surface's row type
// (the Brews-page sections' narrow types and the dashboard feeds' *WithRelations)
// satisfies it without adaptation.
type BrewDetailData = {
  grinder: { name: string; brand: string } | null
  brewingDevice: { name: string; brand: string } | null
  roastDate: string | null
  createdAt: Date
  notes: string | null
  sealed?: boolean
}

// Renders a brew's shared detail sub-row from any surface — a Brews-page section
// or a dashboard feed. Centralises the grinder/device/days-off-roast/notes wiring
// that is identical everywhere; `extra` carries the method's odd-one-out lever
// (build it with waterTempExtra / brewEnvironmentExtra below).
export function renderBrewDetails(
  brew: BrewDetailData,
  extra?: { label: string; value: string },
  deviceDialedIn?: DeviceDialedIn,
) {
  // A Sealed Brew has no settings to reveal, so the detail region carries the
  // way to reopen it instead.
  if (brew.sealed || !brew.grinder || !brew.brewingDevice) {
    return <SealedBrewNotice />
  }

  return (
    <BrewDetails
      grinder={brew.grinder}
      device={brew.brewingDevice}
      extra={extra}
      daysOffRoast={computeDaysOffRoast(brew.roastDate, brew.createdAt)}
      notes={brew.notes}
      deviceDialedIn={deviceDialedIn}
    />
  )
}

// The Water temp lever (pour over / french press) — shown only when recorded.
export function waterTempExtra(waterTemp: number | null) {
  return waterTemp != null
    ? { label: 'Water temp', value: `${waterTemp}°C` }
    : undefined
}

// The Brew Environment lever (cold brew) — shown only when recorded.
export function brewEnvironmentExtra(brewEnvironment: string | null) {
  return brewEnvironment
    ? { label: 'Brew Environment', value: brewEnvironment }
    : undefined
}

// The "Coffee" column shared by the recent dashboard cards, prefixing the coffee
// name with a dialed-in crosshair icon. (The dialed-in cards use a plain coffee
// column, since every row there is dialed in.)
export function dialedInCoffeeColumn<
  T extends { isDialedIn: boolean; coffee: { name: string } },
>() {
  return createColumnHelper<T>().accessor((row) => row.coffee.name, {
    id: 'coffee',
    header: 'Coffee',
    cell: (info) => (
      <span className="flex items-center gap-1.5">
        {info.row.original.isDialedIn && (
          <Crosshair
            aria-label="Dialed in"
            className="h-4 w-4 shrink-0 text-primary"
          />
        )}
        {info.getValue()}
      </span>
    ),
    meta: { cardTitle: true },
  })
}
