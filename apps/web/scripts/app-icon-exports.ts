// Store/listing rasters regenerated from public/icon.svg. 192 and 512 are the
// PWA/Play sizes the manifest already ships; 1024 is the App Store listing.

export const APP_ICON_SOURCE = 'public/icon.svg'

export const APP_ICON_EXPORTS: Array<{
  file: string
  size: number
  format: 'png'
}> = [
  { file: 'logo192.png', size: 192, format: 'png' },
  { file: 'logo512.png', size: 512, format: 'png' },
  { file: 'logo1024.png', size: 1024, format: 'png' },
]
