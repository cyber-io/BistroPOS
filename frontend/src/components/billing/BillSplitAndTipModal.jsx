import React, { useEffect, useState } from 'react';
import { Users, DollarSign, Sparkles, X, Check, Calculator, Receipt, Gift } from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

export default function BillSplitAndTipModal({
  isOpen,
  onClose,
  items = [],
  subtotal = 0,
  tax = 0,
  tableNumber,
  orderNumber,
  onPaymentSuccess
}) {
  const { addToast } = useNotification();
  const [splitMode, setSplitMode] = useState('EQUAL'); // 'EQUAL' or 'ITEMIZED'
  const [splitCount, setSplitCount] = useState(2);
  const [tipPercent, setTipPercent] = useState(10); // 0, 5, 10, 15, -1 (custom)
  const [customTip, setCustomTip] = useState('');

  // Loyalty rewards state (Feature 6)
  const [customerPhone, setCustomerPhone] = useState('');
  const [loyaltyAccount, setLoyaltyAccount] = useState(null);
  const [redeemedPoints, setRedeemedPoints] = useState(0);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [isCheckingLoyalty, setIsCheckingLoyalty] = useState(false);

  // Itemized assignments: itemId -> personIndex (0, 1, 2, ...)
  const [itemAssignments, setItemAssignments] = useState({});

  useEffect(() => {
    setItemAssignments(prev => {
      const cleaned = {};
      let changed = false;
      Object.entries(prev).forEach(([k, v]) => {
        if (v >= splitCount) {
          cleaned[k] = 0;
          changed = true;
        } else {
          cleaned[k] = v;
        }
      });
      return changed ? cleaned : prev;
    });
  }, [splitCount]);

  useEffect(() => {
    if (splitMode === 'ITEMIZED' && splitCount > 4) {
      setSplitCount(4);
    }
  }, [splitMode, splitCount]);

  if (!isOpen) return null;

  // Tip calculation (clamp negative custom tip)
  const computedTip = tipPercent === -1
    ? Math.max(0, Number(customTip) || 0)
    : Math.round((subtotal * tipPercent) / 100);

  const effectiveDiscount = Math.min(subtotal + tax + computedTip, Math.max(0, loyaltyDiscount));
  const grandTotal = Math.max(0, subtotal + tax + computedTip - effectiveDiscount);
  const baseEqualShare = Math.round((grandTotal / splitCount) * 100) / 100;
  const lastEqualShare = Math.round(Math.max(0, grandTotal - baseEqualShare * (splitCount - 1)) * 100) / 100;
  const perPersonEqual = baseEqualShare.toFixed(2);
  const hasRoundingRemainder = Math.abs(lastEqualShare - baseEqualShare) >= 0.005;

  // Handle Loyalty Check
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
        addToast(`Found account for ${data.customerName || customerPhone} with ${data.pointsBalance} points (${data.tier} tier)!`, 'success');
      } else {
        addToast('No active points yet. You will earn points on this order!', 'info');
      }
    } catch (err) {
      addToast(err?.message || 'Unable to fetch loyalty account. Please continue.', 'warning');
    } finally {
      setIsCheckingLoyalty(false);
    }
  };

  // Redeem Loyalty points estimate (100 points = ₹50 off; toggles off on repeat click)
  const handleRedeemPoints = (points) => {
    if (redeemedPoints === points) {
      setRedeemedPoints(0);
      setLoyaltyDiscount(0);
      addToast('Loyalty discount cleared.', 'info');
      return;
    }
    const discount = (points * 0.5);
    setRedeemedPoints(points);
    setLoyaltyDiscount(discount);
    addToast(`Applied ₹${discount} estimated discount from ${points} points!`, 'success');
  };

  // Itemized Calculations (reconciled so shares always sum to grandTotal)
  const itemLineTotal = (item) => Number(
    item.lineTotal ?? ((Number(item.price || item.priceSnapshot || item.unitPrice || 0)) * (item.quantity || 1))
  );
  const totalAssignedBase = items.reduce((acc, item) => acc + itemLineTotal(item), 0);
  const itemizedDenominator = totalAssignedBase > 0 ? totalAssignedBase : (subtotal || 1);

  const itemizedDinerTotals = (() => {
    const totals = [];
    let allocated = 0;
    for (let dIdx = 0; dIdx < splitCount; dIdx++) {
      if (dIdx === splitCount - 1) {
        totals.push(Math.max(0, grandTotal - allocated).toFixed(2));
      } else {
        const assignedItems = items.filter((_, idx) => {
          const assigned = itemAssignments[idx] ?? 0;
          const clamped = assigned < splitCount ? assigned : 0;
          return clamped === dIdx;
        });
        const dinerSubtotal = assignedItems.reduce((acc, item) => acc + itemLineTotal(item), 0);
        const share = Math.round((grandTotal * (dinerSubtotal / itemizedDenominator)) * 100) / 100;
        allocated += share;
        totals.push(Math.max(0, share).toFixed(2));
      }
    }
    return totals;
  })();

  const getItemDinerTotal = (dinerIndex) => itemizedDinerTotals[dinerIndex] ?? '0.00';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center shadow-xs">
              <Calculator size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Split Bill & Gratuity
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Equal or itemized breakdown with loyalty discounts
              </p>
            </div>
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

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Split Mode Selector Pills */}
          <div className="flex rounded-2xl bg-slate-100 p-1 font-bold">
            <button
              type="button"
              onClick={() => setSplitMode('EQUAL')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs ${
                splitMode === 'EQUAL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users size={14} />
              <span>Split Equally</span>
            </button>
            <button
              type="button"
              onClick={() => setSplitMode('ITEMIZED')}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs ${
                splitMode === 'ITEMIZED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Receipt size={14} />
              <span>Split by Items</span>
            </button>
          </div>

          {/* Equal Split Diners Slider / Counter */}
          {splitMode === 'EQUAL' ? (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Number of Diners:</span>
                <span className="font-black text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {splitCount} people
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[2, 3, 4, 5, 6].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSplitCount(num)}
                    className={`py-2 rounded-xl font-bold border transition-all text-xs ${
                      splitCount === num
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 text-center">
                <p className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">Each Diner Pays:</p>
                <p className="text-xl font-black text-purple-950 mt-0.5">₹{perPersonEqual}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Includes taxes and staff tip{hasRoundingRemainder ? ` (Diner ${splitCount}: ₹${lastEqualShare.toFixed(2)} for exact total)` : ''}
                </p>
              </div>
            </div>
          ) : (
            /* Itemized Assignment */
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Diners to Split:</span>
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSplitCount(num)}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border transition-all ${
                        splitCount === num ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {num} Diners
                    </button>
                  ))}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">{item.name || item.itemName}</p>
                      <p className="text-[10px] text-slate-400">
                        ₹{item.price || item.priceSnapshot || item.unitPrice} × {item.quantity || 1}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {Array.from({ length: splitCount }, (_, dIdx) => (
                        <button
                          key={dIdx}
                          type="button"
                          onClick={() => setItemAssignments(prev => ({ ...prev, [idx]: dIdx }))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                            (itemAssignments[idx] ?? 0) === dIdx
                              ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          D{dIdx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Breakdown per person */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                {Array.from({ length: splitCount }, (_, dIdx) => (
                  <div key={dIdx} className="bg-white p-2.5 rounded-xl border border-purple-200 text-center shadow-2xs">
                    <span className="text-[10px] text-purple-700 font-bold">Diner {dIdx + 1}:</span>
                    <p className="font-black text-slate-900 text-xs mt-0.5">₹{getItemDinerTotal(dIdx)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gratuity / Tip Selection */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Staff Tip (Gratuity):</span>
              <span className="font-black text-slate-900 text-xs">
                {computedTip > 0 ? `₹${computedTip}` : 'No tip selected'}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[0, 5, 10, 15].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => { setTipPercent(pct); setCustomTip(''); }}
                  className={`py-2 rounded-xl font-bold border text-xs transition-all ${
                    tipPercent === pct
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {pct === 0 ? '0%' : `${pct}%`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTipPercent(-1)}
                className={`py-2 rounded-xl font-bold border text-xs transition-all ${
                  tipPercent === -1
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Custom
              </button>
            </div>
            {tipPercent === -1 && (
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Enter custom tip amount in ₹"
                value={customTip}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomTip(val === '' ? '' : String(Math.max(0, Number(val) || 0)));
                }}
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white text-slate-800"
              />
            )}
          </div>

          {/* Loyalty Rewards Lookup (Feature 6) */}
          <div className="bg-indigo-50/80 p-4 rounded-2xl border border-indigo-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <Gift size={14} className="text-indigo-600" />
                Customer Loyalty Rewards
              </span>
              {loyaltyAccount && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900 text-[10px] font-black uppercase">
                  {loyaltyAccount.tier || 'BRONZE'}
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
                  className="flex-1 p-2.5 rounded-xl border border-indigo-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
                />
                <button
                  type="submit"
                  disabled={isCheckingLoyalty}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-colors shrink-0 shadow-xs"
                >
                  {isCheckingLoyalty ? 'Checking...' : 'Check'}
                </button>
              </form>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-indigo-900">
                  <span>Available Points: <strong>{loyaltyAccount.pointsBalance} pts</strong></span>
                  <div className="flex items-center gap-2">
                    <span>Value: <strong>₹{(loyaltyAccount.pointsBalance * 0.5).toFixed(0)}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoyaltyAccount(null);
                        setRedeemedPoints(0);
                        setLoyaltyDiscount(0);
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
                {loyaltyAccount.pointsBalance >= 100 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[100, 200, 500].filter(pts => pts <= loyaltyAccount.pointsBalance).map(pts => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => handleRedeemPoints(pts)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                          redeemedPoints === pts
                            ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs'
                            : 'bg-white text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        Redeem {pts} pts (-₹{pts * 0.5})
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-indigo-700 font-medium">Minimum 100 points required to redeem a discount.</p>
                )}
                {loyaltyDiscount > 0 && (
                  <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <Check size={12} strokeWidth={3} />
                    <span>Loyalty Discount Applied: -₹{loyaltyDiscount}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Grand Total Summary */}
          <div className="bg-slate-100 p-4 rounded-2xl space-y-1.5 font-semibold text-slate-600 text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (CGST 2.5% + SGST 2.5%):</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            {computedTip > 0 && (
              <div className="flex justify-between text-indigo-700">
                <span>Staff Gratuity / Tip:</span>
                <span>+₹{computedTip.toFixed(2)}</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Loyalty Rewards Discount:</span>
                <span>-₹{loyaltyDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>Final Total:</span>
              <span className="text-base text-purple-700">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              addToast(`Split calculation applied! Grand total: ₹${grandTotal.toFixed(2)} (${splitCount} shares).`, 'success');
              onPaymentSuccess?.({
                splitCount,
                splitMode,
                tipAmount: computedTip,
                loyaltyDiscount,
                grandTotal
              });
              onClose();
            }}
            className="flex-1 py-3 rounded-2xl bg-slate-900 hover:bg-black active:scale-95 text-white font-bold transition-all shadow-md text-xs flex items-center justify-center gap-1.5"
          >
            <Check size={15} />
            <span>Confirm & Proceed</span>
          </button>
        </div>
      </div>
    </div>
  );
}
