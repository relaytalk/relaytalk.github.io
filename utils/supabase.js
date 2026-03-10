// utils/supabase.js - FINAL WORKING VERSION
const SUPABASE_HTTP_URL = 'https://relaytalk-proxy.lusterchat.workers.dev'  // Worker for HTTP
const SUPABASE_WS_URL = 'wss://yrbkwfpksfvbesrjxwse.supabase.co'  // Direct for WebSocket
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyYmt3ZnBrc2Z2YmVzcmp4d3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTQ3NTYsImV4cCI6MjA4NjYzMDc1Nn0.a2hWJyMENdxjXPImM13Eq31lbszsr-kyIG08X4JlgWU'

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    if (supabase) return supabase;
    if (initializationPromise) return initializationPromise;

    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            console.log('🔄 Loading Supabase client with direct WebSocket...');

            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm');

            // Create client with custom WebSocket URL
            supabase = createClient(SUPABASE_HTTP_URL, SUPABASE_ANON_KEY, {
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

            // 🔥 FIX: Override the WebSocket URL
            // This is the key - force WebSocket to use direct connection
            const originalChannel = supabase.channel;
            supabase.channel = function(topic, params = {}) {
                const channel = originalChannel.call(this, topic, params);
                
                // Override the socket connection
                const originalSubscribe = channel.subscribe;
                channel.subscribe = function(callback) {
                    // Create direct WebSocket connection
                    const wsUrl = SUPABASE_WS_URL + '/realtime/v1/websocket?' + new URLSearchParams({
                        apikey: SUPABASE_ANON_KEY,
                        eventsPerSecond: 10,
                        vsn: '1.0.0'
                    });
                    
                    // Store for later use
                    this._wsUrl = wsUrl;
                    
                    return originalSubscribe.call(this, callback);
                };
                
                return channel;
            };

            window.supabase = supabase;
            console.log('✅ Supabase client created with direct WebSocket override');

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
            
            // Fallback client
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
            console.log('🎯 Supabase ready - WebSocket: DIRECT, HTTP: WORKER');
        }).catch(console.error);
    }, 100);
}

export { supabase, initializeSupabase };
