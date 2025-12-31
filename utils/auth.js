// File: utils/auth.js - TRULY USERNAME-ONLY
import { supabase } from './supabase.js'

export const auth = {
  // Sign up new user
  async signUp(username, password, fullName = null) {
    try {
      console.log("🔐 Creating account:", username);

      // 1. Check if username exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();

      if (existingUser) {
        throw new Error('Username already taken');
      }

      // 2. Create auth account with dummy email
      const dummyEmail = `${username}@${username}.local`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: dummyEmail,
        password: password,
        options: {
          data: { 
            username: username, 
            full_name: fullName || username 
          }
        }
      });

      if (authError) throw authError;
      console.log("✅ Auth created for:", username);

      // 3. Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          username: username,
          full_name: fullName || username,
          avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
          status: 'online'
        });

      if (profileError) throw profileError;
      console.log("✅ Profile created for:", username);

      // 4. Auto-login with our CUSTOM function
      const loginResult = await this.signIn(username, password);
      
      if (!loginResult.success) {
        console.log("⚠️ Auto-login failed:", loginResult.message);
      } else {
        console.log("✅ Auto-login successful");
      }

      return loginResult;

    } catch (error) {
      console.error('❌ Signup error:', error.message);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  },

  // Sign in existing user - NEW: Check username in profiles first
  async signIn(username, password) {
    try {
      console.log("🔐 Login attempt:", username);

      // 1. Find the user's email by username
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .maybeSingle();

      if (profileError || !profile) {
        throw new Error('Invalid username or password');
      }

      // 2. Find the auth user to get their email
      const { data: authUser, error: authError } = await supabase
        .from('auth.users')
        .select('email')
        .eq('id', profile.id)
        .maybeSingle();

      if (authError || !authUser) {
        throw new Error('Invalid username or password');
      }

      // 3. Login with the found email
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authUser.email,
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

  // Sign out (unchanged)
  async signOut() {
    try {
      await supabase.auth.signOut();
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get current user (unchanged)
  async getCurrentUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Check if logged in (unchanged)
  async isLoggedIn() {
    const result = await this.getCurrentUser();
    return result.success;
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