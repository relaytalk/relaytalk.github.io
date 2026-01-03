// /app/utils/presence.js - FIXED VERSION
import { supabase } from './supabase.js';

class PresenceTracker {
    constructor() {
        this.intervalId = null;
        this.userId = null;
        this.isTracking = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async start(userId) {
        this.userId = userId;
        this.isTracking = true;

        console.log("👁️ Presence tracking started for:", userId);

        // Initial online status with retry
        await this.updateWithRetry(true);

        // Periodic updates (every 45 seconds)
        this.intervalId = setInterval(() => {
            this.updateWithRetry(document.visibilityState === 'visible');
        }, 45000);

        // Visibility changes
        document.addEventListener('visibilitychange', () => {
            this.updateWithRetry(document.visibilityState === 'visible');
        });

        // Page unload
        window.addEventListener('beforeunload', () => this.stop());

        return true;
    }

    async updateWithRetry(isOnline, retry = 0) {
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

            if (error) {
                console.error("Presence update error:", error);
                throw error;
            }

            console.log(`✅ Presence updated: ${isOnline ? 'Online' : 'Offline'}`);
            this.retryCount = 0;
            return true;

        } catch (error) {
            console.error(`❌ Presence update failed (attempt ${retry + 1}):`, error.message);
            
            if (retry < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retry)));
                return this.updateWithRetry(isOnline, retry + 1);
            }
            
            this.retryCount++;
            
            if (this.retryCount > 5) {
                console.warn("⚠️ Too many presence failures, stopping tracker");
                this.stop();
            }
            
            return false;
        }
    }

    async stop() {
        this.isTracking = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.userId) {
            try {
                await this.updateWithRetry(false);
            } catch (error) {
                console.log("Note: Could not update offline status on exit");
            }
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

            if (error || !presence) {
                return { online: false, lastSeen: null };
            }

            if (presence.is_online) {
                return { online: true, lastSeen: presence.last_seen };
            }

            const lastSeen = new Date(presence.last_seen);
            const now = new Date();
            const minutesAway = (now - lastSeen) / (1000 * 60);

            return { 
                online: minutesAway < 5,
                lastSeen: presence.last_seen 
            };

        } catch (error) {
            console.error("Error checking online status:", error);
            return { online: false, lastSeen: null };
        }
    }
}

// Export singleton instance
const presenceTracker = new PresenceTracker();
export default presenceTracker;