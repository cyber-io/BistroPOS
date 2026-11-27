import React from 'react';
import './PartyHallPlan.css';

const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const foodStalls = ['Starters', 'Main course', 'Desserts & drinks'];

function HallChair({ x, y }) {
  return (
    <g className="pos-party-chair" transform={`translate(${x} ${y})`}>
      <rect className="pos-party-chair-seat" x={-16} y={-15} width={32} height={30} rx={6} />
      <rect className="pos-party-chair-back" x={-16} y={9} width={32} height={6} rx={3} />
    </g>
  );
}

function Speaker({ x }) {
  return (
    <g transform={`translate(${x} 28)`}>
      <rect className="pos-party-speaker" width={34} height={54} rx={5} />
      <circle className="pos-party-speaker-cone" cx={17} cy={13} r={4} />
      <circle className="pos-party-speaker-cone" cx={17} cy={34} r={10} />
    </g>
  );
}

function SoundControl() {
  return (
    <g transform="translate(625 455)">
      <rect className="pos-party-console" width={70} height={40} rx={5} />
      {[11, 23, 35, 47, 59].map((x, index) => (
        <g key={x}>
          <line className="pos-party-slider-track" x1={x} y1={8} x2={x} y2={32} />
          <rect className="pos-party-slider" x={x - 3} y={[15, 20, 24, 13, 18][index]} width={6} height={4} rx={1} />
        </g>
      ))}
      <text className="pos-party-small-label pos-party-sound-label" x={35} y={57} textAnchor="middle">Sound control</text>
    </g>
  );
}

// The complete hall is one operational resource; individual chairs are decorative.
export default function PartyHallPlan({ table = null, onSelect, statusLabel, guestName, bookingLabel, billTotal }) {
  const status = String(table?.status || '');
  const humanStatus = statusLabel || status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
  const hasBill = billTotal !== null && billTotal !== undefined && billTotal !== '';
  const canSelect = Boolean(table?.tableId && typeof onSelect === 'function');
  const MapContainer = canSelect ? 'button' : 'div';
  const mapProps = canSelect ? {
    type: 'button',
    onClick: () => onSelect(table),
    'aria-label': ['Party hall', `${table.capacity} seats`, humanStatus, guestName && `Guest ${guestName}`, bookingLabel, hasBill && `Open bill ${billTotal}`].filter(Boolean).join(', '),
  } : {};

  return (
    <div className="pos-party-hall-plan">
      <div className="pos-party-map-panel">
        <MapContainer className={`pos-party-seating-map${status ? ` status-${status.toLowerCase()}` : ''}${canSelect ? ' is-interactive' : ''}`} {...mapProps}>
          {table && <span className="pos-party-map-meta">
            <span><strong>Party hall</strong><small>{table.capacity} seats</small></span>
            {humanStatus && <span className="pos-party-hall-status">{humanStatus}</span>}
          </span>}
          {(guestName || bookingLabel || hasBill) && <span className="pos-party-map-info">
            {guestName && <span className="pos-party-map-guest">Guest · {guestName}</span>}
            {bookingLabel && <span className="pos-party-map-booking">{bookingLabel}</span>}
            {hasBill && <span className="pos-party-map-bill"><span>Open bill</span><strong>{billTotal}</strong></span>}
          </span>}
          <svg viewBox="0 0 720 530" role="img" aria-hidden={canSelect || undefined}>
            <rect className="pos-party-stage" x={120} y={14} width={480} height={72} rx={10} />
            <text className="pos-party-stage-title" x={360} y={56} textAnchor="middle">STAGE</text>
            <rect className="pos-party-stage-step" x={270} y={87} width={180} height={10} rx={3} />
            <Speaker x={57} />
            <Speaker x={629} />
            {rows.map((row, rowIndex) => (
              <g key={row}>
                <text className="pos-party-row-label" x={40} y={173 + rowIndex * 42} textAnchor="middle">{row}</text>
                {Array.from({ length: 10 }, (_, seatIndex) => (
                  <HallChair key={seatIndex} x={seatIndex < 5 ? 116 + seatIndex * 50 : 405 + (seatIndex - 5) * 50} y={168 + rowIndex * 42} />
                ))}
              </g>
            ))}
            <SoundControl />
          </svg>
        </MapContainer>
      </div>
      <aside className="pos-party-food-stalls" aria-label="Food stalls">
        <header>
          <h3>Food stalls</h3>
        </header>
        {foodStalls.map(stall => (
          <figure className="pos-party-food-stall" key={stall}>
            <div className="pos-party-buffet-counter" aria-hidden="true">
              {[0, 1, 2].map(tray => <span className="pos-party-buffet-tray" key={tray}><i /></span>)}
            </div>
            <figcaption>{stall}</figcaption>
          </figure>
        ))}
      </aside>
    </div>
  );
}
