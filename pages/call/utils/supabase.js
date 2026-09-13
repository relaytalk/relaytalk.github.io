// pages/call/utils/supabase.js
// Now reuses the main app's Supabase client (new Mumbai project)
// Old Call project (yrbkwfpksfvbesrjxwse) is no longer used.

import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js'

let supabaseInstance = null

export async function initializeSupabase() {
    if (supabaseInstance) {
        console.log('✅ Call page: using existing main Supabase instance')
        return supabaseInstance
    }

    console.log('📞 Call page: initializing main app Supabase (new Mumbai project)')

    try {
        supabaseInstance = await initMainSupabase()
        console.log('✅ Call page: Supabase ready (new Mumbai project)')
        return supabaseInstance
    } catch (error) {
        console.error('❌ Call page: failed to initialize Supabase:', error)
        throw error
    }
}

// Re-export so `import { supabase } from './supabase.js'` still works
export { supabase } from '../../../utils/supabase.js'