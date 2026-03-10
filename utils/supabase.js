// utils/supabase.js - FIXED FOR REALTIME (NO TRAILING SLASH)
const supabaseUrl = 'https://relaytalk-proxy.lusterchat.workers.dev'  // ← NO TRAILING SLASH!
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyYmt3ZnBrc2Z2YmVzcmp4d3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTQ3NTYsImV4cCI6MjA4NjYzMDc1Nn0.a2hWJyMENdxjXPImM13Eq31lbszsr-kyIG08X4JlgWU'

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    if (supabase) return supabase;
    if (initializationPromise) return initializationPromise;

    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            console.log('🔄 Loading Supabase client for call-app (Mumbai) with Realtime...');

            // Import from working CDN
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm');

            supabase = createClient(supabaseUrl, supabaseAnonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                    storage: window.localStorage,
                    storageKey: 'supabase.auth.token'
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });

            window.supabase = supabase;
            console.log('✅ Supabase client created for call-app with Realtime');

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
                } catch (e) {
                    console.log('Realtime test skipped');
                }
            }, 1000);

            // Verify connection
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.warn('⚠️ Session check error:', sessionError.message);
            } else {
                console.log('📡 Session status:', sessionData.session ? 'Active' : 'No session');
                if (sessionData.session?.user) {
                    console.log('👤 Logged in as:', sessionData.session.user.email);
                }
            }

            resolve(supabase);

        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);

            // Create fallback client
            supabase = {
                auth: {
                    signInWithPassword: async (credentials) => {
                        console.log('Fallback: signInWithPassword', credentials);
                        return { data: null, error: { message: 'Network error' } };
                    },
                    signUp: async (credentials) => {
                        console.log('Fallback: signUp', credentials);
                        return { data: null, error: { message: 'Network error' } };
                    },
                    getUser: async () => {
                        console.log('Fallback: getUser');
                        return { data: { user: null }, error: null };
                    },
                    getSession: async () => {
                        console.log('Fallback: getSession');
                        return { data: { session: null }, error: null };
                    },
                    signOut: async () => {
                        console.log('Fallback: signOut');
                        return { error: null };
                    }
                },
                from: (table) => ({
                    select: (columns) => ({
                        eq: (column, value) => ({
                            maybeSingle: async () => {
                                console.log(`Fallback: from(${table}).select().eq(${column}, ${value})`);
                                return { data: null, error: null };
                            }
                        })
                    }),
                    insert: async (data) => {
                        console.log(`Fallback: insert into ${table}`, data);
                        return { error: { message: 'Network error' } };
                    }
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
            console.log('🎯 Supabase ready for use - Mumbai region');
        }).catch(console.error);
    }, 100);
}

export { supabase, initializeSupabase };
