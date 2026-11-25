import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getAuthToken, setAuthToken, setActiveRestaurantId } from '../services/api';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);
const avatarByRole = { MANAGER: '👔', KITCHEN: '👨‍🍳', WAITER: '🤵', RECEPTIONIST: '👩‍💼', SUPER_ADMIN: '👤', CUSTOMER: '👤' };
const normalizeUser = user => ({ ...user, avatar: avatarByRole[user.role] || '👤' });

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(getAuthToken()));
  const logout = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
    setIsLoading(false);
    supabase?.auth.signOut().catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    if (getAuthToken()) {
      api.me().then(user => {
        if (active) {
          const norm = normalizeUser(user);
          if (norm.restaurantId) setActiveRestaurantId(norm.restaurantId);
          setCurrentUser(norm);
        }
      })
        .catch(() => { if (active) logout(); })
        .finally(() => { if (active) setIsLoading(false); });
    }
    const expired = () => { if (active) logout(); };
    window.addEventListener('rs_session_expired', expired);
    return () => { active = false; window.removeEventListener('rs_session_expired', expired); };
  }, [logout]);

  const acceptSession = result => {
    if (!result?.success || !result.token || !result.user) return { success: false, message: result?.message || 'Unable to sign in. Please try again.' };
    setAuthToken(result.token);
    const user = normalizeUser(result.user);
    if (user.restaurantId) {
      setActiveRestaurantId(user.restaurantId);
    }
    setCurrentUser(user);
    return { success: true, user };
  };
  const login = async (email, password) => {
    try {
      return acceptSession(await api.login({ email: email.trim().toLowerCase(), password }));
    } catch (error) { return { success: false, message: error.message }; }
  };
  const demoLogin = async role => {
    try { return acceptSession(await api.demoLogin(role)); }
    catch (error) { return { success: false, message: error.message }; }
  };
  const register = async ({ name, email, password, phone = '' }) => {
    try {
      // The server assigns CUSTOMER. Staff permissions cannot be self-selected.
      return acceptSession(await api.register({ name: name.trim(), email: email.trim().toLowerCase(), password, phone: phone.trim() }));
    } catch (error) { return { success: false, message: error.message }; }
  };
  const resetPassword = async email => {
    if (!supabase) return { success: false, message: 'Password reset email is not configured yet. Please contact the restaurant administrator.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/login` });
    return error ? { success: false, message: error.message } : { success: true, message: 'If an account exists for this email, you will receive a password reset link.' };
  };
  const updateProfile = async ({ name, phone }) => {
    try {
      const result = await api.updateProfile({ name, phone });
      if (result?.success && result?.user) {
        if (result.token) setAuthToken(result.token);
        const updated = normalizeUser(result.user);
        setCurrentUser(updated);
        return { success: true, user: updated, message: result.message || 'Profile updated successfully.' };
      }
      return { success: false, message: result?.message || 'Unable to update profile.' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  return <AuthContext.Provider value={{ currentUser, isLoading, isAuthenticated: Boolean(currentUser), role: currentUser?.role || 'GUEST', login, demoLogin, register, resetPassword, logout, updateProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
