# Migrations

No Supabase: **SQL Editor → New query**.

## Mais rápido

Cole e rode `apply_all.sql` de uma vez.

## Uma a uma

Rode nesta ordem:

1. `001_extensions.sql`
2. `002_stores_catalog.sql`
3. `003_customers_conversations.sql`
4. `004_orders.sql`
5. `005_indexes_triggers.sql`
6. `006_rls.sql`
7. `007_realtime.sql`
8. `008_seed.sql`
9. `009_product_price_decimal.sql` — se o banco já existia com `price_cents`
10. `010_notifications.sql`
11. `011_avatars_storage.sql`
12. `012_product_options.sql` — itens montáveis (tamanho, sabores, borda, etc.)

O `DEFAULT_STORE_ID` do backend é `00000000-0000-0000-0000-000000000001`.
