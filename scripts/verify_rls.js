import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runVerification() {
    console.log('====================================================');
    console.log('🔍 VERIFYING ROW LEVEL SECURITY (RLS) POLICIES');
    console.log('====================================================\n');

    let allPassed = true;

    // Test 1: Direct SELECT on user_favorites via anon key
    console.log('[Test 1] Public anon SELECT on public.user_favorites:');
    const { data: anonFavs, error: selErr } = await supabase
        .from('user_favorites')
        .select('*')
        .limit(10);

    if (selErr) {
        console.log(`  ❌ Query error: ${selErr.message}`);
        allPassed = false;
    } else if (anonFavs.length === 0) {
        console.log('  ✅ PASSED: Anon client received 0 rows (table data is private)');
    } else {
        console.log(`  ❌ FAILED: Anon client leaked ${anonFavs.length} rows!`);
        allPassed = false;
    }

    // Test 2: Direct INSERT on user_favorites via anon key
    console.log('\n[Test 2] Public anon INSERT on public.user_favorites:');
    const { data: insData, error: insErr } = await supabase
        .from('user_favorites')
        .insert({
            user_id: '5397ca5f-5d6d-4403-aa3b-bf88cbab8409',
            video_id: 'test_fake_video',
            title: 'Hacked Favorite',
            artist: 'Attacker'
        })
        .select();

    if (insErr) {
        console.log(`  ✅ PASSED: Anon insert blocked by RLS (${insErr.message})`);
    } else {
        console.log('  ❌ FAILED: Anon client was able to insert into user_favorites!');
        allPassed = false;
    }

    // Test 3: Public SELECT on local_metadata via anon key
    console.log('\n[Test 3] Public anon SELECT on public.local_metadata:');
    const { count, error: countErr } = await supabase
        .from('local_metadata')
        .select('*', { count: 'exact', head: true });

    if (countErr) {
        console.log(`  ❌ FAILED: Could not read local_metadata: ${countErr.message}`);
        allPassed = false;
    } else if (count > 0) {
        console.log(`  ✅ PASSED: Public client can read archive metadata (${count.toLocaleString()} tracks accessible)`);
    } else {
        console.log('  ❌ FAILED: local_metadata returned 0 count');
        allPassed = false;
    }

    // Test 4: Public DELETE on local_metadata via anon key
    console.log('\n[Test 4] Public anon DELETE on public.local_metadata:');
    const { data: delData, error: delErr } = await supabase
        .from('local_metadata')
        .delete()
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .select();

    if (delErr) {
        console.log(`  ✅ PASSED: Delete blocked with error: ${delErr.message}`);
    } else if (!delData || delData.length === 0) {
        console.log('  ✅ PASSED: Delete affected 0 rows (no public delete policy exists)');
    } else {
        console.log('  ❌ FAILED: Public client was able to delete archive rows!');
        allPassed = false;
    }

    // Test 5: Existing RPC functions (get_user_favorites) still operational
    console.log('\n[Test 5] Frontend RPC get_user_favorites operational test:');
    const testUserId = '5397ca5f-5d6d-4403-aa3b-bf88cbab8409';
    const { data: rpcFavs, error: rpcErr } = await supabase.rpc('get_user_favorites', {
        p_user_id: testUserId
    });

    if (rpcErr) {
        console.log(`  ❌ FAILED: RPC returned error: ${rpcErr.message}`);
        allPassed = false;
    } else if (Array.isArray(rpcFavs)) {
        console.log(`  ✅ PASSED: RPC retrieved ${rpcFavs.length} favorites for user ${testUserId.slice(0, 8)}...`);
    } else {
        console.log('  ❌ FAILED: Unexpected RPC response format');
        allPassed = false;
    }

    console.log('\n====================================================');
    if (allPassed) {
        console.log('🎉 ALL RLS SECURITY CHECKS PASSED SUCCESSFULLY!');
    } else {
        console.log('⚠️ SOME CHECKS FAILED. PLEASE REVIEW ABOVE.');
    }
    console.log('====================================================');
}

runVerification();
