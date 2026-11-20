import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Banknote, ShieldCheck, X, ArrowRight, AlertCircle, QrCode, CreditCard, Building2, Copy, Check, Lock } from 'lucide-react';

const UPI_ID = 'bistroandbloom@okaxis';

export default function PaymentModal({ isOpen, onClose, amount, onPaymentSuccess, orderSource = 'DELIVERY' }) {
  const [method, setMethod] = useState('UPI'); // 'UPI' | 'CARD' | 'NET_BANKING' | 'CASH'
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  // Form states
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [upiApp, setUpiApp] = useState('ANY');

  const formattedAmount = Number(amount || 0).toFixed(2);

  // Generate UPI QR Code dynamically
  useEffect(() => {
    if (!isOpen) return;
    const upiUri = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent('Bistro & Bloom')}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('Bistro Order Payment')}`;
    QRCode.toDataURL(upiUri, {
      width: 200,
      margin: 1,
      color: { dark: '#11164b', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(() => {});
  }, [isOpen, formattedAmount]);

  useEffect(() => {
    if (isOpen) { setError(''); closeRef.current?.focus(); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event) => { if (event.key === 'Escape' && !isProcessing) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  const copyUpiId = () => {
    navigator.clipboard?.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCardNumber = (value) => {
    const raw = value.replace(/\D/g, '').slice(0, 16);
    return raw.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (value) => {
    const raw = value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 2) return `${raw.slice(0, 2)}/${raw.slice(2)}`;
    return raw;
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
    setError('');

    // Validation
    if (method === 'CARD') {
      if (card.number.replace(/\s/g, '').length < 15) return setError('Please enter a valid 16-digit card number.');
      if (!card.expiry || card.expiry.length < 5) return setError('Please enter card expiry (MM/YY).');
      if (!card.cvv || card.cvv.length < 3) return setError('Please enter a valid 3-digit CVV.');
    }

    setIsProcessing(true);
    try {
      await onPaymentSuccess?.({
        method,
        status: method === 'CASH' ? 'PENDING' : 'PAID',
        amount: Number(amount),
        transactionId: `TXN-${Date.now().toString(36).toUpperCase()}`
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to process payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11164b]/60 p-4 backdrop-blur-sm animate-fadeIn">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-[#ecd3d0] max-h-[90vh] overflow-y-auto"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          disabled={isProcessing}
          aria-label="Close payment options"
          className="absolute right-4 top-4 rounded-full p-2 text-[#75666b] hover:bg-stone-100 transition-colors"
        >
          <X size={18} />
        </button>

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a61920]">Checkout Payment</p>
        <h2 id="payment-modal-title" className="mt-1 font-serif text-2xl sm:text-3xl text-[#11164b]">
          Choose Payment Method
        </h2>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[#faf1f0] border border-[#ecd3d0] px-4 py-3">
          <span className="text-xs text-[#75666b]">Amount to pay</span>
          <strong className="text-xl font-bold text-[#11164b]">₹{formattedAmount}</strong>
        </div>

        {/* Method Selector Tabs */}
        <div className="mt-5 grid grid-cols-4 gap-2 border-b border-[#ecd3d0] pb-3 text-xs">
          {[
            ['UPI', 'QR / UPI', QrCode],
            ['CARD', 'Card', CreditCard],
            ['CASH', orderSource === 'DELIVERY' ? 'COD' : 'Pay at Counter', Banknote],
            ['NET_BANKING', 'NetBanking', Building2]
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMethod(key); setError(''); }}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
                method === key
                  ? 'bg-[#11164b] text-white font-semibold shadow-xs'
                  : 'bg-stone-50 hover:bg-stone-100 text-[#554e58]'
              }`}
            >
              <Icon size={16} />
              <span className="text-[10px] whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: UPI & QR Code */}
        {method === 'UPI' && (
          <div className="mt-5 space-y-4 text-center">
            <p className="text-xs text-[#75666b]">Scan this QR code with any UPI app to pay</p>
            <div className="inline-block p-3 rounded-2xl bg-white border-2 border-[#11164b]/20 shadow-sm">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="UPI Payment QR Code" width="180" height="180" className="mx-auto rounded-lg" />
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center bg-stone-100 text-stone-400 text-xs">Loading QR…</div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-[#75666b]">UPI ID:</span>
              <strong className="font-mono text-[#11164b]">{UPI_ID}</strong>
              <button
                type="button"
                onClick={copyUpiId}
                className="inline-flex items-center gap-1 text-[11px] text-[#a61920] hover:underline"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="flex justify-center items-center gap-3 text-[10px] text-[#75666b]">
              <span className="px-2.5 py-1 rounded-md bg-stone-100 font-medium">GPay</span>
              <span className="px-2.5 py-1 rounded-md bg-stone-100 font-medium">PhonePe</span>
              <span className="px-2.5 py-1 rounded-md bg-stone-100 font-medium">Paytm</span>
              <span className="px-2.5 py-1 rounded-md bg-stone-100 font-medium">BHIM</span>
            </div>
          </div>
        )}

        {/* Tab 2: Credit / Debit Card */}
        {method === 'CARD' && (
          <div className="mt-5 space-y-3.5 text-left text-xs">
            <div>
              <label className="block mb-1 font-medium text-[#11164b]">Card Number</label>
              <input
                type="text"
                maxLength={19}
                placeholder="4532 •••• •••• 8892"
                value={card.number}
                onChange={e => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                className="w-full rounded-lg border border-[#ecd3d0] bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-[#11164b]"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium text-[#11164b]">Cardholder Name</label>
              <input
                type="text"
                placeholder="Name on card"
                value={card.name}
                onChange={e => setCard({ ...card, name: e.target.value })}
                className="w-full rounded-lg border border-[#ecd3d0] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#11164b]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-medium text-[#11164b]">Expires (MM/YY)</label>
                <input
                  type="text"
                  maxLength={5}
                  placeholder="12/28"
                  value={card.expiry}
                  onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                  className="w-full rounded-lg border border-[#ecd3d0] bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-[#11164b]"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium text-[#11164b]">CVV / CVC</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="•••"
                  value={card.cvv}
                  onChange={e => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  className="w-full rounded-lg border border-[#ecd3d0] bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-[#11164b]"
                />
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-[#75666b] pt-1">
              <Lock size={12} className="text-emerald-600" />
              Secured with 256-bit encryption · Visa, Mastercard, RuPay &amp; Amex accepted
            </p>
          </div>
        )}

        {/* Tab 3: Cash / Counter */}
        {method === 'CASH' && (
          <div className="mt-5 space-y-3 rounded-xl bg-[#faf1f0] p-4 text-xs text-[#75666b]">
            <p className="font-semibold text-[#11164b]">
              {orderSource === 'DELIVERY' ? 'Cash on Delivery (COD)' : 'Pay at the Counter'}
            </p>
            <p className="leading-relaxed">
              {orderSource === 'DELIVERY'
                ? 'Pay ₹' + formattedAmount + ' in cash to our delivery driver when your food arrives.'
                : 'Your order will be sent to the kitchen. You can settle the bill at the front desk when collecting.'}
            </p>
            <p className="text-[11px] text-[#a61920]">Exact change is appreciated.</p>
          </div>
        )}

        {/* Tab 4: Net Banking */}
        {method === 'NET_BANKING' && (
          <div className="mt-5 space-y-3 text-xs">
            <label className="block font-medium text-[#11164b]">Choose your bank</label>
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="w-full rounded-lg border border-[#ecd3d0] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#11164b]"
            >
              <option>HDFC Bank</option>
              <option>State Bank of India (SBI)</option>
              <option>ICICI Bank</option>
              <option>Axis Bank</option>
              <option>Kotak Mahindra Bank</option>
              <option>Punjab National Bank</option>
            </select>
            <p className="text-[11px] text-[#75666b]">You will be redirected to your bank’s secure payment gateway.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </p>
        )}

        {/* Submission Action */}
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="btn-3d-crimson mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isProcessing ? 'Processing payment…' : method === 'CASH' ? 'Confirm & Place Order' : `Pay ₹${formattedAmount} & Place Order`}
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
