// Adapt legacy permission fixtures to the mandatory MFA contract, without
// weakening production helpers or changing the fixture's business assertions.
import { readFile } from 'node:fs/promises'

const sessionHelper = `
create function pg_temp.duuk_fixture_claims(actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $fixture$
declare session uuid; factor uuid;
begin
  if not exists(select 1 from auth.users where id=actor and email like '%@test.invalid') then
    raise exception 'MFA fixture accepts only synthetic @test.invalid users';
  end if;
  select s.id into session from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id
    where s.user_id=actor and s.aal='aal2' and f.status='verified' limit 1;
  if session is null then
    session:=gen_random_uuid(); factor:=gen_random_uuid();
    insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
      values(factor,actor,'Isolated SQL fixture','totp','verified',now(),now(),'fictional-fixture');
    insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
      values(session,actor,factor,'aal2',now(),now());
  end if;
  return jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'aal','aal2');
end $fixture$;
`

export function prepareSqlFixture(sql) {
  if (!/^begin;\s*$/im.test(sql) || !/rollback;\s*(?:select\s+'[^']*'\s+result;\s*)?$/i.test(sql)) throw new Error('Fixture must begin a transaction and roll it back.')
  if (sql.includes('duuk_fixture_claims')) throw new Error('Fixture already prepared.')
  const adapted = sql.replace(/jsonb_build_object\(\s*'sub'\s*,\s*(\w+)\s*,\s*'role'\s*,\s*'authenticated'\s*\)/g, 'pg_temp.duuk_fixture_claims($1)')
  if (adapted === sql) throw new Error('No legacy synthetic authentication claims found.')
  return adapted.replace(/^begin;\s*$/im, `begin;\n${sessionHelper}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(prepareSqlFixture(await readFile(process.argv[2], 'utf8')))
}
