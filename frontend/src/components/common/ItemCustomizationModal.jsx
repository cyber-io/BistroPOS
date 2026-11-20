import React, { useState, useEffect } from 'react';
import { customizationCharge } from '../../context/CartContext';
import { Plus, Minus, X, Flame, Candy, ShoppingBag, AlertTriangle, Sparkles } from 'lucide-react';

export default function ItemCustomizationModal({ isOpen, onClose, item, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedChoices, setSelectedChoices] = useState({});
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [selectedPortion, setSelectedPortion] = useState(null);
  const [specialInstruction, setSpecialInstruction] = useState('');

  useEffect(() => {
    if (!isOpen || !item) return;
    setQuantity(1);
    setSelectedChoices(Object.fromEntries((item.customizationOptions || []).filter(option => option.choices?.length).map(option => [option.name, option.choices[0]])));
    setSelectedAddOns([]);
    setSpecialInstruction('');
    if (item.portions && item.portions.length > 0) {
      setSelectedPortion(item.portions[0]);
    } else {
      setSelectedPortion(null);
    }
  }, [isOpen, item?.menuItemId]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen || !item) return null;

  const toggleAddOn = (addon) => {
    setSelectedAddOns(prev => {
      const exists = prev.some(a => a.name === addon.name);
      return exists ? prev.filter(a => a.name !== addon.name) : [...prev, addon];
    });
  };

  const handleChoiceChange = (optionName, choice) => {
    setSelectedChoices(prev => ({ ...prev, [optionName]: choice }));
  };

  const addOnsTotal = selectedAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const effectiveBasePrice = selectedPortion ? Number(selectedPortion.price) : Number(item.price);
  const unitPrice = effectiveBasePrice + addOnsTotal + customizationCharge(selectedChoices);
  const totalPrice = unitPrice * quantity;

  const handleAdd = () => {
    onAddToCart(item, quantity, selectedChoices, selectedAddOns, specialInstruction.trim(), selectedPortion);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div role="dialog" aria-modal="true" aria-label={`Customize ${item.name}`} className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden border border-slate-100">
        {/* Close Button */}
        <button
          aria-label="Close customization"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-white bg-black/50 hover:bg-black/70 p-1.5 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Image */}
        <div className="relative h-48 w-full bg-slate-100 flex-shrink-0">
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="flex items-center space-x-2 mb-1">
              <span className={`inline-block w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                item.vegNonveg === 'VEG' ? 'border-emerald-400 bg-emerald-950/40' : 'border-rose-400 bg-rose-950/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  item.vegNonveg === 'VEG' ? 'bg-emerald-400' : 'bg-rose-400'
                }`} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {item.categoryName || 'Chef Special'}
              </span>
              {item.isSpecial && (
                <span className="inline-flex items-center text-[10px] bg-amber-500/90 px-1.5 py-0.5 rounded text-white font-bold">
                  ⭐ Special
                </span>
              )}
              {item.isSweet && (
                <span className="inline-flex items-center text-[10px] bg-pink-500/80 px-1.5 py-0.5 rounded text-white font-bold">
                  <Candy className="w-3 h-3 mr-0.5" /> Sweet
                </span>
              )}
              {item.spiceLevel && item.spiceLevel !== 'NONE' && (
                <span className="inline-flex items-center text-[10px] bg-red-500/80 px-1.5 py-0.5 rounded text-white font-bold">
                  <Flame className="w-3 h-3 mr-0.5" /> {item.spiceLevel}
                </span>
              )}
              {(item.dietaryTags || []).map((tag, i) => (
                <span key={i} className="inline-flex items-center text-[10px] bg-emerald-600/90 px-1.5 py-0.5 rounded text-white font-semibold">
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="text-lg font-black leading-snug">{item.name}</h3>
            <p className="text-xs text-slate-300 line-clamp-1">{item.description}</p>
          </div>
        </div>

        {/* Scrollable Customization Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Ingredients & Allergens Information */}
          {(item.ingredients || (item.allergens && item.allergens.length > 0)) && (
            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-1.5 text-xs">
              {item.ingredients && (
                <div className="text-slate-700">
                  <strong className="text-slate-900 font-semibold">Ingredients: </strong>
                  <span>{item.ingredients}</span>
                </div>
              )}
              {item.allergens && item.allergens.length > 0 && (
                <div className="flex items-start gap-1.5 text-amber-950">
                  <span className="font-bold shrink-0 text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Allergens:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {item.allergens.map((alg, i) => (
                      <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-amber-200/80 font-bold text-[10px] text-amber-950">
                        {alg}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Portion Size Selector */}
          {item.portions && item.portions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Portion Size</h4>
                <span className="text-[11px] text-brand-600 font-semibold">Select size</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {item.portions.map(p => {
                  const isSelected = selectedPortion?.name === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedPortion(p)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="font-bold text-slate-900">₹{p.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Options / Choices */}
          {item.customizationOptions && item.customizationOptions.length > 0 && (
            <div className="space-y-3">
              {item.customizationOptions.map((opt) => (
                <div key={opt.name} className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{opt.name}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {opt.choices.map((choice) => {
                      const selected = selectedChoices[opt.name] === choice || (!selectedChoices[opt.name] && choice === opt.choices[0]);
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => handleChoiceChange(opt.name, choice)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
                            selected
                              ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add-ons */}
          {item.addOns && item.addOns.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Extra Add-ons</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {item.addOns.map((addon) => {
                  const isChecked = selectedAddOns.some(a => a.name === addon.name);
                  return (
                    <button
                      key={addon.name}
                      type="button"
                      onClick={() => toggleAddOn(addon)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        isChecked
                          ? 'border-brand-500 bg-brand-50 text-brand-700 font-bold ring-1 ring-brand-500'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{addon.name}</span>
                      <span className="font-bold text-slate-900">+₹{addon.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Instructions */}
          <div>
            <label htmlFor="item-special-instructions" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Special Instructions
            </label>
            <input
              type="text"
              id="item-special-instructions"
              maxLength={500}
              value={specialInstruction}
              onChange={(e) => setSpecialInstruction(e.target.value)}
              placeholder="e.g. Less oil, extra crispy, sauce on the side..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center border border-slate-300 rounded-xl bg-white shadow-sm">
            <button
              aria-label="Decrease quantity"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-l-xl transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-4 text-sm font-black text-slate-800">{quantity}</span>
            <button
              aria-label="Increase quantity"
              onClick={() => setQuantity(q => Math.min(99, q + 1))}
              className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-r-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="website-cart-cta flex-1 py-3 px-4 rounded-xl text-white font-extrabold text-xs sm:text-sm flex items-center justify-center space-x-2"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Cart • ₹{totalPrice.toFixed(2)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
