import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const a = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
export async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../../../supabase/migrations/20261022000100_radar.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
