import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock, Coffee, Leaf, MapPin, Phone, Mail, Plus, QrCode, Truck, UtensilsCrossed } from 'lucide-react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const formatHour = value => {
  if (/AM|PM/i.test(value)) return value;
  const [h, m] = value.split(':');
  return `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? 'PM' : 'AM'}`;
};

const HERO_DISH_IMAGE = '/images/reference/salad-bowl.webp';

export default function HomePage() {
  const [restaurant, setRestaurant] = useState(null);
  const [popularItems, setPopularItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const { addItem, setOrderSource } = useCart();
  const { addToast } = useNotification();

  useEffect(() => { setOrderSource('DELIVERY'); }, [setOrderSource]);

  useEffect(() => {
    let active = true;
    async function loadData(silent = false) {
      if (!silent) { setLoading(true); setError(''); }
      try {
        const [rest, items, cats] = await Promise.all([api.getRestaurant(), api.getMenuItems(), api.getCategories()]);
        if (active) { setRestaurant(rest); setPopularItems(items.slice(0, 6)); setCategories(cats); }
      } catch (err) {
        if (active && !silent) setError(err.message || 'Our menu is temporarily unavailable. Please try again.');
      } finally { if (active && !silent) setLoading(false); }
    }
    loadData();
    const unsubscribe = subscribeRealtimeEvents(type => { if (type === 'FOOD_AVAILABILITY_CHANGED') loadData(true); });
    return () => { active = false; unsubscribe(); };
  }, [retry]);

  const hours = Object.entries(restaurant?.openingHours || {})
    .filter(([, value]) => value && typeof value === 'object' && value.open && value.close)
    .sort(([a], [b]) => weekdays.indexOf(a) - weekdays.indexOf(b));
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
          />
          <img
            className="website-hero-leaf website-hero-leaf--bottom"
            src="/images/reference/basil-leaf.webp"
            alt=""
          />
          <img
            className="website-hero-tomato website-hero-tomato--top"
            src="/images/reference/cherry-tomato.webp"
            alt=""
          />
          <img
            className="website-hero-tomato website-hero-tomato--bottom"
            src="/images/reference/cherry-tomato.webp"
            alt=""
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
            src={HERO_DISH_IMAGE}
            alt="Bistro & Bloom Signature Salad"
            fetchpriority="high"
          />
        </div>

        {/* Right Column: Hero Copy & CTA */}
        <div className="website-hero-copy">
          <p className="website-script">Bistro &amp; Bloom</p>
          <p className="website-eyebrow">A fresh take on the everyday</p>
          <h1 id="website-hero-title">Good food.<br />Beautiful moments.</h1>
          <p className="website-hero-description">
            Vibrant plates, comforting flavours, and a little time to savour it all. Come for a meal. Stay for the feeling.
          </p>
          <div className="website-hero-links">
            <Link to="/book-table" className="website-button website-button--red">
              Reserve a table<ArrowUpRight size={17} />
            </Link>
            <a href="#visit" className="website-location-link">
              <MapPin size={17} />Find your way here
            </a>
          </div>
        </div>
      </section>

      {/* Services Strip */}
      <section className="website-service-strip" aria-label="Ways to enjoy the bistro">
        <span><Coffee size={19} />A cup worth slowing down for</span>
        <span><UtensilsCrossed size={19} />Good things, freshly made</span>
        <Link to="/menu?source=DELIVERY"><Truck size={19} />Your favourites, delivered<ArrowUpRight size={14} /></Link>
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
      <section className="website-story" id="our-story">
        <div className="website-story-art">
          <div className="website-story-circle" />
          <img src="/images/reference/salad-bowl.webp" alt="A colourful salad with fresh leaves, olives, walnuts, and feta" loading="lazy" />
          <span className="website-story-note">Made with care.<br />Meant to be shared.</span>
        </div>
        <div className="website-story-copy">
          <p className="website-eyebrow">The heart of the bistro</p>
          <h2>A seat at the table.<br />A moment of your own.</h2>
          <p>Some of the best moments happen over a meal. A long overdue catch-up, a quiet lunch, an evening with your favourite people. At Bistro &amp; Bloom, there’s room for all of them.</p>
          <p>Choose something you love, settle into your seat, and let the conversation take its time. We’ll take care of the good food.</p>
          <Link to="/book-table" className="website-button website-button--red">Make a little time<ArrowUpRight size={17} /></Link>
        </div>
      </section>

      {/* Order Banner */}
      <section className="website-order-banner">
        <div>
          <p className="website-eyebrow">Make yourself at home</p>
          <h2>The bistro, wherever you are.</h2>
          <p>Set the table at home, or take something delicious on your way.</p>
        </div>
        <div className="website-order-actions">
          <Link to="/menu?source=DELIVERY" className="website-button website-button--pink"><Truck size={17} />Order delivery</Link>
          <Link to="/menu?source=TAKEAWAY" className="website-button website-button--outline">Choose takeaway<ArrowUpRight size={17} /></Link>
        </div>
      </section>

      {/* Visit Section */}
      <section className="website-section website-visit" id="visit">
        <div className="website-visit-intro">
          <p className="website-eyebrow">We’d love to see you</p>
          <h2>Your next good<br />moment starts here.</h2>
          <p>Come as you are. Bring someone along. There’s always a reason to gather around a good meal.</p>
          <Link to="/book-table" className="website-button website-button--red">Book your table<ArrowUpRight size={17} /></Link>
        </div>
        <div className="website-visit-details">
          <div>
            <h3><Clock size={18} />Opening hours</h3>
            {hours.length ? (
              <dl>{hours.map(([day, value]) => <div key={day}><dt>{day}</dt><dd>{formatHour(value.open)} – {formatHour(value.close)}</dd></div>)}</dl>
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

      {/* Footer */}
      <footer className="website-footer">
        <Link to="/" className="website-footer-brand">Bistro &amp; Bloom<span>Good food. Beautiful moments.</span></Link>
        <nav aria-label="Footer navigation">
          <Link to="/menu">Our menu</Link>
          <Link to="/book-table">Reservations</Link>
          <Link to="/track-order">Track your order</Link>
        </nav>
        <p>© {new Date().getFullYear()} Bistro &amp; Bloom</p>
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
