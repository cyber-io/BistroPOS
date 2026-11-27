import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock, Coffee, Leaf, MapPin, Phone, Mail, Plus, QrCode, Truck, UtensilsCrossed } from 'lucide-react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_HOURS = {
  monday: { open: '10:00', close: '23:00' },
  tuesday: { open: '10:00', close: '23:00' },
  wednesday: { open: '10:00', close: '23:00' },
  thursday: { open: '10:00', close: '23:00' },
  friday: { open: '10:00', close: '23:30' },
  saturday: { open: '10:00', close: '23:30' },
  sunday: { open: '10:00', close: '23:00' }
};

const formatHour = value => {
  if (!value) return '';
  if (/AM|PM/i.test(value)) return value;
  const parts = String(value).split(':');
  if (parts.length < 2) return value;
  const [h, m] = parts;
  return `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? 'PM' : 'AM'}`;
};

const HERO_DISH_IMAGE = '/images/reference/salad-bowl.webp';

export default function HomePage() {
  const location = useLocation();
  const [restaurant, setRestaurant] = useState(null);
  const [popularItems, setPopularItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const { addItem, setOrderSource } = useCart();
  const { addToast } = useNotification();
  const rQuery = location.search.includes('r=') ? location.search : (restaurant?.restaurantCode ? `?r=${encodeURIComponent(restaurant.restaurantCode)}` : (restaurant?.restaurantId ? `?r=${encodeURIComponent(restaurant.restaurantId)}` : ''));

  // Level 1: Dynamic settings & Level 2: Themes
  const settings = restaurant?.settings || {};
  const branding = settings.branding || {};
  const sections = settings.sectionsVisibility || {};
  const themeId = settings.themeId || 'MODERN_BISTRO';

  const showBookTable = sections.showBookTable !== false;
  const showOnlineDelivery = sections.showOnlineDelivery !== false;
  const showTakeaway = sections.showTakeaway !== false;
  const showOurStory = sections.showOurStory !== false;
  const showVisit = sections.showVisit !== false;

  // Apply dynamic colors & theme classes
  useEffect(() => {
    if (!restaurant) return;
    const root = document.documentElement;
    if (branding.primaryColor) {
      root.style.setProperty('--website-primary', branding.primaryColor);
      root.style.setProperty('--website-primary-dark', branding.primaryColor);
      root.style.setProperty('--website-primary-deep', branding.primaryColor);
    }
    if (branding.accentColor) {
      root.style.setProperty('--website-accent', branding.accentColor);
      root.style.setProperty('--website-accent-dark', branding.accentColor);
    }
    const shell = document.querySelector('.website-shell');
    if (shell) {
      shell.classList.remove('theme-fine-dine', 'theme-fast-food', 'theme-coffee-cafe');
      if (themeId === 'FINE_DINE') shell.classList.add('theme-fine-dine');
      else if (themeId === 'FAST_FOOD') shell.classList.add('theme-fast-food');
      else if (themeId === 'COFFEE_CAFE') shell.classList.add('theme-coffee-cafe');
    }
    return () => {
      root.style.removeProperty('--website-primary');
      root.style.removeProperty('--website-primary-dark');
      root.style.removeProperty('--website-primary-deep');
      root.style.removeProperty('--website-accent');
      root.style.removeProperty('--website-accent-dark');
      if (shell) {
        shell.classList.remove('theme-fine-dine', 'theme-fast-food', 'theme-coffee-cafe');
      }
    };
  }, [restaurant, branding.primaryColor, branding.accentColor, themeId]);

  // Instant section jump handler for in-page navigation (e.g. #our-story, #visit)
  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const jumpToSection = () => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'auto' });
        }
      };
      jumpToSection();
      const t1 = setTimeout(jumpToSection, 40);
      const t2 = setTimeout(jumpToSection, 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [location.pathname, location.hash]);

  useEffect(() => { setOrderSource('DELIVERY'); }, [setOrderSource]);

  useEffect(() => {
    let active = true;
    async function loadData(silent = false) {
      if (!silent) { setLoading(true); setError(''); }
      try {
        // 1. First fetch restaurant branding & info so name & logo ALWAYS update immediately
        const rest = await api.getRestaurant().catch(() => null);
        if (active && rest) {
          setRestaurant(rest);
          if (rest.name) {
            document.title = `${rest.name} — Gourmet Dining & Online Ordering`;
          }
        }

        // 2. Then load menu items and categories
        const [items, cats] = await Promise.all([
          api.getMenuItems().catch(() => []),
          api.getCategories().catch(() => [])
        ]);
        if (active) {
          setPopularItems(items.slice(0, 6));
          setCategories(cats);
        }
      } catch (err) {
        if (active && !silent) setError(err.message || 'Our menu is temporarily unavailable. Please try again.');
      } finally { if (active && !silent) setLoading(false); }
    }
    loadData();
    const unsubscribe = subscribeRealtimeEvents(type => { if (type === 'FOOD_AVAILABILITY_CHANGED') loadData(true); });
    const onOutletChanged = () => { loadData(true); };
    window.addEventListener('rs_outlet_changed', onOutletChanged);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('rs_outlet_changed', onOutletChanged);
    };
  }, [retry, location.search]);

  const rawHours = (restaurant?.openingHours && typeof restaurant.openingHours === 'object')
    ? restaurant.openingHours
    : {};

  const normalizeDayValue = (val, dayName) => {
    if (val && typeof val === 'object' && val.open && val.close) {
      return `${formatHour(val.open)} – ${formatHour(val.close)}`;
    }
    if (typeof val === 'string' && val.includes('-')) {
      const [o, c] = val.split('-');
      return `${formatHour(o.trim())} – ${formatHour(c.trim())}`;
    }
    const def = DEFAULT_HOURS[dayName] || { open: '10:00', close: '23:00' };
    return `${formatHour(def.open)} – ${formatHour(def.close)}`;
  };

  const hours = weekdays.map(day => {
    const val = rawHours[day] || rawHours[day.slice(0, 3)];
    const timeDisplay = normalizeDayValue(val, day);
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    return [dayLabel, timeDisplay];
  });
  const address = restaurant?.address;

  return (
    <main className="website-home">
      {/* Hero Section */}
      <section className="website-hero" aria-labelledby="website-hero-title">
        <div className="website-hero-orbit" aria-hidden="true" />
        <div className="website-hero-art" aria-hidden="true">
          <div className="website-orbit-rings">
            {Array.from({ length: 6 }, (_, i) => <span key={i} />)}
          </div>
          <img
            className="website-hero-leaf website-hero-leaf--top"
            src="/images/reference/basil-leaf.webp"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <img
            className="website-hero-leaf website-hero-leaf--bottom"
            src="/images/reference/basil-leaf.webp"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <img
            className="website-hero-tomato website-hero-tomato--top"
            src="/images/reference/cherry-tomato.webp"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <img
            className="website-hero-tomato website-hero-tomato--bottom"
            src="/images/reference/cherry-tomato.webp"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <Leaf
            className="website-hero-sketch website-hero-sketch--one"
            strokeWidth={1}
          />
          <UtensilsCrossed
            className="website-hero-sketch website-hero-sketch--two"
            strokeWidth={1}
          />
          <span className="website-hero-speck" />
          <img
            className="website-hero-dish"
            src={branding.heroImage || HERO_DISH_IMAGE}
            alt={`${restaurant?.name || 'Bistro & Bloom'} Signature Plate`}
            fetchpriority="high"
          />
        </div>

        {/* Right Column: Hero Copy & CTA */}
        <div className="website-hero-copy">
          <p className="website-script">{restaurant?.name || 'Bistro & Bloom'}</p>
          <p className="website-eyebrow">{branding.heroEyebrow || 'A fresh take on the everyday'}</p>
          <h1 id="website-hero-title">
            {branding.heroHeadline ? (
              branding.heroHeadline.includes('\n') ? (
                branding.heroHeadline.split('\n').map((line, idx) => (
                  <React.Fragment key={idx}>{line}{idx === 0 && <br />}</React.Fragment>
                ))
              ) : branding.heroHeadline
            ) : (
              <>Good food.<br />Beautiful moments.</>
            )}
          </h1>
          <p className="website-hero-description">
            {branding.heroDescription || 'Vibrant plates, comforting flavours, and a little time to savour it all. Come for a meal. Stay for the feeling.'}
          </p>
          <div className="website-hero-links">
            {showBookTable && (
              <Link to={`/book-table${rQuery}`} className="website-button website-button--red">
                Reserve a table<ArrowUpRight size={17} />
              </Link>
            )}
            <Link to={`/menu${rQuery}`} className={showBookTable ? "website-button website-button--outline" : "website-button website-button--red"}>
              <UtensilsCrossed size={17} /> See today’s menu
            </Link>
            {showVisit && (
              <a href="#visit" className="website-location-link">
                <MapPin size={17} />Find your way here
              </a>
            )}
          </div>
          <Link to={`/menu${rQuery}`} className="website-explore-link">
            Explore our menu<ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Services Strip */}
      <section className="website-service-strip" aria-label="Ways to enjoy the bistro">
        <span><Coffee size={19} />A cup worth slowing down for</span>
        <span><UtensilsCrossed size={19} />Good things, freshly made</span>
        {showOnlineDelivery && (
          <Link to={`/menu${rQuery ? `${rQuery}&` : '?'}source=DELIVERY`}><Truck size={19} />Your favourites, delivered<ArrowUpRight size={14} /></Link>
        )}
      </section>

      {/* Popular Menu Items */}
      <section className="website-section" id="favourites">
        <div className="website-section-heading">
          <div><p className="website-eyebrow">From our kitchen, with love</p><h2>Find your next favourite.</h2></div>
          <Link className="website-text-link" to="/menu">View the full menu<ArrowUpRight size={16} /></Link>
        </div>
        {loading ? (
          <p className="website-menu-status" role="status">A little goodness is on its way. Loading our menu…</p>
        ) : error ? (
          <div className="website-menu-status" role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry(n => n + 1)} className="website-text-link">Try again<ArrowRight size={15} /></button>
          </div>
        ) : popularItems.length ? (
          <div className="website-food-grid">
            {popularItems.map(item => (
              <article className="website-food-card" key={item.menuItemId}>
                <div className="website-food-image">
                  <img src={item.image} alt={item.name} loading="lazy" />
                  <span className="website-food-category">{item.categoryName}</span>
                  {!item.availability && <span className="website-sold-out">Currently unavailable</span>}
                </div>
                <div className="website-food-details">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="website-food-bottom">
                    <span>₹{item.price}</span>
                    <button onClick={() => setSelectedItem(item)} disabled={!item.availability} aria-label={`Add ${item.name} to your order`}>
                      <Plus size={16} />Add to order
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="website-menu-status">Our kitchen is preparing the next chapter. Check back soon for the latest menu.</p>
        )}
        {categories.length > 0 && (
          <div className="website-categories" aria-label="Menu categories">
            {categories.map(category => (
              <Link key={category.categoryId} to={`/menu?category=${encodeURIComponent(category.categoryId)}`}>
                <span>{category.icon}</span>{category.name}<ArrowUpRight size={14} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Story Section */}
      {showOurStory && (
        <section className="website-story" id="our-story">
          <div className="website-story-art">
            <div className="website-story-circle" />
            <img src={branding.storyImage || "/images/reference/salad-bowl.webp"} alt="Made with care" loading="lazy" />
            <span className="website-story-note">Made with care.<br />Meant to be shared.</span>
          </div>
          <div className="website-story-copy">
            <p className="website-eyebrow">{branding.storyEyebrow || 'The heart of the bistro'}</p>
            <h2>
              {branding.storyTitle ? (
                branding.storyTitle.includes('\n') ? (
                  branding.storyTitle.split('\n').map((line, idx) => (
                    <React.Fragment key={idx}>{line}{idx === 0 && <br />}</React.Fragment>
                  ))
                ) : branding.storyTitle
              ) : (
                <>A seat at the table.<br />A moment of your own.</>
              )}
            </h2>
            <p>{branding.storyText || `Some of the best moments happen over a meal. A long overdue catch-up, a quiet lunch, an evening with your favourite people. At ${restaurant?.name || 'Bistro & Bloom'}, there’s room for all of them.`}</p>
            {showBookTable && (
              <Link to={`/book-table${rQuery}`} className="website-button website-button--red">Make a little time<ArrowUpRight size={17} /></Link>
            )}
          </div>
        </section>
      )}

      {/* Order Banner */}
      {(showOnlineDelivery || showTakeaway) && (
        <section className="website-order-banner">
          <div>
            <p className="website-eyebrow">Make yourself at home</p>
            <h2>The bistro, wherever you are.</h2>
            <p>Set the table at home, or take something delicious on your way.</p>
          </div>
          <div className="website-order-actions">
            {showOnlineDelivery && (
              <Link to={`/menu${rQuery ? `${rQuery}&` : '?'}source=DELIVERY`} className="website-button website-button--pink"><Truck size={17} />Order delivery</Link>
            )}
            {showTakeaway && (
              <Link to={`/menu${rQuery ? `${rQuery}&` : '?'}source=TAKEAWAY`} className="website-button website-button--outline">Choose takeaway<ArrowUpRight size={17} /></Link>
            )}
          </div>
        </section>
      )}

      {/* Visit Section */}
      {showVisit && (
        <section className="website-section website-visit" id="visit">
          <div className="website-visit-intro">
            <p className="website-eyebrow">We’d love to see you</p>
            <h2>Your next good<br />moment starts here.</h2>
            <p>Come as you are. Bring someone along. There’s always a reason to gather around a good meal.</p>
            {showBookTable && (
              <Link to={`/book-table${rQuery}`} className="website-button website-button--red">Book your table<ArrowUpRight size={17} /></Link>
            )}
          </div>
          <div className="website-visit-details">
            <div>
              <h3><Clock size={18} />Opening hours</h3>
              {hours.length ? (
                <dl>{hours.map(([day, timeDisplay]) => <div key={day}><dt>{day}</dt><dd>{timeDisplay}</dd></div>)}</dl>
              ) : <p>Contact the restaurant for today’s opening hours.</p>}
            </div>
            <div>
              <h3><MapPin size={18} />Come on over</h3>
              {address ? (
                <>
                  <p>{address}</p>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="website-text-link">Get directions<ArrowUpRight size={14} /></a>
                </>
              ) : <p>Get in touch with our team for location details.</p>}
              {restaurant?.phone && <a className="website-contact-link" href={`tel:${restaurant.phone}`}><Phone size={15} />{restaurant.phone}</a>}
              {restaurant?.email && <a className="website-contact-link" href={`mailto:${restaurant.email}`}><Mail size={15} />{restaurant.email}</a>}
            </div>
          </div>
          <div className="website-qr-note">
            <QrCode size={27} />
            <div>
              <h3>Already at your table?</h3>
              <p>Scan your table’s QR code to browse, order, or call your waiter.</p>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="website-footer">
        <Link to={`/${rQuery}`} className="website-footer-brand">{restaurant?.name || 'Bistro & Bloom'}<span>Good food. Beautiful moments.</span></Link>
        <nav aria-label="Footer navigation">
          <Link to={`/menu${rQuery}`}>Our menu</Link>
          {showBookTable && <Link to={`/book-table${rQuery}`}>Reservations</Link>}
          <Link to={`/track-order${rQuery}`}>Track your order</Link>
          <Link to="/pos/login" style={{ opacity: 0.7, fontSize: '0.85rem' }}>Staff Portal ↗</Link>
        </nav>
        <p>© {new Date().getFullYear()} {restaurant?.name || 'Bistro & Bloom'}</p>
      </footer>

      {/* Customization Modal */}
      <ItemCustomizationModal
        isOpen={Boolean(selectedItem)}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={(item, qty, cust, addons, note) => {
          addItem(item, qty, cust, addons, note);
          addToast(`Added ${item.name} to your basket.`, 'success');
        }}
      />
    </main>
  );
}
