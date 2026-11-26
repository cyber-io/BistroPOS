import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import { translations, getCategoryTranslation } from '../../services/menuTranslations';
import { Flame, Candy, Utensils, ShoppingBag, Plus, Sparkles, ChevronDown, Check, SlidersHorizontal, X } from 'lucide-react';

export default function PublicMenuPage({ onOpenCart }) {
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'ALL');
  const [dietaryFilter, setDietaryFilter] = useState('ALL'); // ALL, VEG, NON_VEG, VEGAN, GLUTEN_FREE, SPECIAL
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelRef = useRef(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryPanelRef = useRef(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const t = translations[lang] || translations.en;
  const { addItem, items, itemCount, orderSource, setOrderSource } = useCart();
  const { addToast } = useNotification();

  useEffect(() => {
    if (!isFilterOpen && !isCategoryOpen) return;
    const handler = (e) => {
      if (isFilterOpen && filterPanelRef.current && !filterPanelRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
      if (isCategoryOpen && categoryPanelRef.current && !categoryPanelRef.current.contains(e.target)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isFilterOpen, isCategoryOpen]);

  useEffect(() => {
    const requestedSource = searchParams.get('source');
    if (requestedSource === 'TAKEAWAY' || requestedSource === 'DELIVERY') setOrderSource(requestedSource);
    else if (orderSource === 'DINE_IN_QR') setOrderSource('DELIVERY');
  }, [setOrderSource, searchParams, orderSource]);
  useEffect(() => {
    let active = true;
    const load = async (silent = false) => {
      if (!silent) { setLoading(true); setError(''); }
      try {
        const [cats, items] = await Promise.all([api.getCategories(), api.getMenuItems()]);
        if (active) { setCategories(cats); setMenuItems(items); }
      } catch (err) { if (active && !silent) setError(err.message || 'Unable to load the menu. Please try again.'); }
      finally { if (active && !silent) setLoading(false); }
    };
    load();
    const unsubscribe = subscribeRealtimeEvents(type => { if (type === 'FOOD_AVAILABILITY_CHANGED') load(true); });
    const timer = setInterval(() => load(true), 15000);
    return () => { active = false; unsubscribe(); clearInterval(timer); };
  }, [retry]);

  useEffect(() => { setActiveCategory(searchParams.get('category') || 'ALL'); }, [searchParams]);

  const filteredItems = menuItems.filter(item => {
    const matchesCat = activeCategory === 'ALL' || item.categoryId === activeCategory;
    const matchesDietary =
      dietaryFilter === 'ALL' ||
      (dietaryFilter === 'VEG' && item.vegNonveg === 'VEG') ||
      (dietaryFilter === 'NON_VEG' && item.vegNonveg === 'NON_VEG') ||
      (dietaryFilter === 'VEGAN' && (item.dietaryTags || []).some(t => /vegan/i.test(t))) ||
      (dietaryFilter === 'GLUTEN_FREE' && (item.dietaryTags || []).some(t => /gluten/i.test(t))) ||
      (dietaryFilter === 'SPECIAL' && Boolean(item.isSpecial));
    return matchesCat && matchesDietary;
  });

  return (
    <div className="website-subpage min-h-screen bg-[#FAF1F0] text-[#11164B] py-8 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8 font-sans selection:bg-[#11164B] selection:text-[#FAF1F0]">
      {/* Title */}
      <div className="text-center space-y-2">
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-[#11164B]/70">
          Seasonal Selection
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#11164B] tracking-tight">
          Explore Our Menu
        </h1>
        <p className="text-xs sm:text-sm text-[#75666B] max-w-md mx-auto">
          Fresh, wholesome delicacies handcrafted to order with seasonal ingredients.
        </p>
      </div>

      {loading && <p role="status" className="py-8 text-center text-sm text-[#75666B]">Loading today’s menu…</p>}
      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">{error}<button onClick={() => setRetry(n=>n+1)} className="ml-3 underline">Try again</button></div>}
      {!loading && !error && !filteredItems.length && <p className="rounded-xl border border-[#E8D1CE] bg-white py-10 text-center text-sm text-[#75666B]">No dishes match your selection. Try another category or filter.</p>}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filters Dropdown */}
        {(() => {
          const isDietaryActive = dietaryFilter !== 'ALL';
          const dietaryLabel = {
            ALL: 'All',
            VEG: '🟢 Pure Veg',
            NON_VEG: '🔴 Non-Veg',
            VEGAN: '🌱 Vegan',
            GLUTEN_FREE: '🌾 Gluten-Free',
            SPECIAL: '⭐ Daily Specials',
          }[dietaryFilter] || 'All';

          return (
            <div className="relative shrink-0" ref={filterPanelRef}>
              <button
                type="button"
                onClick={() => {
                  setIsFilterOpen(o => !o);
                  setIsCategoryOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                  isDietaryActive
                    ? 'bg-[#11164B] text-[#FAF1F0] border-[#11164B]'
                    : 'bg-white text-[#11164B] border-[#E8D1CE] hover:bg-[#FAF1F0]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
                {isDietaryActive && (
                  <span className="bg-white/20 text-[#FAF1F0] text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                    {dietaryLabel}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-2xl border border-[#E8D1CE] shadow-xl p-4 w-72">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#11164B] flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
                    </span>
                    {isDietaryActive && (
                      <button
                        type="button"
                        onClick={() => setDietaryFilter('ALL')}
                        className="text-[10px] text-rose-600 font-bold hover:text-rose-800 flex items-center gap-0.5"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>

                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-[#75666B] uppercase tracking-wider mb-1.5">Type</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { val: 'ALL', label: 'All' },
                        { val: 'VEG', label: '🟢 Pure Veg' },
                        { val: 'NON_VEG', label: '🔴 Non-Veg' },
                      ].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setDietaryFilter(opt.val)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                            dietaryFilter === opt.val
                              ? 'bg-[#11164B] text-[#FAF1F0] border-[#11164B]'
                              : 'bg-[#FAF1F0] text-[#11164B] border-[#E8D1CE] hover:bg-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-[#75666B] uppercase tracking-wider mb-1.5">Dietary</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { val: 'SPECIAL', label: '⭐ Daily Specials' },
                        { val: 'VEGAN', label: '🌱 Vegan' },
                        { val: 'GLUTEN_FREE', label: '🌾 Gluten-Free' },
                      ].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setDietaryFilter(dietaryFilter === opt.val ? 'ALL' : opt.val)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                            dietaryFilter === opt.val
                              ? 'bg-[#11164B] text-[#FAF1F0] border-[#11164B]'
                              : 'bg-[#FAF1F0] text-[#11164B] border-[#E8D1CE] hover:bg-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Category Dropdown */}
        {(() => {
          const activeCatObj = categories.find(c => c.categoryId === activeCategory);
          const isCatFiltered = activeCategory !== 'ALL' && Boolean(activeCatObj);
          return (
            <div className="relative shrink-0" ref={categoryPanelRef}>
              <button
                type="button"
                onClick={() => {
                  setIsCategoryOpen(o => !o);
                  setIsFilterOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                  isCatFiltered
                    ? 'bg-[#11164B] text-[#FAF1F0] border-[#11164B]'
                    : 'bg-white text-[#11164B] border-[#E8D1CE] hover:bg-[#FAF1F0]'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Category</span>
                {isCatFiltered && (
                  <span className="bg-white/20 text-[#FAF1F0] text-[10px] font-semibold px-1.5 py-0.5 rounded-md max-w-[110px] truncate">
                    {activeCatObj.icon} {activeCatObj.name}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} />
              </button>

              {isCategoryOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-2xl border border-[#E8D1CE] shadow-xl p-2 w-56 max-h-72 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('ALL');
                      setIsCategoryOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeCategory === 'ALL'
                        ? 'bg-[#11164B] text-[#FAF1F0]'
                        : 'text-[#75666B] hover:bg-[#FAF1F0] hover:text-[#11164B]'
                    }`}
                  >
                    <span>All Categories</span>
                    {activeCategory === 'ALL' && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>

                  {categories.map(cat => {
                    const isActive = activeCategory === cat.categoryId;
                    return (
                      <button
                        key={cat.categoryId}
                        type="button"
                        onClick={() => {
                          setActiveCategory(cat.categoryId);
                          setIsCategoryOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all mt-0.5 ${
                          isActive
                            ? 'bg-[#11164B] text-[#FAF1F0]'
                            : 'text-[#75666B] hover:bg-[#FAF1F0] hover:text-[#11164B]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span>{cat.icon}</span>
                          <span className="truncate">{cat.name}</span>
                        </span>
                        {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Menu Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map(item => (
          <div
            key={item.menuItemId}
            className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group ${
              !item.availability ? 'opacity-60 bg-[#FAF1F0] border-[#E8D1CE]' : 'border-[#E8D1CE]'
            }`}
          >
            <div className="space-y-3">
              <div className="relative h-48 rounded-xl overflow-hidden bg-[#F3E2DF]">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 flex-wrap gap-1">
                  <span className={`w-4 h-4 rounded-sm border bg-white/95 flex items-center justify-center ${
                    item.vegNonveg === 'VEG' ? 'border-emerald-600' : 'border-rose-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      item.vegNonveg === 'VEG' ? 'bg-emerald-600' : 'bg-rose-600'
                    }`} />
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#11164B]/80 text-[#FAF1F0] backdrop-blur-xs">
                    {item.categoryName}
                  </span>
                  {item.isSpecial && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                      ⭐ Chef Special
                    </span>
                  )}
                </div>
                {!item.availability && (
                  <div className="absolute inset-0 bg-[#11164B]/70 flex items-center justify-center text-[#FAF1F0] font-medium text-xs">
                    Currently Unavailable
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-serif text-lg font-bold text-[#11164B] group-hover:text-[#232963] transition-colors leading-snug">
                  {item.name}
                </h3>
                <p className="text-xs text-[#75666B] line-clamp-2 mt-1 leading-relaxed">
                  {item.description}
                </p>
                {item.isSweet && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded font-medium">Sweet</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E8D1CE]">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#75666B]">Price</span>
                <p className="text-base font-bold text-[#11164B]">
                  ₹{item.portions && item.portions.length > 0 ? item.portions[0].price : item.price}
                </p>
              </div>

              {item.availability ? (
                <button
                  onClick={() => setSelectedItemForModal(item)}
                  className="btn-3d-menu-add px-4 py-2 rounded-lg text-[#FAF1F0] text-xs font-medium inline-flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Order</span>
                </button>
              ) : (
                <span className="text-xs font-medium text-[#75666B]">Sold Out</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Customization Modal */}
      <ItemCustomizationModal
        isOpen={Boolean(selectedItemForModal)}
        onClose={() => setSelectedItemForModal(null)}
        item={selectedItemForModal}
        onAddToCart={(item, qty, cust, addons, note, portion) => {
          addItem(item, qty, cust, addons, note, portion);
          addToast(`Added ${item.name}${portion ? ` (${portion.name})` : ''} to cart.`, 'success');
        }}
      />
    </div>
  );
}
