// File: utils/auth.js - SIMPLE USERNAME-ONLY AUTH SYSTEM
import { supabase } from './supabase.js'

export const auth = {
  // Sign in existing user
  async signIn(username, password) {
    try {
      console.log("🔐 Login attempt:", username);

      // Use @example.com domain (same as signup)
      const internalEmail = `${username}@example.com`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: password
      });

      if (error) throw error;

      console.log("✅ Login successful:", username);
      return {
        success: true,
        user: data.user,
        message: 'Login successful!'
      };

    } catch (error) {
      console.error('❌ Login error:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Invalid username or password'
      };
    }
  },

  // Sign out
  async signOut() {
    try {
      await supabase.auth.signOut();
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      
      // Also get profile data
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        
        return { 
          success: true, 
          user: data.user,
          profile: profile
        };
      }
      
      return { success: false, error: 'No user found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Check if logged in
  async isLoggedIn() {
    try {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    } catch (error) {
      return false;
    }
  },

  // Simple error messages
  getErrorMessage(error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('already') || msg.includes('exists')) {
      return 'Username already taken';
    }
    if (msg.includes('invalid') || msg.includes('incorrect')) {
      return 'Invalid username or password';
    }
    if (msg.includes('password')) {
      return 'Password must be at least 6 characters';
    }

    return 'Something went wrong. Please try again.';
  }
};