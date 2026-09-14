// utils/supabase.js - NEW MUMBAI PROJECT
const SUPABASE_URL = 'https://kponqaktavkrchebmiwr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE'

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    if (supabase) return supabase;
    if (initializationPromise) return initializationPromise;

    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            console.log('🔄 Loading Supabase client (new Mumbai project)...');

            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm');

            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                    storage: window.localStorage,
                    storageKey: 'supabase.auth.token'
                },
                realtime: {
                    params: {
                        apikey: SUPABASE_ANON_KEY,
                        eventsPerSecond: 10
                    }
                }
            });

            window.supabase = supabase;
            console.log('✅ Supabase client created (direct Mumbai connection)');

            // Test realtime connection
            setTimeout(async () => {
                try {
                    const testChannel = supabase.channel('test-connection');
                    testChannel.subscribe((status) => {
                        console.log('🔌 Realtime test connection status:', status);
                        if (status === 'SUBSCRIBED') {
                            console.log('✅ Realtime is WORKING!');
                            testChannel.unsubscribe();
                        }
                    });
                } catch (e) {}
            }, 1000);

            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session?.user) {
                console.log('👤 Logged in as:', sessionData.session.user.email);
            }

            resolve(supabase);
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);

            supabase = {
                auth: {
                    signInWithPassword: async () => ({ data: null, error: { message: 'Network error' } }),
                    signUp: async () => ({ data: null, error: { message: 'Network error' } }),
                    getUser: async () => ({ data: { user: null }, error: null }),
                    getSession: async () => ({ data: { session: null }, error: null }),
                    signOut: async () => ({ error: null })
                },
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: null, error: null })
                        })
                    }),
                    insert: async () => ({ error: { message: 'Network error' } })
                })
            };
            window.supabase = supabase;
            resolve(supabase);
        }
    });

    return initializationPromise;
}

// Auto-initialize
if (typeof window !== 'undefined') {
    setTimeout(() => {
        initializeSupabase().then(() => {
            console.log('🎯 Supabase ready - Direct Mumbai connection');
        }).catch(console.error);
    }, 100);
}

export { supabase, initializeSupabase };
