import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("Checking Supabase table 'local_metadata'...");
    const { count, error } = await supabase
        .from('local_metadata')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("❌ Error accessing table:", error.message);
        process.exit(1);
    } else {
        console.log(`✅ Successfully connected! 'local_metadata' table has ${count} records.`);
        process.exit(0);
    }
}

testConnection();
