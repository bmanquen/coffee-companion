import { espressoDevicesFrom } from './devices'

describe('espressoDevicesFrom', () => {
  it('keeps only Espresso-type brewing devices', () => {
    expect(
      espressoDevicesFrom([
        { id: 'esp', name: 'Linea Mini', type: { name: 'Espresso' } },
        { id: 'aero', name: 'AeroPress Go', type: { name: 'AeroPress' } },
      ]),
    ).toEqual([{ id: 'esp', name: 'Linea Mini' }])
  })
})
