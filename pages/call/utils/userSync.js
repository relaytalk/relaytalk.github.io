// pages/call/utils/userSync.js
// Uses the NEW Mumbai project via the main app's Supabase client.
// Old Japan project (blxtldgnssvasuinpyit) is no longer used.

// ============================================================
// GET USER FROM MAIN APP'S LOCALSTORAGE
// ============================================================
export function getRelayTalkUser() {
    try {
        const possibleKeys = [
            'supabase.auth.token',
            'sb-auth-token',
            'sb-refresh-token'
        ]

        let authData = null
        for (const key of possibleKeys) {
            const data = localStorage.getItem(key)
            if (data) {
                authData = data
                console.log(`✅ Found auth in: ${key}`)
                break
            }
        }

        if (!authData) {
            console.log('No auth data found')
            return null
        }

        const parsed = JSON.parse(authData)
        let session = null

        if (parsed.currentSession) {
            session = parsed.currentSession
        } else if (parsed.user) {
            session = parsed
        } else if (parsed.access_token) {
            session = { user: parsed.user || parsed }
        } else if (Array.isArray(parsed) && parsed[0]?.user) {
            session = parsed[0]
        }

        if (!session?.user) return null

        const user = session.user

        return {
            id: user.id,
            email: user.email || '',
            username: user.user_metadata?.username ||
                     user.email?.split('@')[0] ||
                     'User',
            avatar_url: user.user_metadata?.avatar_url || null
        }

    } catch (e) {
        console.error('Error getting user:', e)
        return null
    }
}

// ============================================================
// SYNC USER TO MAIN DB (new Mumbai project)
// ============================================================
export async function syncUserToDatabase(supabase, user) {
    try {
        console.log('🔄 Syncing user to main DB:', user.email)

        const { data: existing, error: checkError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()

        if (checkError) throw checkError

        if (existing) {
            const { data: updated, error: updateError } = await supabase
                .from('profiles')
                .update({
                    status: 'online',
                    last_seen: new Date().toISOString()
                })
                .eq('id', user.id)
                .select()
                .single()

            if (updateError) throw updateError
            console.log('✅ User status updated in main DB')
            return updated || existing
        }

        // Profile missing — create it as a fallback
        // (normally the main app's signup flow + SQL trigger create it)
        const newUser = {
            id: user.id,
            username: user.username,
            full_name: user.username,
            avatar_url: user.avatar_url,
            status: 'online',
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
        }

        const { data: created, error: insertError } = await supabase
            .from('profiles')
            .insert([newUser])
            .select()
            .single()

        if (insertError) throw insertError

        console.log('✅ User profile created in main DB')
        return created

    } catch (error) {
        console.error('❌ Sync failed:', error)
        throw error
    }
}

// ============================================================
// GET CALLER INFO
// ============================================================
export async function getCallerInfo(supabase, callerId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', callerId)
            .single()

        return data || { username: 'Unknown', avatar_url: null }
    } catch (error) {
        return { username: 'Unknown', avatar_url: null }
    }
}

// ============================================================
// UPDATE USER STATUS
// ============================================================
export async function updateUserStatus(supabase, userId, status) {
    try {
        await supabase
            .from('profiles')
            .update({
                status: status,
                last_seen: new Date().toISOString()
            })
            .eq('id', userId)
    } catch (error) {
        console.error('Error updating status:', error)
    }
}