import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createGuest() {
    console.log("Creating guest user in Supabase auth...");
    const { data, error } = await supabase.auth.signUp({
        email: 'testguest@gmail.com',
        password: 'guestpassword123',
    });

    if (error) {
        console.error("❌ Error creating guest user:", error.message);
        process.exit(1);
    } else {
        console.log(`✅ Successfully created guest user!`);
        console.log(`User ID: ${data.user?.id}`);
        console.log(`Email: guest@musicmood.app`);
        console.log(`Password: guestpassword123`);
        process.exit(0);
    }
}

createGuest();
