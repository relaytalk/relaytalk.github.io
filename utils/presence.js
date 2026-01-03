// /app/utils/presence.js - Shared presence tracking utility
import { supabase } from './supabase.js';

class PresenceTracker {
    constructor() {
        this.intervalId = null;
        this.userId = null;
        this.isTracking = false;
    }
    
    async start(userId) {
        this.userId = userId;
        this.isTracking = true;
        
        console.log("👁️ Presence tracking started for:", userId);
        
        // Initial online status
        await this.update(true);
        
        // Periodic updates (every 30 seconds)
        this.intervalId = setInterval(() => {
            this.update(document.visibilityState === 'visible');
        }, 30000);
        
        // Visibility changes
        document.addEventListener('visibilitychange', () => {
            this.update(document.visibilityState === 'visible');
        });
        
        // Page unload
        window.addEventListener('beforeunload', () => this.stop());
        
        return true;
    }
    
    async update(isOnline) {
        if (!this.userId || !this.isTracking) return;
        
        try {
            const now = new Date().toISOString();
            
            const { error } = await supabase
                .from('user_presence')
                .upsert({
                    user_id: this.userId,
                    is_online: isOnline,
                    last_seen: now,
                    updated_at: now
                }, {
                    onConflict: 'user_id'
                });
            
            if (error) throw error;
            
            console.log(`✅ Presence updated: ${isOnline ? 'Online' : 'Offline'}`);
            return true;
            
        } catch (error) {
            console.error("❌ Failed to update presence:", error);
            return false;
        }
    }
    
    async stop() {
        this.isTracking = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Mark as offline
        if (this.userId) {
            await this.update(false);
        }
        
        console.log("👋 Presence tracking stopped");
    }
    
    async checkOnlineStatus(userId) {
        try {
            const { data: presence, error } = await supabase
                .from('user_presence')
                .select('is_online, last_seen')
                .eq('user_id', userId)
                .single();
            
            if (error || !presence) return false;
            
            // If marked online
            if (presence.is_online) return true;
            
            // Check if recently seen (within 2 minutes)
            const lastSeen = new Date(presence.last_seen);
            const now = new Date();
            const minutesAway = (now - lastSeen) / (1000 * 60);
            
            return minutesAway < 2;
            
        } catch (error) {
            console.error("Error checking online status:", error);
            return false;
        }
    }
}

// Export singleton instance
const presenceTracker = new PresenceTracker();
export default presenceTracker;