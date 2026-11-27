import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Compass, Utensils, CalendarDays, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function CustomerLoginPage() {
  const { login, register, resetPassword, currentUser, logout } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect') || '/profile';

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'reset') {
        const result = await resetPassword(form.email);
        setMessage({ text: result.message, error: !result.success });
      } else {
        const result = mode === 'register' ? await register(form) : await login(form.email, form.password);
        if (result.success) {
          const userRole = result.user?.role;
          if (userRole === 'SUPER_ADMIN') {
            navigate('/admin', { replace: true });
          } else if (['MANAGER', 'RECEPTIONIST'].includes(userRole)) {
            navigate('/pos', { replace: true });
          } else if (userRole === 'KITCHEN') {
            navigate('/kitchen', { replace: true });
          } else if (userRole === 'WAITER') {
            navigate('/waiter', { replace: true });
          } else {
            navigate(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/profile', { replace: true });
          }
        } else {
          setMessage({ text: result.message, error: true });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const change = event => setForm({ ...form, [event.target.name]: event.target.value });
  const switchMode = value => { setMode(value); setMessage(null); };

  return (
    <div className="website-subpage flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-[#75666b] hover:text-[#11164b] mb-6">
          <ArrowLeft size={14} /> Back to the bistro
        </Link>

        <div className="bg-white rounded-2xl border border-[#ecd3d0] p-6 sm:p-10 shadow-sm">
          <div className="text-center mb-8">
            <svg className="mx-auto mb-3" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <circle cx="22" cy="14" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
              <circle cx="22" cy="30" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
              <circle cx="14" cy="22" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
              <circle cx="30" cy="22" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
              <circle cx="22" cy="22" r="2.2" fill="#AF905C" />
            </svg>
            <h1 className="font-serif text-2xl sm:text-3xl text-[#11164b] font-semibold tracking-tight">
              {mode === 'register' ? 'Join Bistro & Bloom' : mode === 'reset' ? 'Reset password' : 'Sign in to order'}
            </h1>
            <p className="mt-2 text-xs text-[#75666b] leading-relaxed">
              {mode === 'register'
                ? 'Create an account to track deliveries, takeaway orders, and your table reservations.'
                : mode === 'reset'
                ? 'Enter your registered email and we’ll send instructions to recover your account.'
                : 'Welcome back. Sign in to place orders, check booking history, and manage your account.'}
            </p>
          </div>

          {currentUser && (
            <div className="rounded-xl border border-[#ecd3d0] bg-[#faf1f0] p-3.5 mb-6 text-xs flex flex-col gap-2 text-[#11164b]">
              <div className="flex items-center justify-between gap-3">
                <span>Signed in as <b>{currentUser.name}</b> ({currentUser.email})</span>
                <button type="button" className="font-semibold text-[#a61920] hover:underline" onClick={logout}>Sign out</button>
              </div>
              <Link to="/profile" className="btn-3d-crimson w-full text-center py-2 rounded-lg text-xs font-bold text-white mt-1">
                Go to My Profile &amp; Orders &rarr;
              </Link>
            </div>
          )}

          {message && (
            <div role={message.error ? 'alert' : 'status'} className={`text-xs leading-relaxed rounded-xl border p-3.5 mb-6 ${message.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="customer-name" className="block text-xs font-medium text-[#11164b] mb-1.5">Full name</label>
                <input
                  id="customer-name"
                  name="name"
                  required
                  maxLength={255}
                  autoComplete="name"
                  value={form.name}
                  onChange={change}
                  className="w-full rounded-xl border border-[#ecd3d0] bg-white px-3.5 py-2.5 text-xs text-[#11164b] outline-none focus:border-[#11164b] focus:ring-1 focus:ring-[#11164b]"
                  placeholder="e.g. Maya Sharma"
                />
              </div>
            )}

            <div>
              <label htmlFor="customer-email" className="block text-xs font-medium text-[#11164b] mb-1.5">Email address</label>
              <input
                id="customer-email"
                name="email"
                type="email"
                required
                maxLength={255}
                autoComplete="email"
                value={form.email}
                onChange={change}
                className="w-full rounded-xl border border-[#ecd3d0] bg-white px-3.5 py-2.5 text-xs text-[#11164b] outline-none focus:border-[#11164b] focus:ring-1 focus:ring-[#11164b]"
                placeholder="you@example.com"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="customer-phone" className="block text-xs font-medium text-[#11164b] mb-1.5">
                  Mobile number <span className="text-[#75666b] font-normal">(optional)</span>
                </label>
                <input
                  id="customer-phone"
                  name="phone"
                  type="tel"
                  maxLength={30}
                  autoComplete="tel"
                  value={form.phone}
                  onChange={change}
                  className="w-full rounded-xl border border-[#ecd3d0] bg-white px-3.5 py-2.5 text-xs text-[#11164b] outline-none focus:border-[#11164b] focus:ring-1 focus:ring-[#11164b]"
                  placeholder="+91 98765 43210"
                />
              </div>
            )}

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="customer-password" className="text-xs font-medium text-[#11164b]">Password</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('reset')} className="text-[11px] text-[#a61920] hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="customer-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={form.password}
                    onChange={change}
                    className="w-full rounded-xl border border-[#ecd3d0] bg-white px-3.5 py-2.5 pr-10 text-xs text-[#11164b] outline-none focus:border-[#11164b] focus:ring-1 focus:ring-[#11164b]"
                    placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-2.5 text-[#75666b] hover:text-[#11164b]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-3d-crimson w-full h-11 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-6 shadow-sm"
            >
              {busy ? 'Please wait…' : mode === 'register' ? 'Create customer account' : mode === 'reset' ? 'Send reset link' : 'Sign in & continue'}
              {!busy && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#ecd3d0] text-center text-xs text-[#75666b]">
            {mode === 'login' ? (
              <p>
                Don’t have an account?{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-[#a61920] font-semibold hover:underline">
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-[#a61920] font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl bg-[#faf1f0] p-4 text-xs text-[#75666b] flex items-center gap-3">
            <Compass size={20} className="text-[#a61920] shrink-0" />
            <div className="flex-1">
              <strong className="block text-[#11164b]">Guest order?</strong>
              <span>Track an existing delivery or takeaway without logging in.</span>
            </div>
            <Link to="/track-order" className="text-xs font-semibold text-[#a61920] hover:underline shrink-0">
              Track &rarr;
            </Link>
          </div>

          <div className="mt-6 pt-4 text-center">
            <Link to="/pos/login" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors">
              <span>Restaurant staff or admin?</span>
              <span className="font-semibold underline">Staff POS Login &rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
