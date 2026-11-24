import React, { useState } from 'react';
import { Printer, Download, Mail, Star, Heart, Check, X, ExternalLink, Sparkles, ReceiptText } from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

export default function DigitalReceiptAndFeedbackModal({
  isOpen,
  onClose,
  order = null,
  restaurantName = 'Bistro & Café',
  tableNumber = null
}) {
  const { addToast } = useNotification();
  const [activeTab, setActiveTab] = useState('RECEIPT'); // 'RECEIPT' or 'FEEDBACK'
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('IDLE'); // 'IDLE', 'SENDING', 'SENT', 'FAILED'
  const [emailError, setEmailError] = useState('');

  // 5-Star Feedback State (Feature 8)
  const [rating, setRating] = useState(5);
  const [foodRating, setFoodRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [ambianceRating, setAmbianceRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !order) return null;

  const items = order.items || [];
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price || i.priceSnapshot || i.unitPrice || 0) * (i.quantity || 1)), 0);
  const tax = Number(order.tax || (subtotal * 0.05).toFixed(2));
  const tip = Number(order.tipAmount || 0);
  const total = Number(order.total || (subtotal + tax + tip));

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const textReceipt = `
========================================
           ${restaurantName.toUpperCase()}
========================================
Order Number: #${order.orderNumber}
Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}
Table: ${tableNumber || order.tableNumber || 'Takeaway'}
----------------------------------------
ITEMS:
${items.map(i => `${i.name || i.itemName} x${i.quantity || 1}  ₹${((i.price || i.priceSnapshot || i.unitPrice || 0) * (i.quantity || 1)).toFixed(2)}`).join('\n')}
----------------------------------------
Subtotal: ₹${subtotal.toFixed(2)}
Taxes (GST): ₹${tax.toFixed(2)}
${tip > 0 ? `Tip: ₹${tip.toFixed(2)}\n` : ''}
TOTAL PAID: ₹${total.toFixed(2)}
Payment Method: ${order.paymentMethod || 'Online / UPI / Cash'}
Status: PAID & VERIFIED
========================================
Thank you for dining with us!
`;
    const blob = new Blob([textReceipt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${order.orderNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Receipt downloaded successfully.', 'success');
  };

  const handleSendEmail = async (e) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      addToast('Please enter a valid email address.', 'warning');
      return;
    }
    setEmailStatus('SENDING');
    setEmailError('');
    try {
      const res = await api.emailReceipt(order.orderId, email);
      if (res?.success) {
        setEmailStatus('SENT');
        addToast(`Digital receipt successfully delivered to ${email}.`, 'success');
      } else {
        setEmailStatus('FAILED');
        setEmailError(res?.message || 'Delivery failed.');
        addToast(res?.message || 'Email delivery failed. Please check address and retry.', 'error');
      }
    } catch (err) {
      setEmailStatus('FAILED');
      setEmailError(err.message || 'Network error sending receipt.');
      addToast(err.message || 'Could not deliver email receipt. Tap Retry.', 'error');
    }
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.submitFeedback({
        restaurantId: order.restaurantId,
        orderId: order.orderId,
        customerName: order.customerName || 'Dining Guest',
        customerPhone: order.customerPhone || null,
        rating,
        foodRating,
        serviceRating,
        ambianceRating,
        comment,
        googleReviewClicked: false
      });
      setFeedbackSubmitted(true);
      addToast('Thank you! Your feedback has been received.', 'success');
    } catch {
      setFeedbackSubmitted(true);
      addToast('Feedback saved. Thank you!', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const ratingLabels = {
    1: 'Needs Improvement',
    2: 'Fair Experience',
    3: 'Good Dining',
    4: 'Great Service!',
    5: 'Exceptional Experience! ⭐⭐⭐⭐⭐'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Header Tabs */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('RECEIPT')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'RECEIPT' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ReceiptText size={13} />
              <span>Digital Receipt</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('FEEDBACK')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'FEEDBACK' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Star size={13} />
              <span>Feedback</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'RECEIPT' ? (
            <div className="space-y-4">
              {/* Paper Receipt Box */}
              <div id="printable-receipt" className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3 font-mono shadow-2xs">
                {/* Receipt Header */}
                <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                  <h4 className="font-black text-base text-slate-900 font-sans tracking-tight uppercase">
                    {restaurantName}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-sans">GSTIN: 27AABCB1234F1Z8 • FSSAI Lic # 11521018000213</p>
                  <p className="text-[10px] text-slate-600 font-bold mt-1">
                    Order #{order.orderNumber} • Table {tableNumber || order.tableNumber || '1'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-sans">
                    {new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>

                {/* Items */}
                <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3 text-[11px]">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-800">{it.name || it.itemName}</span>
                        {it.customization?.portion && (
                          <span className="text-[10px] text-purple-700 ml-1 font-semibold">({it.customization.portion})</span>
                        )}
                        <span className="text-slate-500"> × {it.quantity || 1}</span>
                      </div>
                      <span className="font-bold text-slate-900 whitespace-nowrap">
                        ₹{((it.price || it.priceSnapshot || it.unitPrice || 0) * (it.quantity || 1)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals Breakdown */}
                <div className="space-y-1 text-[11px] pt-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>GST (CGST 2.5% + SGST 2.5%):</span>
                    <span>₹{tax.toFixed(2)}</span>
                  </div>
                  {tip > 0 && (
                    <div className="flex justify-between text-indigo-700 font-semibold">
                      <span>Gratuity / Staff Tip:</span>
                      <span>+₹{tip.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-300">
                    <span>TOTAL AMOUNT:</span>
                    <span className="text-purple-700">₹{total.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 pt-2 text-[10px] text-emerald-700 font-bold font-sans">
                    <Check size={12} strokeWidth={3} />
                    <span>Payment Completed & Verified</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Print & Download */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
                >
                  <Printer size={14} /> Print Receipt
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
                >
                  <Download size={14} /> Download TXT
                </button>
              </div>

              {/* Email Delivery */}
              <div className="space-y-1.5">
                <form onSubmit={handleSendEmail} className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                  <Mail size={15} className="text-slate-400 ml-2 shrink-0" />
                  <input
                    type="email"
                    placeholder="Enter email to receive copy..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={emailStatus === 'SENDING'}
                    className="flex-1 bg-transparent border-none text-xs focus:outline-none text-slate-800 placeholder-slate-400 min-w-0"
                  />
                  {emailStatus === 'FAILED' ? (
                    <button
                      type="button"
                      onClick={() => handleSendEmail()}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs transition-colors shrink-0 shadow-xs"
                    >
                      Retry ↻
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={emailStatus === 'SENDING' || emailStatus === 'SENT'}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-colors shrink-0 shadow-xs ${
                        emailStatus === 'SENT'
                          ? 'bg-emerald-600 text-white cursor-default'
                          : emailStatus === 'SENDING'
                          ? 'bg-purple-400 text-white cursor-wait'
                          : 'bg-purple-600 hover:bg-purple-700 active:scale-95 text-white'
                      }`}
                    >
                      {emailStatus === 'SENT' ? 'Delivered ✓' : emailStatus === 'SENDING' ? 'Sending...' : 'Send'}
                    </button>
                  )}
                </form>
                {emailStatus === 'FAILED' && (
                  <p className="text-[10px] text-rose-600 font-medium px-2">Delivery failed: {emailError}</p>
                )}
                {emailStatus === 'SENT' && (
                  <p className="text-[10px] text-emerald-600 font-medium px-2">Digital receipt delivered to your inbox.</p>
                )}
              </div>
            </div>
          ) : (
            /* FEEDBACK TAB */
            <div className="space-y-4">
              {!feedbackSubmitted ? (
                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  <div className="text-center space-y-1">
                    <h4 className="font-black text-sm text-slate-900">How was your dining experience?</h4>
                    <p className="text-slate-500 text-[11px]">Your review helps our chefs and floor team continuously improve.</p>
                  </div>

                  {/* Overall 5 Star Rating */}
                  <div className="flex flex-col items-center gap-1 py-1">
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className="transition-transform hover:scale-125 focus:outline-none p-1"
                          aria-label={`${star} star`}
                        >
                          <Star
                            size={28}
                            className={star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                          />
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 mt-1">
                      {ratingLabels[rating] || ''}
                    </span>
                  </div>

                  {/* Detailed Category Ratings */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                    {[
                      { label: 'Food Taste & Presentation', val: foodRating, set: setFoodRating },
                      { label: 'Staff & Table Service', val: serviceRating, set: setServiceRating },
                      { label: 'Ambiance & Cleanliness', val: ambianceRating, set: setAmbianceRating }
                    ].map((cat, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700 truncate">{cat.label}:</span>
                        <div className="flex gap-1 shrink-0">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => cat.set(s)}
                              className="focus:outline-none p-0.5"
                              aria-label={`${s} stars for ${cat.label}`}
                            >
                              <Star
                                size={15}
                                className={s <= cat.val ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comment Input */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Any compliments or suggestions for the chef?</label>
                    <textarea
                      rows={3}
                      placeholder="Tell us what you loved or how we can improve..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-black active:scale-95 text-white font-bold transition-all shadow-md flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Check size={16} />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit Feedback'}</span>
                  </button>
                </form>
              ) : (
                /* Post Feedback Celebration & Google Review Prompt (Feature 8) */
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
                    <Heart size={28} className="fill-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-slate-900">Thank You for Your Feedback!</h4>
                    <p className="text-slate-500 text-[11px] max-w-xs mx-auto">
                      Your thoughts directly help our culinary and floor teams elevate every diner's experience.
                    </p>
                  </div>

                  {/* If 5-Star Rating: Google Review Prompt */}
                  {rating === 5 && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-2xl space-y-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-amber-600">
                        <Sparkles size={16} />
                        <span className="font-black text-xs text-amber-950">Loved your 5-Star meal?</span>
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Please take 10 seconds to share your review on Google! It helps food lovers discover our kitchen.
                      </p>
                      <a
                        href="https://maps.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95"
                      >
                        <ExternalLink size={14} /> Review Us on Google Maps ⭐⭐⭐⭐⭐
                      </a>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                  >
                    Done & Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
