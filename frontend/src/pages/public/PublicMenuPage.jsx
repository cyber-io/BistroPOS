import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import { Search, Flame, Candy, Utensils, ShoppingBag, Plus, ChevronDown, Check } from 'lucide-react';

export default function PublicMenuPage({ onOpenCart }) {
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'ALL');
  const [vegFilter, setVegFilter] = useState('ALL'); // ALL, VEG, NON_VEG
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const filterPanelRef = useRef(null);
  const categoryPanelRef = useRef(null);

  const { addItem, itemCount, orderSource, setOrderSource } = useCart();
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
        const [rest, cats, items] = await Promise.all([
          api.getRestaurant().catch(() => null),
          api.getCategories(),
          api.getMenuItems()
        ]);
        if (active) {
          if (rest?.name) {
            document.title = `${rest.name} — Menu`;
          }
          setCategories(cats);
          setMenuItems(items);
        }
      } catch (err) { if (active && !silent) setError(err.message || 'Unable to load the menu. Please try again.'); }
      finally { if (active && !silent) setLoading(false); }
    };
    load();
    const unsubscribe = subscribeRealtimeEvents(type => { if (type === 'FOOD_AVAILABILITY_CHANGED') load(true); });
    const onOutletChanged = () => { load(true); };
    window.addEventListener('rs_outlet_changed', onOutletChanged);
    const timer = setInterval(() => load(true), 30000);
    return () => { active = false; unsubscribe(); clearInterval(timer); window.removeEventListener('rs_outlet_changed', onOutletChanged); };
  }, [retry, searchParams]);

  useEffect(() => { setActiveCategory(searchParams.get('category') || 'ALL'); }, [searchParams]);

  const filteredItems = menuItems.filter(item => {
    const matchesCat = activeCategory === 'ALL' || item.categoryId === activeCategory;
    const matchesVeg = vegFilter === 'ALL' || item.vegNonveg === vegFilter;
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesVeg && matchesSearch;
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

      <div className="flex flex-wrap justify-center gap-2">
        <a href="/delivery" className="rounded-full border border-[#E8D1CE] bg-white px-4 py-2 text-xs text-[#75666B] hover:border-[#11164B]">Delivery to your door</a>
        <a href="/takeaway" className="rounded-full border border-[#E8D1CE] bg-white px-4 py-2 text-xs text-[#75666B] hover:border-[#11164B]">Collect at the bistro</a>
        <button onClick={onOpenCart} className="btn-3d-crimson rounded-full px-4 py-2 text-xs font-semibold text-white">View basket ({itemCount})</button>
      </div>
      {loading && <p role="status" className="py-8 text-center text-sm text-[#75666B]">Loading today’s menu…</p>}
      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">{error}<button onClick={() => setRetry(n=>n+1)} className="ml-3 underline">Try again</button></div>}
      {!loading && !error && !filteredItems.length && <p className="rounded-xl border border-[#E8D1CE] bg-white py-10 text-center text-sm text-[#75666B]">No dishes match your selection. Try another category or filter.</p>}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E8D1CE] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#A48A8D]" />
            <input
              type="text"
              aria-label="Search menu"
              placeholder="Search by dish name, ingredients..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-[#E8D1CE] focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B] outline-none transition-colors"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-[#FAF1F0] p-1 rounded-xl w-full sm:w-auto justify-center border border-[#E8D1CE]">
            <button
              onClick={() => setVegFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                vegFilter === 'ALL' ? 'bg-[#11164B] text-[#FAF1F0] shadow-xs' : 'text-[#75666B] hover:text-[#11164B]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setVegFilter('VEG')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-all ${
                vegFilter === 'VEG' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-800 hover:text-emerald-950'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Veg Only</span>
            </button>
            <button
              onClick={() => setVegFilter('NON_VEG')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-all ${
                vegFilter === 'NON_VEG' ? 'bg-rose-700 text-white shadow-xs' : 'text-rose-800 hover:text-rose-950'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Non-Veg</span>
            </button>
          </div>
        </div>

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
                <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5">
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
                <div className="flex items-center space-x-2 mt-2">
                  {item.isSweet && (
                    <span className="text-[10px] text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded font-medium">Sweet</span>
                  )}
                  {item.spiceLevel !== 'NONE' && (
                    <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">{item.spiceLevel}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E8D1CE]">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#75666B]">Price</span>
                <p className="text-base font-bold text-[#11164B]">₹{item.price}</p>
              </div>

              {item.availability ? (
                <button
                  onClick={() => setSelectedItemForModal(item)}
                  className="btn-3d-crimson px-4 py-2 rounded-lg text-white text-xs font-medium inline-flex items-center gap-1.5 transition-all"
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
        onAddToCart={(item, qty, cust, addons, note) => {
          addItem(item, qty, cust, addons, note);
          addToast(`Added ${item.name} to cart.`, 'success');
        }}
      />
    </div>
  );
}
