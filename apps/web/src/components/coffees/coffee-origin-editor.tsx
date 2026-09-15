import { useStore } from '@tanstack/react-form'
import { CoffeeOriginFields } from './coffee-origin-fields'
import { CoffeeOriginRow } from './coffee-origin-row'
import { emptyOrigin } from './coffee-form'
import type { CoffeeFormValues } from './coffee-form'
import type { useSearchSelectResource } from '@/hooks/use-search-select-resource'
import { withForm } from '@/hooks/form'

export const CoffeeOriginEditor = withForm({
  defaultValues: {
    name: '',
    roasterId: '',
    roastLevelId: '',
    origins: [{ ...emptyOrigin }],
  } as CoffeeFormValues,
  props: {
    countries: {} as ReturnType<typeof useSearchSelectResource>,
  },
  render: function Render({ form, countries }) {
    const origins = useStore(form.store, (s) => s.values.origins)
    const usedCountryIds = new Set(
      origins.map((origin) => origin.countryId).filter(Boolean),
    )

    return (
      <CoffeeOriginFields
        onAddOrigin={() =>
          form.setFieldValue('origins', [...origins, { ...emptyOrigin }])
        }
      >
        {origins.map((origin, index) => (
          <CoffeeOriginRow
            key={index}
            countryId={origin.countryId}
            canRemove={origins.length > 1}
            onRemove={() =>
              form.setFieldValue(
                'origins',
                origins.filter((_, i) => i !== index),
              )
            }
            renderCountry={(country) => (
              <form.AppField name={`origins[${index}].countryId`}>
                {(countryField) => (
                  <countryField.SearchSelect
                    label="Country"
                    disabled={country.disabled}
                    options={countries.options.filter(
                      (option) =>
                        option.value === origin.countryId ||
                        !usedCountryIds.has(option.value),
                    )}
                    onAddItem={countries.onAddItem}
                    onValueChange={() =>
                      form.setFieldValue(`origins[${index}].regionId`, '')
                    }
                  />
                )}
              </form.AppField>
            )}
            renderRegion={(region) => (
              <form.AppField name={`origins[${index}].regionId`}>
                {(regionField) => (
                  <regionField.SearchSelect
                    label="Region"
                    disabled={region.disabled}
                    options={region.options}
                    onAddItem={region.onAddItem}
                  />
                )}
              </form.AppField>
            )}
          />
        ))}
      </CoffeeOriginFields>
    )
  },
})
