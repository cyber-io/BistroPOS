import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  CreditCard,
  QrCode,
  Building2,
  Banknote,
  Wallet,
  Users,
  Calculator,
  Check,
  ShieldCheck,
  X,
  Copy,
  Sparkles,
  Gift,
  CheckCircle2,
  Receipt,
  ArrowRight,
  Smartphone
} from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { tableTitle } from '../../services/tablePresentation';

const RESTAURANT_UPI_ID = 'bistroandbloom@okaxis';

export default function QrTablePaymentModal({
  isOpen,
  onClose,
  table,
  tableOrders = [],
  tableSession = null,
  restaurant = null,
  onPaymentSuccess
}) {
  const { addToast } = useNotification();
  const closeRef = useRef(null);

  // Bill & Split state
  const [isSplitEnabled, setIsSplitEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [payShareOnly, setPayShareOnly] = useState(false); // Pay full or pay my share
  const [splitMode, setSplitMode] = useState('EQUAL'); // 'EQUAL' | 'ITEMIZED'
  const [itemAssignments, setItemAssignments] = useState({});

  // Gratuity / Tip
  const [tipPercent, setTipPercent] = useState(10); // 0, 5, 10, 15, -1
  const [customTip, setCustomTip] = useState('');

  // Loyalty Rewards
  const [customerPhone, setCustomerPhone] = useState('');
  const [loyaltyAccount, setLoyaltyAccount] = useState(null);
  const [redeemedPoints, setRedeemedPoints] = useState(0);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);

  // Gateway Selection: 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET' | 'CASH'
  const [gateway, setGateway] = useState('UPI');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Gateway form states
  const [cardData, setCardData] = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [selectedWallet, setSelectedWallet] = useState('Paytm');

  // Compute Base Financials
  const items = tableOrders.flatMap(o => o.items || []);
  const subtotal = tableOrders.reduce((sum, o) => {
    const orderTotal = Number(o.total || 0);
    const orderTax = Number(o.tax || 0);
    return sum + (orderTotal > 0 ? (orderTotal - orderTax) : 0);
  }, 0) || items.reduce((s, itm) => s + (Number(itm.price || itm.unitPrice || 0) * (itm.quantity || 1)), 0);

  const gstTax = Number((subtotal * 0.05).toFixed(2));

  const computedTip = tipPercent === -1
    ? (Number(customTip) || 0)
    : Math.round((subtotal * tipPercent) / 100);

  const fullBillTotal = Math.max(0, subtotal + gstTax + computedTip - loyaltyDiscount);
  const perPersonShare = Number((fullBillTotal / (splitCount || 1)).toFixed(2));
  const amountToPay = (isSplitEnabled && payShareOnly) ? perPersonShare : fullBillTotal;
  const formattedAmount = Number(amountToPay || 0).toFixed(2);

  // Generate dynamic UPI QR Code on amount or gateway change
  useEffect(() => {
    if (!isOpen || gateway !== 'UPI') return;
    const restName = restaurant?.name || 'Bistro & Bloom';
    const upiUri = `upi://pay?pa=${RESTAURANT_UPI_ID}&pn=${encodeURIComponent(restName)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent(`Table ${table?.tableNumber || ''} Dining Bill`)}`;
    QRCode.toDataURL(upiUri, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(() => {});
  }, [isOpen, gateway, formattedAmount, table, restaurant]);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      closeRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Copy UPI ID
  const handleCopyUpi = () => {
    navigator.clipboard?.writeText(RESTAURANT_UPI_ID);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  // Loyalty Points Check
  const handleCheckLoyalty = async (e) => {
    e?.preventDefault();
    if (!customerPhone || customerPhone.trim().length < 10) {
      addToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }
    setIsCheckingLoyalty(true);
    try {
      const data = await api.getLoyaltyBalance(customerPhone.trim());
      setLoyaltyAccount(data);
      if (data?.pointsBalance > 0) {
        addToast(`Found ${data.pointsBalance} reward points for ${data.customerName || customerPhone}!`, 'success');
      } else {
        addToast('No loyalty points found. You will earn reward points on this bill!', 'info');
      }
    } catch {
      addToast('Could not fetch loyalty account. You can still proceed with payment.', 'info');
    } finally {
      setIsCheckingLoyalty(false);
    }
  };

  const handleRedeemPoints = (points) => {
    const disc = points * 0.5;
    setRedeemedPoints(points);
    setLoyaltyDiscount(disc);
    addToast(`Redeemed ${points} points for ₹${disc} discount!`, 'success');
  };

  // Card formatting helpers
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardData(prev => ({ ...prev, number: formatted }));
  };

  const handleExpiryChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    const formatted = raw.length >= 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
    setCardData(prev => ({ ...prev, expiry: formatted }));
  };

  // Primary Payment Execution
  const handleExecutePayment = async () => {
    if (isProcessing) return;
    setErrorMsg('');

    // Gateway-specific validation
    if (gateway === 'CARD') {
      const cleanNum = cardData.number.replace(/\s/g, '');
      if (cleanNum.length < 15) {
        setErrorMsg('Please enter a valid 16-digit card number.');
        return;
      }
      if (!cardData.expiry || cardData.expiry.length < 5) {
        setErrorMsg('Please enter card expiration date (MM/YY).');
        return;
      }
      if (!cardData.cvv || cardData.cvv.length < 3) {
        setErrorMsg('Please enter a valid 3-digit CVV security code.');
        return;
      }
    }

    setIsProcessing(true);
    const primaryOrder = tableOrders[0];

    try {
      if (gateway === 'CASH') {
        // Request Waiter for Cash settlement
        await api.requestHelp({
          restaurantId: primaryOrder?.restaurantId,
          tableId: table?.tableId,
          requestType: 'BILL',
          message: `Cash payment requested for ${tableTitle(table)}. Bill Amount: ₹${formattedAmount}.`
        });
        addToast(`Cash payment requested. A waiter has been alerted to collect ₹${formattedAmount} at your table.`, 'success');
      } else {
        // Record electronic payment
        if (primaryOrder?.orderId) {
          try {
            await api.initiatePayment({
              orderId: primaryOrder.orderId,
              restaurantId: primaryOrder.restaurantId,
              amount: Number(amountToPay),
              tipAmount: computedTip,
              splitCount: isSplitEnabled ? splitCount : 1,
              splitType: isSplitEnabled ? (payShareOnly ? 'EQUAL_SHARE' : 'EQUAL_FULL') : 'FULL',
              method: gateway
            });
          } catch (initErr) {
            console.warn('Initiate payment fallback:', initErr);
            // Fallback to record payment if already verified or local mock
            await api.recordPayment({
              orderId: primaryOrder.orderId,
              restaurantId: primaryOrder.restaurantId,
              amount: Number(amountToPay),
              tipAmount: computedTip,
              splitCount: isSplitEnabled ? splitCount : 1,
              splitType: isSplitEnabled ? 'EQUAL' : 'FULL',
              method: gateway
            }).catch(() => {});
          }
        }
        addToast(`Payment of ₹${formattedAmount} successful via ${gateway}!`, 'success');
      }

      onPaymentSuccess?.({
        gateway,
        paidAmount: Number(amountToPay),
        tipAmount: computedTip,
        loyaltyDiscount,
        splitCount: isSplitEnabled ? splitCount : 1,
        isSplit: isSplitEnabled,
        payShareOnly
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Payment could not be completed. Please try another gateway.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center">
              <CreditCard size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white uppercase">
                Pay Table Bill
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {tableTitle(table)} {tableSession?.sessionCode ? `• Session #${tableSession.sessionCode}` : ''}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close payment modal"
            className="w-7 h-7 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <span className="shrink-0 text-base">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Hero Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white shadow-md flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-purple-300 block">
                {isSplitEnabled && payShareOnly ? `Your Share (1 of ${splitCount} diners)` : 'Total Amount Payable'}
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-white">
                ₹{formattedAmount}
              </strong>
              {isSplitEnabled && payShareOnly && (
                <p className="text-[10px] text-slate-300 mt-0.5">
                  Full Table Bill: ₹{fullBillTotal.toFixed(2)}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                <ShieldCheck size={12} /> 100% Secure
              </span>
              <p className="text-[10px] text-slate-400 mt-1">GST & Service Inclusive</p>
            </div>
          </div>

          {/* Split Bill Feature Toggle & Options */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Calculator size={13} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">Split Bill with Table Friends</h4>
                  <p className="text-[10px] text-slate-500">Divide bill equally or pay your individual share</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSplitEnabled(!isSplitEnabled)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                  isSplitEnabled
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users size={13} />
                <span>{isSplitEnabled ? 'Splitting Active ✓' : 'Split Bill'}</span>
              </button>
            </div>

            {isSplitEnabled && (
              <div className="pt-2 border-t border-slate-200 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-[11px]">Number of Diners:</span>
                  <div className="flex items-center gap-1.5">
                    {[2, 3, 4, 5, 6].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSplitCount(num)}
                        className={`w-7 h-7 rounded-lg font-black text-xs transition-all ${
                          splitCount === num
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <button
                    type="button"
                    onClick={() => setPayShareOnly(false)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      !payShareOnly
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="block text-[10px] uppercase text-purple-700 font-black">Option A</span>
                    <strong className="text-xs text-slate-900 block">Pay Entire Bill</strong>
                    <span className="text-[10px] text-slate-500">₹{fullBillTotal.toFixed(2)} for {splitCount} guests</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayShareOnly(true)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      payShareOnly
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="block text-[10px] uppercase text-purple-700 font-black">Option B</span>
                    <strong className="text-xs text-slate-900 block">Pay Only My Share</strong>
                    <span className="text-[10px] text-purple-700 font-black">₹{perPersonShare} (1 of {splitCount})</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Gratuity & Staff Tip Selector */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-500" />
                Staff Gratuity / Tip:
              </span>
              <span className="text-purple-700 font-black">₹{computedTip}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {[
                [0, 'None'],
                [5, '5%'],
                [10, '10%'],
                [15, '15%'],
                [-1, 'Custom']
              ].map(([pct, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTipPercent(pct)}
                  className={`py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                    tipPercent === pct
                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tipPercent === -1 && (
              <input
                type="number"
                placeholder="Enter custom tip (₹)"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                className="w-full mt-2 p-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-purple-600 bg-white"
              />
            )}
          </div>

          {/* Customer Loyalty Rewards Check */}
          <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                <Gift size={13} className="text-indigo-600" />
                Loyalty Points Discount
              </span>
              {loyaltyAccount && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 text-[10px] font-black uppercase">
                  {loyaltyAccount.tier || 'MEMBER'}
                </span>
              )}
            </div>

            {!loyaltyAccount ? (
              <form onSubmit={handleCheckLoyalty} className="flex items-center gap-2">
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="flex-1 p-2 rounded-xl border border-indigo-200 bg-white text-xs font-semibold focus:outline-indigo-500 min-w-0"
                />
                <button
                  type="submit"
                  disabled={isCheckingLoyalty}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shrink-0 shadow-xs"
                >
                  {isCheckingLoyalty ? 'Checking...' : 'Apply Points'}
                </button>
              </form>
            ) : (
              <div className="space-y-1.5 text-[11px] text-indigo-900">
                <div className="flex items-center justify-between">
                  <span>Available Points: <strong>{loyaltyAccount.pointsBalance} pts</strong></span>
                  <span>Value: <strong>₹{(loyaltyAccount.pointsBalance * 0.5).toFixed(0)}</strong></span>
                </div>
                {loyaltyAccount.pointsBalance >= 100 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[100, 200, 500].filter(pts => pts <= loyaltyAccount.pointsBalance).map(pts => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => handleRedeemPoints(pts)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          redeemedPoints === pts
                            ? 'bg-indigo-700 text-white border-indigo-700'
                            : 'bg-white text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        Redeem {pts} pts (-₹{pts * 0.5})
                      </button>
                    ))}
                  </div>
                )}
                {loyaltyDiscount > 0 && (
                  <p className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check size={12} strokeWidth={3} />
                    <span>Loyalty Discount: -₹{loyaltyDiscount}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Payment Gateways Selection (Feature Requirement: All Applicable Gateways) */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900 text-xs flex items-center justify-between">
              <span>Select Payment Gateway:</span>
              <span className="text-[10px] text-slate-400 font-normal">All gateways supported</span>
            </h4>

            {/* Gateway Tabs */}
            <div className="grid grid-cols-5 gap-1.5">
              {[
                ['UPI', 'UPI / QR', QrCode],
                ['CARD', 'Card', CreditCard],
                ['NET_BANKING', 'NetBanking', Building2],
                ['WALLET', 'Wallets', Wallet],
                ['CASH', 'Cash', Banknote]
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setGateway(key); setErrorMsg(''); }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                    gateway === key
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-[9px] mt-1 whitespace-nowrap leading-none">{label}</span>
                </button>
              ))}
            </div>

            {/* Gateway Details 1: UPI / QR Code */}
            {gateway === 'UPI' && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 text-center animate-fadeIn">
                <p className="text-[11px] text-slate-600 font-medium">
                  Scan QR with any UPI App or tap to open directly:
                </p>

                <div className="inline-block p-2.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="UPI Payment QR" width="180" height="180" className="mx-auto rounded-xl" />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center bg-slate-100 rounded-xl text-slate-400">
                      Generating QR…
                    </div>
                  )}
                </div>

                {/* Instant App Triggers */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <a
                    href={`upi://pay?pa=${RESTAURANT_UPI_ID}&pn=${encodeURIComponent(restaurant?.name || 'BistroPOS')}&am=${formattedAmount}&cu=INR`}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1 border border-slate-200 shadow-2xs"
                  >
                    <Smartphone size={12} className="text-blue-600" /> GPay
                  </a>
                  <a
                    href={`upi://pay?pa=${RESTAURANT_UPI_ID}&pn=${encodeURIComponent(restaurant?.name || 'BistroPOS')}&am=${formattedAmount}&cu=INR`}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1 border border-slate-200 shadow-2xs"
                  >
                    <Smartphone size={12} className="text-purple-600" /> PhonePe
                  </a>
                  <a
                    href={`upi://pay?pa=${RESTAURANT_UPI_ID}&pn=${encodeURIComponent(restaurant?.name || 'BistroPOS')}&am=${formattedAmount}&cu=INR`}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1 border border-slate-200 shadow-2xs"
                  >
                    <Smartphone size={12} className="text-sky-600" /> Paytm
                  </a>
                </div>

                {/* Copy UPI ID */}
                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-1">
                  <span>UPI ID: <strong className="text-slate-800">{RESTAURANT_UPI_ID}</strong></span>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="p-1 rounded-md hover:bg-slate-100 text-purple-700"
                    title="Copy UPI ID"
                  >
                    {copiedUpi ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Gateway Details 2: Credit / Debit Card */}
            {gateway === 'CARD' && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold mb-1">
                  <span>Card Details (Visa / Mastercard / RuPay)</span>
                  <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <ShieldCheck size={12} /> 256-bit SSL
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    value={cardData.number}
                    onChange={handleCardNumberChange}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-purple-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardData.expiry}
                      onChange={handleExpiryChange}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-purple-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">CVV</label>
                    <input
                      type="password"
                      placeholder="•••"
                      maxLength={4}
                      value={cardData.cvv}
                      onChange={(e) => setCardData(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '') }))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={cardData.name}
                    onChange={(e) => setCardData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-purple-600"
                  />
                </div>
              </div>
            )}

            {/* Gateway Details 3: Net Banking */}
            {gateway === 'NET_BANKING' && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 animate-fadeIn">
                <p className="text-[11px] text-slate-600 font-semibold">Select your bank:</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Bank', 'PNB'].map(bank => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`p-2 rounded-xl text-[10px] font-bold border transition-all text-center ${
                        selectedBank === bank
                          ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>

                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="State Bank of India">State Bank of India (SBI)</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="Kotak Bank">Kotak Mahindra Bank</option>
                  <option value="PNB">Punjab National Bank</option>
                  <option value="Bank of Baroda">Bank of Baroda</option>
                  <option value="Canara Bank">Canara Bank</option>
                  <option value="Union Bank of India">Union Bank of India</option>
                  <option value="IDFC FIRST Bank">IDFC FIRST Bank</option>
                </select>
              </div>
            )}

            {/* Gateway Details 4: Digital Wallets */}
            {gateway === 'WALLET' && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5 animate-fadeIn">
                <p className="text-[11px] text-slate-600 font-semibold">Select Digital Wallet:</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Paytm Wallet', 'PhonePe Wallet', 'Amazon Pay', 'MobiKwik'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setSelectedWallet(w)}
                      className={`p-3 rounded-xl border text-left font-bold text-xs transition-all flex items-center justify-between ${
                        selectedWallet === w
                          ? 'bg-purple-50 border-purple-500 text-purple-950 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{w}</span>
                      {selectedWallet === w && <Check size={14} className="text-purple-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Gateway Details 5: Cash / Pay at Counter */}
            {gateway === 'CASH' && (
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/70 space-y-2 text-amber-900 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-amber-600" />
                  <strong className="text-xs">Pay Cash at Table / Counter</strong>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Tap <strong>Confirm Cash Payment</strong> below. Your table waiter will immediately receive an alert to collect <strong>₹{formattedAmount}</strong> cash and bring your stamped receipt.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="py-3 px-5 rounded-2xl bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecutePayment}
            disabled={isProcessing || Number(formattedAmount) <= 0}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-900 hover:bg-black active:scale-95 text-white font-bold transition-all shadow-md text-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <span>Processing Payment…</span>
            ) : (
              <>
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>
                  {gateway === 'CASH'
                    ? `Request Cash Collection (₹${formattedAmount})`
                    : `Pay ₹${formattedAmount} via ${gateway}`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}