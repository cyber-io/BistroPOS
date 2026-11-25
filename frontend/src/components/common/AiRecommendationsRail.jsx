import React from 'react';
import { Sparkles, Plus, Check, Utensils } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';

export default function AiRecommendationsRail({ menuItems = [], cartItems = [], lang = 'en' }) {
  const { addItem } = useCart();
  const { addToast } = useNotification();

  // Determine intelligent pairings
  const cartCategories = (cartItems || []).map(i => (i.categoryName || '').toLowerCase());
  const cartNames = (cartItems || []).map(i => (i.name || '').toLowerCase());
  const hasBeverage = cartCategories.some(c => c.includes('beverage') || c.includes('drink')) || cartNames.some(n => n.includes('shake') || n.includes('mojito') || n.includes('cola') || n.includes('coffee') || n.includes('tea'));
  const hasDessert = cartCategories.some(c => c.includes('dessert')) || cartNames.some(n => n.includes('cake') || n.includes('jamun') || n.includes('ice cream') || n.includes('brownie') || n.includes('halwa'));

  // Filter recommendations from menu that are available and not yet in cart
  const recommendations = menuItems.filter(item => {
    if (!item.availability) return false;
    if (cartItems.some(c => c.menuItemId === item.menuItemId || c.id === item.menuItemId)) return false;

    const cat = (item.categoryName || '').toLowerCase();
    const name = (item.name || '').toLowerCase();

    // If customer has meals but no beverage, prioritize beverages
    if (!hasBeverage && (cat.includes('beverage') || cat.includes('drink') || name.includes('mojito') || name.includes('iced') || name.includes('tea') || name.includes('shake'))) {
      return true;
    }

    // If customer has meals but no dessert, prioritize desserts
    if (!hasDessert && (cat.includes('dessert') || name.includes('brownie') || name.includes('jamun') || name.includes('ice cream') || name.includes('dessert'))) {
      return true;
    }

    // Chef specials
    if (item.isSpecial) return true;

    return false;
  }).slice(0, 4);

  if (recommendations.length === 0) return null;

  return (
    <section className="bg-gradient-to-r from-purple-50/90 via-indigo-50/70 to-pink-50/80 rounded-2xl p-3.5 sm:p-4 border border-purple-200/80 shadow-xs space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles size={13} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 tracking-wide uppercase">
              {lang === 'hi' ? 'एआई शेफ की सिफ़ारिशें' : 'AI Chef Recommendations'}
            </h4>
            <p className="text-[10px] text-purple-700 font-semibold hidden sm:block">
              {lang === 'hi' ? 'आपके वर्तमान ऑर्डर के अनुसार विशेष जोड़ियाँ' : 'Intelligent pairings tailored to your meal'}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-purple-800 bg-purple-100/80 border border-purple-200 px-2.5 py-0.5 rounded-full shrink-0">
          {!hasBeverage ? (lang === 'hi' ? '🥤 पेय जोड़ें' : '🥤 Pair with drinks') : !hasDessert ? (lang === 'hi' ? '🍨 मीठा जोड़ें' : '🍨 Add dessert') : (lang === 'hi' ? '⭐ शेफ़्स पिक' : '⭐ Chef’s pick')}
        </span>
      </div>

      {/* Recommendations Cards - Smooth scroll on mobile, 4-col grid on larger screens */}
      <div className="flex sm:grid sm:grid-cols-4 gap-2.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none snap-x snap-mandatory">
        {recommendations.map(item => (
          <article
            key={item.menuItemId}
            className="min-w-[160px] sm:min-w-0 flex-1 bg-white p-3 rounded-xl border border-purple-100/90 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-purple-300 transition-all snap-start"
          >
            <div>
              {/* Category & Tag Pill */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded truncate">
                  {item.categoryName || 'Chef Choice'}
                </span>
                <span className="shrink-0 flex items-center">
                  <span className={`inline-block w-3.5 h-3.5 rounded-sm border p-0.5 flex items-center justify-center ${
                    item.vegNonveg === 'VEG' ? 'border-emerald-600 bg-emerald-50' : 'border-rose-600 bg-rose-50'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      item.vegNonveg === 'VEG' ? 'bg-emerald-600' : 'bg-rose-600'
                    }`} />
                  </span>
                </span>
              </div>

              {/* Item Name */}
              <h5
                className="font-bold text-slate-900 text-xs leading-snug line-clamp-2 min-h-[32px]"
                title={item.name}
              >
                {item.name}
              </h5>

              {/* Ingredients / Description snippet */}
              {item.ingredients ? (
                <p className="text-[10px] text-slate-400 mt-1 truncate" title={item.ingredients}>
                  {item.ingredients}
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                  {item.description || 'Freshly prepared specialty dish'}
                </p>
              )}
            </div>

            {/* Price & Quick Add Button */}
            <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100">
              <div>
                <span className="text-[9px] text-slate-400 block -mb-0.5">Price</span>
                <strong className="text-xs font-black text-slate-900">₹{item.price}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  addItem(item, 1, {}, null, 'Full');
                  addToast(`Added ${item.name} to cart!`, 'success');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-[11px] transition-all shadow-xs flex items-center gap-1 shrink-0"
                title="Quick Add to Cart"
              >
                <Plus size={12} strokeWidth={2.5} />
                <span>{lang === 'hi' ? 'जोड़ें' : 'Add'}</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
