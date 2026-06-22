# public.coffees

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| id | uuid | gen_random_uuid() | false | [public.coffees_varieties](public.coffees_varieties.md) [public.espresso_shots](public.espresso_shots.md) |  |  |
| user_id | text |  | false |  | [public.user](public.user.md) |  |
| name | text |  | false |  |  |  |
| roaster_id | uuid |  | true |  | [public.roasters](public.roasters.md) |  |
| roast_level_id | uuid |  | true |  | [public.roast_levels](public.roast_levels.md) |  |
| roastDate | date |  | true |  |  |  |
| country_id | uuid |  | true |  | [public.countries](public.countries.md) |  |
| region_id | uuid |  | true |  | [public.regions](public.regions.md) |  |
| process_id | uuid |  | true |  | [public.coffee_processes](public.coffee_processes.md) |  |
| notes | text |  | true |  |  |  |
| is_active | boolean |  | true |  |  |  |
| created_at | timestamp without time zone | now() | false |  |  |  |
| updated_at | timestamp without time zone |  | true |  |  |  |
| dialed_in_shot_id | uuid |  | true |  | [public.espresso_shots](public.espresso_shots.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| coffees_process_id_coffee_processes_id_fkey | FOREIGN KEY | FOREIGN KEY (process_id) REFERENCES coffee_processes(id) |
| coffees_pkey | PRIMARY KEY | PRIMARY KEY (id) |
| coffees_country_id_countries_id_fkey | FOREIGN KEY | FOREIGN KEY (country_id) REFERENCES countries(id) |
| coffees_dialed_in_shot_id_espresso_shots_id_fkey | FOREIGN KEY | FOREIGN KEY (dialed_in_shot_id) REFERENCES espresso_shots(id) ON DELETE SET NULL |
| coffees_region_id_regions_id_fkey | FOREIGN KEY | FOREIGN KEY (region_id) REFERENCES regions(id) |
| coffees_roast_level_id_roast_levels_id_fkey | FOREIGN KEY | FOREIGN KEY (roast_level_id) REFERENCES roast_levels(id) |
| coffees_roaster_id_roasters_id_fkey | FOREIGN KEY | FOREIGN KEY (roaster_id) REFERENCES roasters(id) |
| coffees_user_id_user_id_fkey | FOREIGN KEY | FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE |

## Indexes

| Name | Definition |
| ---- | ---------- |
| coffees_pkey | CREATE UNIQUE INDEX coffees_pkey ON public.coffees USING btree (id) |
| coffees_user_idx | CREATE INDEX coffees_user_idx ON public.coffees USING btree (user_id) |
| coffees_user_name_idx | CREATE INDEX coffees_user_name_idx ON public.coffees USING btree (name, user_id) |
| coffees_user_process_id_idx | CREATE INDEX coffees_user_process_id_idx ON public.coffees USING btree (process_id, user_id) |
| coffees_user_country_idx | CREATE INDEX coffees_user_country_idx ON public.coffees USING btree (country_id, user_id) |

## Relations

```mermaid
erDiagram

"public.coffees_varieties" }o--|| "public.coffees" : "FOREIGN KEY (coffee_id) REFERENCES coffees(id) ON DELETE CASCADE"
"public.espresso_shots" }o--|| "public.coffees" : "FOREIGN KEY (coffee_id) REFERENCES coffees(id) ON DELETE CASCADE"
"public.coffees" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.coffees" }o--o| "public.roasters" : "FOREIGN KEY (roaster_id) REFERENCES roasters(id)"
"public.coffees" }o--o| "public.roast_levels" : "FOREIGN KEY (roast_level_id) REFERENCES roast_levels(id)"
"public.coffees" }o--o| "public.countries" : "FOREIGN KEY (country_id) REFERENCES countries(id)"
"public.coffees" }o--o| "public.regions" : "FOREIGN KEY (region_id) REFERENCES regions(id)"
"public.coffees" }o--o| "public.coffee_processes" : "FOREIGN KEY (process_id) REFERENCES coffee_processes(id)"
"public.coffees" }o--o| "public.espresso_shots" : "FOREIGN KEY (dialed_in_shot_id) REFERENCES espresso_shots(id) ON DELETE SET NULL"

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
"public.user" {
  text id
  text name
  text email
  boolean email_verified
  text image
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
"public.roast_levels" {
  uuid id
  text user_id FK
  text name
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
"public.regions" {
  uuid id
  text user_id FK
  text name
  uuid country_id FK
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.coffee_processes" {
  uuid id
  text user_id FK
  text name
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
