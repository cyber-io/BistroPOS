import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Cloud, Eye, EyeOff, LockKeyhole, ShieldCheck, UtensilsCrossed, CalendarDays, Grid2X2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login, currentUser, logout } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect');

  const nextPath = userRole => {
    if (userRole === 'SUPER_ADMIN') return '/admin';
    const defaultPath = userRole === 'KITCHEN' ? '/kitchen' : userRole === 'WAITER' ? '/waiter' : ['RECEPTIONIST', 'MANAGER'].includes(userRole) ? '/pos' : '/menu';
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return defaultPath;
    const staffPath = redirect.startsWith('/pos') || redirect.startsWith('/receptionist');
    if (staffPath && !['RECEPTIONIST', 'MANAGER'].includes(userRole)) return defaultPath;
    if (redirect.startsWith('/kitchen') && userRole !== 'KITCHEN') return defaultPath;
    if (redirect.startsWith('/waiter') && userRole !== 'WAITER') return defaultPath;
    return redirect;
  };

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await login(form.email, form.password);
      if (result.success) navigate(nextPath(result.user.role), { replace: true });
      else setMessage({ text: result.message, error: true });
    } finally { setBusy(false); }
  };

  const change = event => setForm({ ...form, [event.target.name]: event.target.value });
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#172033] flex flex-col lg:flex-row" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <section className="w-full lg:w-[48%] min-h-screen flex flex-col bg-white relative">
        <header className="px-7 sm:px-12 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight"><Cloud className="w-8 h-8 text-[#4778f5]" strokeWidth={1.8} /><span>Bistro<span className="text-[#4778f5]">POS</span></span></div>
        </header>

        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-12">
          <div className="w-full max-w-[370px]">
            <span className="w-12 h-12 rounded-2xl border border-[#e4eaf6] bg-[#f4f7ff] text-[#4778f5] inline-flex items-center justify-center mb-7"><LockKeyhole className="w-6 h-6" /></span>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#4778f5] mb-3">Restaurant Workspace</p>
            <h1 className="text-[30px] font-semibold tracking-[-0.04em] leading-tight mb-8">Sign in</h1>
            {currentUser && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 mb-5 text-xs flex items-center justify-between gap-3"><span>Signed in as <b>{currentUser.name}</b> ({currentUser.role})</span><button className="font-semibold text-[#4778f5]" onClick={logout}>Sign out</button></div>}
            {message && <div role={message.error ? 'alert' : 'status'} className={`text-xs leading-relaxed rounded-lg border p-3 mb-5 ${message.error ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>{message.text}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div><label htmlFor="auth-email" className="block text-xs font-medium mb-2">Email address</label><input id="auth-email" name="email" type="email" required maxLength={255} autoComplete="email" value={form.email} onChange={change} className="auth-field" placeholder="email@restaurant.com" /></div>
              <div><div className="flex items-center justify-between mb-2"><label htmlFor="auth-password" className="text-xs font-medium">Password</label></div><div className="relative"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={form.password} onChange={change} className="auth-field pr-11" placeholder="Enter password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
              <button type="submit" disabled={busy} className="btn-3d-blue w-full h-11 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-6">{busy ? 'Please wait…' : 'Sign in to POS'}{!busy && <ArrowRight size={15} />}</button>
            </form>
          </div>
        </div>
        <footer className="px-7 sm:px-12 py-6 flex items-center justify-end text-[10px] text-[#9ca5b5]"><span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Secure access</span></footer>
      </section>

      <aside className="hidden lg:flex flex-1 items-center justify-center px-14 py-16 overflow-hidden relative bg-[#f4f7fd]">
        <div className="w-full max-w-lg relative">
          <div className="flex gap-2 items-center mb-4 text-[#4778f5] text-[11px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4778f5]" /> Made for a smooth service
          </div>
          <h2 className="text-[36px] font-semibold tracking-[-0.05em] leading-[1.15] max-w-sm mb-4">
            Your restaurant.<br />Perfectly in sync.
          </h2>
          <p className="text-sm leading-6 text-[#8690a2] max-w-sm mb-12">
            From the first order to the last table. One calm workspace for your whole team.
          </p>
          <div className="bg-white rounded-xl shadow-[0_20px_70px_-25px_#9fafd3] border border-[#e7ecf6] p-5 rotate-[-2deg]">
            <div className="flex justify-between items-center border-b border-[#edf1f7] pb-4"><span className="font-semibold text-sm flex items-center gap-2"><Cloud className="w-5 h-5 text-[#4778f5]" />Bistro &amp; Bloom</span><span className="text-[9px] rounded-full bg-[#edf9f2] text-[#43a878] px-2 py-1">All systems connected</span></div>
            <div className="py-5"><p className="text-xs font-semibold">Everything in its place.</p><p className="text-[10px] text-slate-400 mt-1">A little less busy. A lot more hospitality.</p></div>
            <div className="grid grid-cols-3 gap-2 mb-4">{[{ label: 'Orders', icon: UtensilsCrossed, color: '#4778f5' }, { label: 'Tables', icon: Grid2X2, color: '#d99c35' }, { label: 'Bookings', icon: CalendarDays, color: '#51a986' }].map(({ label, icon: Icon, color }) => <div key={label} className="rounded-lg bg-[#f8faff] border border-[#eaf0fb] p-3"><Icon size={17} style={{ color }} /><p className="text-[10px] font-medium mt-3">{label}</p><div className="h-1.5 w-10 bg-[#e7edf8] rounded-full mt-2" /></div>)}</div>
            <div className="rounded-lg bg-[#f8faff] border border-[#edf1f7] p-3 flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-[#e6f7ed] text-[#51a986] flex items-center justify-center"><CheckCircle2 size={17} /></span><div><p className="text-[10px] font-semibold">Kitchen. Floor. Front desk.</p><p className="text-[9px] text-slate-400 mt-1">Connected through every service.</p></div><span className="w-1.5 h-1.5 rounded-full bg-[#51a986] ml-auto" /></div>
          </div>
          <p className="mt-10 text-[10px] text-[#a2adbf] tracking-wide">THOUGHTFULLY BUILT FOR THE WAY YOU SERVE.</p>
        </div>
      </aside>
      <style>{`.auth-field{width:100%;height:43px;border:1px solid #e2e7ef;border-radius:8px;padding:0 12px;background:#fff;font-size:12px;outline:none;color:#172033;transition:border-color .15s,box-shadow .15s}.auth-field:focus{border-color:#4778f5;box-shadow:0 0 0 3px #4778f512}.auth-field::placeholder{color:#b0b8c6}`}</style>
    </div>
  );
}
