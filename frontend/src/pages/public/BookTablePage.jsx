import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Phone, RefreshCw, Printer } from 'lucide-react';

const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const prettyTime = (value) => { if (!value) return ''; if (/AM|PM/i.test(value)) return value; const [h,m] = value.split(':'); return `${Number(h)%12 || 12}:${m} ${Number(h)>=12 ? 'PM' : 'AM'}`; };
const timeValue = (value) => { const match = value.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i); if (!match) return value; let h=Number(match[1]); if (match[3]) h = h%12 + (match[3].toUpperCase()==='PM'?12:0); return `${String(h).padStart(2,'0')}:${match[2]}:00`; };
const inputClass='w-full rounded-lg border border-[#E8D1CE] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]';
export default function BookTablePage() {
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const [date, setDate] = useState(() => { const day=new Date(); day.setDate(day.getDate()+1); return dateValue(day); });
  const [guestCount, setGuestCount] = useState(2);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [loading, setLoading] = useState(true);
  const [slotError, setSlotError] = useState('');
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState({ name:currentUser?.name || '', phone:currentUser?.phone || '', email:currentUser?.email || '', request:'' });
  useEffect(() => {
    let active = true;
    setLoading(true); setSlotError(''); setSlots([]); setSelectedSlot('');
    api.checkAvailability(date, guestCount).then(result => { if (active) { setSlots(result); setSelectedSlot(result.find(slot=>slot.isAvailable)?.timeSlot || ''); } }).catch(err=> { if(active) setSlotError(err.message || 'Unable to check table availability. Please try again.'); }).finally(()=> { if(active) setLoading(false); });
    return () => { active=false; };
  }, [date, guestCount, retry]);
  const update = (field) => (event) => setForm(prev=>({...prev,[field]:event.target.value}));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting || loading || !slots.some(slot=>slot.isAvailable && slot.timeSlot===selectedSlot)) return;
    setSubmitting(true); setSubmitError('');
    try {
      const reservation = await api.createReservation({ customerName:form.name.trim(), customerPhone:form.phone.trim(), customerEmail:form.email.trim(), reservationDate:date, reservationTime:timeValue(selectedSlot), reservationTimeFormatted:prettyTime(selectedSlot), guestCount:Number(guestCount), specialRequest:form.request.trim() });
      setConfirmation(reservation);
      addToast(`Reservation ${reservation.bookingId} confirmed.`, 'success');
    } catch(err) { setSubmitError(err.message || 'Your reservation could not be created. Please try again.'); setRetry(value=>value+1); }
    finally { setSubmitting(false); }
  };
  return <main className="website-subpage mx-auto min-h-[85vh] max-w-5xl space-y-8 px-4 py-10 text-[#11164B] sm:px-6 sm:py-14">
    <Link to="/" className="inline-flex items-center gap-2 text-xs text-[#75666B]"><ArrowLeft size={14} />Back to the bistro</Link>
    <div className="space-y-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A61920]">There’s a place for you here</p><h1 className="font-serif text-4xl sm:text-5xl">Make room for a good time.</h1><p className="mx-auto max-w-lg text-sm leading-relaxed text-[#75666B]">A catch-up over coffee or an evening around the table. Choose your time, and we’ll find the right table for you.</p></div>
    {confirmation ? <section className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-[#E8D1CE] bg-white p-6 sm:p-10" aria-live="polite">
      <CheckCircle2 size={43} className="text-[#11164B]" /><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#75666B]">Booking confirmed</p><h2 className="mt-2 font-serif text-3xl">We’ll see you soon, {confirmation.customerName.split(' ')[0]}.</h2><p className="mt-3 text-sm text-[#75666B]">Your reservation reference is <strong className="text-[#11164B]">{confirmation.bookingId}</strong>.</p></div>
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-[#FAF1F0] p-5 text-xs"><div><span className="block text-[#75666B]">Date</span><strong className="mt-1 block">{new Date(`${confirmation.reservationDate}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</strong></div><div><span className="block text-[#75666B]">Time</span><strong className="mt-1 block">{prettyTime(confirmation.reservationTimeFormatted || confirmation.reservationTime)}</strong></div><div><span className="block text-[#75666B]">Guests</span><strong className="mt-1 block">{confirmation.guestCount} people</strong></div></div>
      <div className="flex gap-3 rounded-xl border border-[#E8D1CE] p-4 text-sm leading-relaxed text-[#75666B]"><Clock size={19} className="mt-0.5 shrink-0 text-[#A61920]" /><p>Please arrive 5 minutes before your scheduled time. If you’re running late, let us know. We may need to move your reservation to the next available time, depending on table availability.</p></div>
      <div className="space-y-1 text-xs text-[#75666B]"><p>Reserved for {confirmation.customerName}</p><p>{confirmation.customerEmail} · {confirmation.customerPhone}</p></div>
      <div className="flex flex-wrap gap-3"><button onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-lg border border-[#E8D1CE] px-4 py-2.5 text-xs"><Printer size={14} />Save / print confirmation</button><button onClick={()=> { setConfirmation(null); setRetry(n=>n+1); }} className="btn-3d-crimson rounded-lg px-4 py-2.5 text-xs font-semibold text-white">Make another reservation</button></div>
    </section> : <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-8 rounded-2xl border border-[#E8D1CE] bg-white p-5 sm:p-8">
        <section className="space-y-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Calendar size={18} className="text-[#A61920]" />1. Your visit</h2><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="reservation-date" className="mb-1.5 block text-xs font-medium">Date</label><input id="reservation-date" type="date" required min={dateValue(new Date())} value={date} onChange={e=>setDate(e.target.value)} className={inputClass} /></div><div><label htmlFor="reservation-guests" className="mb-1.5 block text-xs font-medium">Number of guests</label><select id="reservation-guests" value={guestCount} onChange={e=>setGuestCount(Number(e.target.value))} className={inputClass}>{Array.from({length:70},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} {n===1?'guest':'guests'}</option>)}</select></div></div></section>
        <section className="space-y-4 border-t border-[#E8D1CE] pt-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Clock size={18} className="text-[#A61920]" />2. Find your time</h2><button type="button" onClick={()=>setRetry(n=>n+1)} disabled={loading} aria-label="Refresh table availability" className="rounded-lg p-2 text-[#75666B] hover:bg-[#FAF1F0]"><RefreshCw size={14} className={loading?'animate-spin':''} /></button></div>
          {loading ? <p role="status" className="rounded-xl bg-[#FAF1F0] p-7 text-center text-sm text-[#75666B]">Checking available tables…</p> : slotError ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{slotError}<button type="button" onClick={()=>setRetry(n=>n+1)} className="ml-2 underline">Try again</button></div> : !slots.some(s=>s.isAvailable) ? <p className="rounded-xl bg-[#FAF1F0] p-5 text-sm text-[#75666B]">No tables are available for this party size on this date. Try another date or contact the restaurant.</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(slot=><button type="button" key={slot.timeSlot} disabled={!slot.isAvailable} aria-pressed={selectedSlot===slot.timeSlot} title={slot.reason || ''} onClick={()=>setSelectedSlot(slot.timeSlot)} className={`rounded-lg border px-2 py-3 text-xs ${selectedSlot===slot.timeSlot?'border-[#a61920] bg-[#a61920] text-white':slot.isAvailable?'border-[#E8D1CE] text-[#11164B] hover:border-[#a61920]':'border-[#E8D1CE] bg-[#FAF1F0] text-stone-400 line-through'}`}>{prettyTime(slot.timeSlot)}</button>)}</div>}
          <p className="text-[11px] text-[#75666B]">Availability is checked again when you confirm. A suitable table is assigned automatically.</p>
        </section>
        <section className="space-y-4 border-t border-[#E8D1CE] pt-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Users size={18} className="text-[#A61920]" />3. A few details</h2><div><label htmlFor="reservation-name" className="mb-1.5 block text-xs font-medium">Full name</label><input id="reservation-name" required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={update('name')} className={inputClass} placeholder="Full name" /></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="reservation-phone" className="mb-1.5 block text-xs font-medium">Mobile number</label><input id="reservation-phone" type="tel" required pattern="[+0-9 ()-]{10,20}" maxLength={20} autoComplete="tel" value={form.phone} onChange={update('phone')} className={inputClass} placeholder="+91 98765 43210" /></div><div><label htmlFor="reservation-email" className="mb-1.5 block text-xs font-medium">Email address</label><input id="reservation-email" type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={update('email')} className={inputClass} placeholder="you@example.com" /></div></div><div><label htmlFor="reservation-request" className="mb-1.5 block text-xs font-medium">Special request (optional)</label><textarea id="reservation-request" rows={3} maxLength={500} value={form.request} onChange={update('request')} className={inputClass} placeholder="Dietary needs, a special occasion, or anything we should know…" /><p className="mt-1.5 text-[11px] text-[#75666B]">We’ll do our best to accommodate your request.</p></div></section>
        {submitError && <p role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertCircle size={16} className="shrink-0" />{submitError}</p>}
        <button type="submit" disabled={submitting || loading || !selectedSlot} className="btn-3d-crimson flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40">{submitting?'Reserving your table…':'Confirm reservation'}<ArrowRight size={16} /></button>
      </div>
      <aside className="space-y-5 rounded-2xl border border-[#E8D1CE] bg-[#F3E2DF] p-6"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#A61920]"><Users size={21} /></div><h2 className="font-serif text-2xl">Gather around.</h2><p className="text-sm leading-relaxed text-[#75666B]">Your table is reserved for the time you choose. Arrive a little early, settle in, and leave the rest to us.</p><div className="border-t border-[#E8D1CE] pt-4 text-xs leading-relaxed text-[#75666B]">For larger parties, accessibility needs, or a change of plans, please contact the restaurant.</div><Link to="/#visit" className="inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4"><Phone size={14} />Contact & opening hours</Link></aside>
    </form>}
  </main>;
}
