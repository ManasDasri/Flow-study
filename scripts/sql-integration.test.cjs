// Uses only throwaway databases on the local /tmp test PostgreSQL instance.
// FLOW_TEST_PGPORT=55439 node --test scripts/sql-integration.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const port = process.env.FLOW_TEST_PGPORT || '55439';
const args = ['-h', '127.0.0.1', '-p', port, '-U', 'flow_test', '-v', 'ON_ERROR_STOP=1', '-tA'];
const run = (database, sql) => execFileSync('psql', [...args, '-d', database], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';
const room = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('compatibility migration on legacy TEXT and current UUID schemas', async t => {
    assert.equal(run('postgres', 'SELECT current_user;').trim(), 'flow_test');
    run('postgres', "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
    for (const variant of ['legacy', 'current']) await t.test(variant, () => {
        const database = 'flow_ui_' + variant + '_' + process.pid;
        run('postgres', 'CREATE DATABASE ' + database + ';');
        try {
            run(database, `CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
                CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
                GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
                INSERT INTO auth.users VALUES ('${one}'), ('${two}');`);
            if (variant === 'current') run(database, readFileSync('sql/schema.sql', 'utf8'));
            else run(database, `
                CREATE TABLE public.rooms(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), room_code TEXT UNIQUE NOT NULL, is_locked BOOLEAN DEFAULT false, pin TEXT, created_at TIMESTAMPTZ DEFAULT now());
                CREATE TABLE public.tasks(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), room_id TEXT NOT NULL, title TEXT NOT NULL, completed BOOLEAN DEFAULT false, created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ DEFAULT now());
                CREATE TABLE public.sessions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), room_id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES auth.users(id), mode TEXT, duration_seconds INT, completed_at TIMESTAMPTZ DEFAULT now());
                ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
                GRANT ALL ON public.rooms, public.tasks, public.sessions TO authenticated;
                GRANT SELECT ON public.tasks TO anon;
                CREATE POLICY legacy_tasks ON public.tasks FOR ALL USING(true) WITH CHECK(true);
                CREATE POLICY legacy_rooms ON public.rooms FOR SELECT USING(true);
                CREATE FUNCTION public.verify_room_pin(TEXT,TEXT) RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER AS $$ SELECT true $$;
                CREATE PUBLICATION supabase_realtime FOR TABLE public.rooms;`);
            run(database, readFileSync('sql/002_profiles.sql', 'utf8'));
            run(database, readFileSync('sql/003_task_assignment.sql', 'utf8'));
            const reference = variant === 'legacy' ? 'FOCUS6' : room;
            run(database, `INSERT INTO public.rooms(id,room_code,is_locked,pin) VALUES('${room}','FOCUS6',true,'1234');
                INSERT INTO public.tasks(room_id,title,created_by) VALUES('${reference}','Retained task','${one}');
                INSERT INTO public.sessions(room_id,user_id,mode,duration_seconds) VALUES('${reference}','${one}','focus',1500);`);
            if (variant === 'current') run(database, 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;');
            const migration = readFileSync('sql/004_room_access_compatibility.sql', 'utf8');
            run(database, migration);
            run(database, migration);
            const asUser = (id, sql) => run(database, `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false); ${sql}`).trim().split('\n').at(-1);
            assert.equal(run(database, 'SELECT count(*) FROM public.tasks;').trim(), '1');
            assert.equal(run(database, 'SELECT count(*) FROM public.sessions;').trim(), '1');
            assert.equal(run(database, 'SELECT room_id::text FROM public.tasks;').trim(), room);
            assert.equal(asUser(one, 'SELECT count(*) FROM public.tasks;'), '1', 'Existing author keeps access');
            assert.equal(asUser(two, 'SELECT count(*) FROM public.tasks;'), '0', 'Outsider cannot read tasks');
            assert.throws(() => asUser(two, "SELECT public.join_room('FOCUS6','0000');"), /Command failed/, 'Wrong PIN must fail');
            assert.throws(() => asUser(two, 'SELECT pin FROM public.rooms;'), /Command failed/, 'PIN must be hidden');
            assert.throws(() => run(database, "SET ROLE anon; SELECT public.join_room('FOCUS6','1234');"), /Command failed/);
            assert.equal(asUser(two, "SELECT public.join_room('focus6','1234');"), room);
            assert.equal(asUser(two, 'SELECT count(*) FROM public.tasks;'), '1', 'Joined user can read tasks');
            assert.throws(() => asUser(two, `INSERT INTO public.tasks(room_id,title,created_by) VALUES('${room}','Spoofed author','${one}');`), /Command failed/);
            asUser(two, `INSERT INTO public.tasks(room_id,title,created_by) VALUES('${room}','Valid task','${two}');`);
            assert.equal(run(database, "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime';").trim(), '2', 'Existing publication members survive');
        } finally {
            run('postgres', 'DROP DATABASE ' + database + ' WITH (FORCE);');
        }
    });
});
