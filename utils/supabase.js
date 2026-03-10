// utils/supabase.js - FIXED with direct WebSocket
const supabaseUrl = 'https://relaytalk-proxy.lusterchat.workers.dev'
const supabaseWsUrl = 'wss://yrbkwfpksfvbesrjxwse.supabase.co'  // ← ADD THIS for WebSocket
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyYmt3ZnBrc2Z2YmVzcmp4d3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTQ3NTYsImV4cCI6MjA4NjYzMDc1Nn0.a2hWJyMENdxjXPImM13Eq31lbszsr-kyIG08X4JlgWU'

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    if (supabase) return supabase;
    if (initializationPromise) return initializationPromise;

    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            console.log('🔄 Loading Supabase client with direct WebSocket...');

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
                        apikey: supabaseAnonKey,
                        eventsPerSecond: 10
                    },
                    // 🔥 FIX: Use direct WebSocket URL for realtime
                    websocketURL: supabaseWsUrl
                }
            });

            window.supabase = supabase;
            console.log('✅ Supabase client created with direct WebSocket');

            // Test connection
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
            supabase = { auth: { /* fallback methods */ } };
            window.supabase = supabase;
            resolve(supabase);
        }
    });

    return initializationPromise;
}

if (typeof window !== 'undefined') {
    setTimeout(() => {
        initializeSupabase().then(() => {
            console.log('🎯 Supabase ready');
        }).catch(console.error);
    }, 100);
}

export { supabase, initializeSupabase };
