# railway

## Tables

| Name | Columns | Comment | Type |
| ---- | ------- | ------- | ---- |
| [public.coffee_processes](public.coffee_processes.md) | 5 |  | BASE TABLE |
| [public.coffees](public.coffees.md) | 14 |  | BASE TABLE |
| [public.coffees_varieties](public.coffees_varieties.md) | 4 |  | BASE TABLE |
| [public.countries](public.countries.md) | 5 |  | BASE TABLE |
| [public.espresso_shots](public.espresso_shots.md) | 10 |  | BASE TABLE |
| [public.farms](public.farms.md) | 6 |  | BASE TABLE |
| [public.green_coffees](public.green_coffees.md) | 11 |  | BASE TABLE |
| [public.green_coffees_varieties](public.green_coffees_varieties.md) | 4 |  | BASE TABLE |
| [public.regions](public.regions.md) | 6 |  | BASE TABLE |
| [public.roast_levels](public.roast_levels.md) | 5 |  | BASE TABLE |
| [public.roasters](public.roasters.md) | 5 |  | BASE TABLE |
| [public.varieties](public.varieties.md) | 5 |  | BASE TABLE |
| [public.account](public.account.md) | 13 |  | BASE TABLE |
| [public.session](public.session.md) | 8 |  | BASE TABLE |
| [public.user](public.user.md) | 7 |  | BASE TABLE |

## Relations

```mermaid
erDiagram

"public.coffee_processes" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.coffees" }o--o| "public.coffee_processes" : "FOREIGN KEY (process_id) REFERENCES coffee_processes(id)"
"public.coffees" }o--o| "public.countries" : "FOREIGN KEY (country_id) REFERENCES countries(id)"
"public.coffees" }o--o| "public.espresso_shots" : "FOREIGN KEY (dialed_in_shot_id) REFERENCES espresso_shots(id) ON DELETE SET NULL"
"public.coffees" }o--o| "public.regions" : "FOREIGN KEY (region_id) REFERENCES regions(id)"
"public.coffees" }o--o| "public.roast_levels" : "FOREIGN KEY (roast_level_id) REFERENCES roast_levels(id)"
"public.coffees" }o--o| "public.roasters" : "FOREIGN KEY (roaster_id) REFERENCES roasters(id)"
"public.coffees" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.coffees_varieties" }o--|| "public.coffees" : "FOREIGN KEY (coffee_id) REFERENCES coffees(id) ON DELETE CASCADE"
"public.coffees_varieties" }o--|| "public.varieties" : "FOREIGN KEY (variety_id) REFERENCES varieties(id) ON DELETE CASCADE"
"public.countries" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.espresso_shots" }o--|| "public.coffees" : "FOREIGN KEY (coffee_id) REFERENCES coffees(id) ON DELETE CASCADE"
"public.espresso_shots" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.farms" }o--o| "public.regions" : "FOREIGN KEY (region_id) REFERENCES regions(id)"
"public.farms" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.green_coffees" }o--o| "public.coffee_processes" : "FOREIGN KEY (process_id) REFERENCES coffee_processes(id)"
"public.green_coffees" }o--o| "public.countries" : "FOREIGN KEY (country_id) REFERENCES countries(id)"
"public.green_coffees" }o--o| "public.farms" : "FOREIGN KEY (farm_id) REFERENCES farms(id)"
"public.green_coffees" }o--o| "public.regions" : "FOREIGN KEY (region_id) REFERENCES regions(id)"
"public.green_coffees" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.green_coffees_varieties" }o--|| "public.green_coffees" : "FOREIGN KEY (green_coffee_id) REFERENCES green_coffees(id) ON DELETE CASCADE"
"public.green_coffees_varieties" }o--|| "public.varieties" : "FOREIGN KEY (variety_id) REFERENCES varieties(id) ON DELETE CASCADE"
"public.regions" }o--o| "public.countries" : "FOREIGN KEY (country_id) REFERENCES countries(id)"
"public.regions" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.roast_levels" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.roasters" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.varieties" }o--o| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.account" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.session" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"

"public.coffee_processes" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.coffees" {
  uuid id
  text user_id FK
  text name
  uuid roaster_id FK
  uuid roast_level_id FK
  date roastDate
  uuid country_id FK
  uuid region_id FK
  uuid process_id FK
  text notes
  boolean is_active
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
  uuid dialed_in_shot_id FK
}
"public.coffees_varieties" {
  uuid variety_id FK
  uuid coffee_id FK
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.countries" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.espresso_shots" {
  uuid id
  text user_id FK
  uuid coffee_id FK
  numeric dose
  numeric yield
  integer time
  text grind_setting
  text notes
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.farms" {
  uuid id
  text user_id FK
  text name
  uuid region_id FK
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.green_coffees" {
  uuid id
  text user_id FK
  text name
  uuid country_id FK
  uuid region_id FK
  uuid farm_id FK
  uuid process_id FK
  integer altitude
  text notes
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.green_coffees_varieties" {
  uuid variety_id FK
  uuid green_coffee_id FK
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.regions" {
  uuid id
  text user_id FK
  text name
  uuid country_id FK
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.roast_levels" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.roasters" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.varieties" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.account" {
  text id
  text account_id
  text provider_id
  text user_id FK
  text access_token
  text refresh_token
  text id_token
  timestamp_without_time_zone access_token_expires_at
  timestamp_without_time_zone refresh_token_expires_at
  text scope
  text password
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.session" {
  text id
  timestamp_without_time_zone expires_at
  text token
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
  text ip_address
  text user_agent
  text user_id FK
}
"public.user" {
  text id
  text name
  text email
  boolean email_verified
  text image
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
