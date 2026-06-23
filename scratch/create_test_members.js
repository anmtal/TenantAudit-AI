const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Fix for Node.js < 22 WebSocket support
global.WebSocket = require('ws');

// Load environment variables from .env.local in the current folder
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in your environment configuration.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function createTestMembers() {
    const ownerEmails = ['anmtal@gmail.com', 'contact@leasealign.io', 'contact@leasealign.ai'];
    console.log(`Starting process to create 6 test members for team owner: ${ownerEmails.join(' or ')}`);

    try {
        // 1. Get owner user ID
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });
        if (listErr) throw listErr;

        const ownerUser = users.find(u => ownerEmails.includes(u.email?.toLowerCase()));
        if (!ownerUser) {
            console.error(`Owner user matching ${ownerEmails.join(' or ')} not found.`);
            process.exit(1);
        }

        const ownerId = ownerUser.id;
        const ownerEmail = ownerUser.email;

        // 2. Find team owned by owner
        const { data: team, error: teamErr } = await supabaseAdmin
            .from('teams')
            .select('id, seat_limit')
            .eq('owner_id', ownerId)
            .single();
        if (teamErr) throw teamErr;

        const teamId = team.id;
        console.log(`Found Team ID: ${teamId} (Seat limit: ${team.seat_limit})`);

        const testEmails = [
            'testmember1@example.com',
            'testmember2@example.com',
            'testmember3@example.com',
            'testmember4@example.com',
            'testmember5@example.com',
            'testmember6@example.com'
        ];

        for (let i = 0; i < testEmails.length; i++) {
            const email = testEmails[i];
            const firstName = 'Test';
            const lastName = `Member ${i + 1}`;
            const phone = `+1555000000${i + 1}`;

            console.log(`\nProcessing: ${email}...`);

            // Check if user exists
            let user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            let userId;

            if (!user) {
                const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                    email: email,
                    password: 'password123',
                    email_confirm: true,
                    user_metadata: {
                        first_name: firstName,
                        last_name: lastName,
                        phone: phone
                    }
                });

                if (createErr) {
                    console.error(`Error creating user ${email}:`, createErr.message);
                    continue;
                }
                userId = newUser.user.id;
                console.log(`Created user ${email} with ID: ${userId}`);
            } else {
                userId = user.id;
                console.log(`User ${email} already exists with ID: ${userId}`);
            }

            // Remove the personal team automatically created by trigger for this user
            const { error: deleteTeamErr } = await supabaseAdmin
                .from('teams')
                .delete()
                .eq('owner_id', userId);
            if (deleteTeamErr) {
                console.warn(`Note: Could not delete auto-created team for ${email}:`, deleteTeamErr.message);
            }

            // Update user profile to join owner's team
            const { error: profileUpdateErr } = await supabaseAdmin
                .from('profiles')
                .update({ team_id: teamId })
                .eq('id', userId);

            if (profileUpdateErr) {
                console.error(`Error adding user ${email} to team:`, profileUpdateErr.message);
            } else {
                console.log(`Successfully added ${email} to team.`);
            }
        }

        console.log(`\n🎉 Process completed successfully!`);

    } catch (err) {
        console.error("An error occurred:", err);
    }
}

createTestMembers();
