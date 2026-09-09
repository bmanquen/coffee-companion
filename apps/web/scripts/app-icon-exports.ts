// Store/listing rasters regenerated from public/icon.svg. 192 and 512 are the
// PWA/Play sizes the manifest already ships; 1024 is the App Store listing.
// favicon.ico is the same mark at the small sizes the manifest already lists
// for the tab — regenerating PNGs alone left the tab on the scaffold .ico.

export const APP_ICON_SOURCE = 'public/icon.svg'

export const APP_ICON_EXPORTS: Array<
  | { file: string; size: number; format: 'png' }
  | { file: string; sizes: number[]; format: 'ico' }
> = [
  { file: 'logo192.png', size: 192, format: 'png' },
  { file: 'logo512.png', size: 512, format: 'png' },
  { file: 'logo1024.png', size: 1024, format: 'png' },
  { file: 'favicon.ico', sizes: [16, 24, 32, 64], format: 'ico' },
]
