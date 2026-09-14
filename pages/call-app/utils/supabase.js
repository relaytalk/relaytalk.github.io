// pages/call-app/utils/supabase.js
// Reuses the MAIN app's authenticated Supabase client.
// This ensures the call page writes to the same DB with the
// same auth session (so anything still using RLS keeps working).

import { initializeSupabase as initMainSupabase, supabase as mainSupabase } from '../../../utils/supabase.js'

let supabaseInstance = null

export async function initializeSupabase() {
    if (supabaseInstance) return supabaseInstance

    console.log('🔄 CallApp: reusing main authenticated Supabase client...')

    try {
        supabaseInstance = await initMainSupabase()
        console.log('✅ CallApp Supabase ready (authenticated, new Mumbai)')
        return supabaseInstance
    } catch (error) {
        console.error('❌ Failed to initialize CallApp Supabase:', error)
        throw error
    }
}

export function getSupabase() {
    return supabaseInstance || mainSupabase
}
