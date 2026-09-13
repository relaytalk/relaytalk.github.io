// utils/supabase.js - NEW MUMBAI PROJECT
const supabaseUrl = 'https://kponqaktavkrchebmiwr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE'

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    if (supabase) return supabase;
    if (initializationPromise) return initializationPromise;

    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            console.log('🔄 Loading Supabase client...');

            // Import from working CDN
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm');

            supabase = createClient(supabaseUrl, supabaseAnonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false,
                    storage: window.localStorage,
                    storageKey: 'supabase.auth.token'
                }
            });

            window.supabase = supabase;
            console.log('✅ Supabase client created');

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
            console.log('🎯 Supabase ready for use');
        }).catch(console.error);
    }, 100);
}

export { supabase, initializeSupabase };
