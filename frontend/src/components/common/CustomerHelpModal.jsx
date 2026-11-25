import React, { useState } from 'react';
import { api } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useNotification } from '../../context/NotificationContext';
import { HelpCircle, GlassWater, UtensilsCrossed, Flame, Candy, UserCheck, X, Check, ScrollText, Sparkles, Receipt } from 'lucide-react';

export default function CustomerHelpModal({ isOpen, onClose, tableNumber, table }) {
  const { addToast } = useNotification();
  const [selectedIssue, setSelectedIssue] = useState('');
  const [selectedType, setSelectedType] = useState('CUSTOM');
  const [customText, setCustomText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isOpen) return null;

  const tableName = tableTitle(table || { tableNumber });

  const QUICK_SERVICES = [
    { id: 'water', label: 'Water', icon: GlassWater, type: 'WATER', message: 'Requested fresh drinking water' },
    { id: 'tissues', label: 'Tissues', icon: ScrollText, type: 'TISSUES', message: 'Requested fresh napkins & tissues' },
    { id: 'clean', label: 'Table Cleaning', icon: Sparkles, type: 'TABLE_CLEANING', message: 'Requested table cleaning & wipe' },
    { id: 'bill', label: 'Get Bill', icon: Receipt, type: 'BILL', message: 'Requested dining bill & payment' }
  ];

  const HELP_OPTIONS = [
    { id: 'cutlery', label: 'Need cutlery / extra plates', icon: UtensilsCrossed, type: 'CUSTOM' },
    { id: 'waiter', label: 'Need waiter assistance', icon: UserCheck, type: 'CUSTOM' },
    { id: 'sweet', label: 'Which food is sweet?', icon: Candy, type: 'CUSTOM' },
    { id: 'spicy', label: 'Which food is spicy?', icon: Flame, type: 'CUSTOM' }
  ];

  const sendQuickService = async (item) => {
    setIsSubmitting(true);
    try {
      await api.createHelpRequest(tableNumber, item.message, item.type);
      setStatusMessage(`${item.label} request sent! A waiter is on the way.`);
      addToast(`${item.label} request for ${tableName} sent to floor staff.`, 'info');
      setTimeout(() => {
        setIsSubmitting(false);
        setStatusMessage(null);
        setSelectedIssue('');
        setSelectedType('CUSTOM');
        setCustomText('');
        onClose();
      }, 1500);
    } catch {
      setIsSubmitting(false);
      addToast('Failed to send help request. Please try again.', 'error');
    }
  };

  const handleSubmit = async () => {
    const finalMsg = customText.trim() || selectedIssue;
    if (!finalMsg) return;

    setIsSubmitting(true);
    try {
      await api.createHelpRequest(tableNumber, finalMsg, selectedType);
      setStatusMessage('Help request sent! A waiter has been alerted.');
      addToast(`Assistance request for ${tableName} sent to floor staff.`, 'info');
      setTimeout(() => {
        setIsSubmitting(false);
        setStatusMessage(null);
        setSelectedIssue('');
        setSelectedType('CUSTOM');
        setCustomText('');
        onClose();
      }, 1500);
    } catch {
      setIsSubmitting(false);
      addToast('Failed to send help request. Please try again.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{tableName} Assistance</h3>
            <p className="text-xs text-slate-500">Tap for instant 1-touch service or custom request</p>
          </div>
        </div>

        {statusMessage ? (
          <div className="py-8 text-center text-emerald-600 font-semibold space-y-2">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <Check className="w-6 h-6" />
            </div>
            <p>{statusMessage}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick 1-touch Actions */}
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">1-Touch Quick Service</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {QUICK_SERVICES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => sendQuickService(item)}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-xs font-semibold transition-all active:scale-95 text-center gap-1.5"
                    >
                      <Icon className="w-5 h-5 text-brand-600" />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* General Requests */}
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Common Inquiries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HELP_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedIssue === opt.label;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSelectedIssue(opt.label);
                        setSelectedType(opt.type);
                        setCustomText('');
                      }}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0 text-brand-500" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Or type special request:
              </label>
              <textarea
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  setSelectedIssue('');
                  setSelectedType('CUSTOM');
                }}
                rows={2}
                placeholder="e.g. Please bring extra ice, mild sauce..."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-3d-pill flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || (!selectedIssue && !customText.trim())}
                onClick={handleSubmit}
                className="btn-3d-crimson flex-1 py-2.5 px-4 rounded-xl disabled:opacity-50 text-white text-xs font-bold transition-all"
              >
                {isSubmitting ? 'Sending Request...' : 'Call Waiter Now'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
