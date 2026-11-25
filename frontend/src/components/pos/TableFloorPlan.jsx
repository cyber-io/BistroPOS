import React from 'react';
import { Armchair, ChevronDown } from 'lucide-react';
import { Empty, label } from './PosUI';
import FamilyDiningPlan, { FamilyDiningTable } from './FamilyDiningPlan';
import PartyHallPlan from './PartyHallPlan';
import { diningAreaForTable, tableLabel } from '../../services/tablePresentation';
import './TableFloorPlan.css';

// Seating is a visual treatment only; table identity and capacity come from the API.
function seatingLayout(table) {
  const capacity = Number(table.capacity);
  const number = Number(table.tableNumber);
  if (diningAreaForTable(table) === 'family') {
    const seatingStyle = table.seatingStyle || (['C3', '103', '3'].includes(String(table.tableNumber || tableLabel(table))) ? 'sofas' : ['C4', '104', '4'].includes(String(table.tableNumber || tableLabel(table))) ? 'mixed' : 'chairs');
    return { kind: 'family', shape: 'long', seatingStyle, sofa: seatingStyle !== 'chairs', caption: seatingStyle === 'sofas' ? 'Family table · sofa seating' : seatingStyle === 'mixed' ? 'Family table · sofas + chairs' : 'Family table · chairs' };
  }
  if (capacity <= 4) {
    const round = number <= 4;
    return { shape: round ? 'round' : 'square', caption: round ? 'Round table' : 'Square table', width: 112, height: 112 };
  }
  if (capacity <= 8 && number % 4 === 0) {
    return { shape: 'square', sofa: true, caption: 'Sofas + chairs', width: 128, height: 128 };
  }
  if (capacity <= 8) {
    const round = number % 2 === 0;
    return { shape: round ? 'round' : 'square', caption: round ? 'Round · chairs' : 'Square · chairs', width: 128, height: 128 };
  }
  return { shape: 'long', sofa: number % 2 === 0, caption: capacity > 10 ? (number % 2 === 0 ? 'Family table · sofas + chairs' : 'Family table · chairs') : (number % 2 === 0 ? 'Sofas + chairs' : 'Long table · chairs'), width: 192, height: 90 };
}

function Chair({ x, y, rotation = 0, size = 30 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <rect className="pos-plan-chair" x={-size / 2} y={-15} width={size} height={30} rx={6} />
      <rect className="pos-plan-chair-back" x={-size / 2} y={-15} width={size} height={7} rx={3.5} />
    </g>
  );
}

function Sofa({ x, y, width, seats, bottom = false }) {
  return (
    <g transform={`translate(${x} ${y})${bottom ? ' rotate(180)' : ''}`}>
      <rect className="pos-plan-sofa" x={-width / 2} y={-16} width={width} height={32} rx={3} />
      {Array.from({ length: seats }, (_, index) => (
        <rect key={index} className="pos-plan-sofa-cushion" x={-width / 2 + 6 + index * (width - 12) / seats} y={-8} width={(width - 12) / seats - 2} height={22} rx={3} />
      ))}
    </g>
  );
}

function Seating({ capacity, layout }) {
  const { width, height, shape, sofa } = layout;
  const centerX = 140;
  const centerY = 115;
  const chairs = [];
  if (sofa) {
    const sofaSeats = Math.max(1, Math.floor((capacity - 2) / 2));
    chairs.push(<Sofa key="sofa-top" x={centerX} y={centerY - height / 2 - 29} width={width} seats={sofaSeats} />);
    chairs.push(<Sofa key="sofa-bottom" x={centerX} y={centerY + height / 2 + 29} width={width} seats={sofaSeats} bottom />);
    const sideSeats = capacity - sofaSeats * 2;
    [Math.ceil(sideSeats / 2), Math.floor(sideSeats / 2)].forEach((count, side) => {
      for (let index = 0; index < count; index += 1) {
        chairs.push(<Chair key={`side-${side}-${index}`} x={centerX + (side ? 1 : -1) * (width / 2 + 28)} y={centerY + (index - (count - 1) / 2) * 38} rotation={side ? 90 : 270} size={26} />);
      }
    });
  } else if (shape === 'round') {
    for (let index = 0; index < capacity; index += 1) {
      const angle = -90 + index * 360 / capacity;
      const radius = width / 2 + 30;
      chairs.push(<Chair key={index} x={centerX + Math.cos(angle * Math.PI / 180) * radius} y={centerY + Math.sin(angle * Math.PI / 180) * radius} rotation={angle + 90} size={capacity > 4 ? 28 : 32} />);
    }
  } else {
    const sideSeats = capacity > 2 ? 2 : 0;
    const topSeats = Math.ceil((capacity - sideSeats) / 2);
    const bottomSeats = capacity - sideSeats - topSeats;
    [topSeats, bottomSeats].forEach((count, row) => {
      for (let index = 0; index < count; index += 1) {
        chairs.push(<Chair key={`${row}-${index}`} x={centerX + (index - (count - 1) / 2) * width / Math.max(count, 1)} y={centerY + (row ? 1 : -1) * (height / 2 + 29)} rotation={row ? 180 : 0} size={count > 4 ? 22 : 30} />);
      }
    });
    if (sideSeats) {
      chairs.push(<Chair key="left" x={centerX - width / 2 - 28} y={centerY} rotation={270} size={26} />);
      chairs.push(<Chair key="right" x={centerX + width / 2 + 28} y={centerY} rotation={90} size={26} />);
    }
  }
  return (
    <svg viewBox="0 0 280 230" aria-hidden="true" focusable="false">
      {chairs}
      <rect className="pos-plan-tabletop" x={centerX - width / 2} y={centerY - height / 2} width={width} height={height} rx={shape === 'round' ? width / 2 : 10} />
    </svg>
  );
}

export function FloorPlanTable({ table, layout, children, onClick, ...props }) {
  if (layout.kind === 'family') return <FamilyDiningTable table={table} layout={layout} onClick={onClick} {...props}>{children}</FamilyDiningTable>;
  return (
    <button type="button" className={`pos-plan-table status-${table.status.toLowerCase()}`} onClick={onClick} {...props}>
      <span className="pos-plan-table-stage">
        <Seating capacity={Number(table.capacity)} layout={layout} />
        <span className="pos-plan-table-details" style={{ width: `${(layout.width - 12) / 280 * 100}%` }}>
          <strong>{tableLabel(table)}</strong>
          <span className="pos-plan-capacity">{table.capacity} people</span>
          {children}
        </span>
      </span>
      <span className="pos-plan-caption">{layout.caption}</span>
    </button>
  );
}

const diningAreas = [
  { id: 'everyday', title: 'Everyday dining' },
  { id: 'group', title: 'Group dining' },
  { id: 'family', title: 'Family dining' },
  { id: 'party', title: 'Party hall' },
];

export function getDiningAreaTables(tables, selectedArea) {
  const area = diningAreas.find(item => item.id === selectedArea) || diningAreas[0];
  const list = (tables || []).filter(table => diningAreaForTable(table) === area.id);
  if (list.length > 0) return list;
  if (area.id === 'family') {
    return [
      { tableId: 'c1000000-0000-0000-0000-000000000001', tableNumber: 101, displayName: 'C1', capacity: 14, status: 'AVAILABLE', diningArea: 'family', seatingStyle: 'chairs' },
      { tableId: 'c1000000-0000-0000-0000-000000000002', tableNumber: 102, displayName: 'C2', capacity: 14, status: 'AVAILABLE', diningArea: 'family', seatingStyle: 'chairs' },
      { tableId: 'c1000000-0000-0000-0000-000000000003', tableNumber: 103, displayName: 'C3', capacity: 16, status: 'AVAILABLE', diningArea: 'family', seatingStyle: 'sofas' },
      { tableId: 'c1000000-0000-0000-0000-000000000004', tableNumber: 104, displayName: 'C4', capacity: 16, status: 'AVAILABLE', diningArea: 'family', seatingStyle: 'mixed' },
    ];
  }
  if (area.id === 'party') {
    return [
      { tableId: 'c2000000-0000-0000-0000-000000000001', tableNumber: 201, displayName: 'Party hall', capacity: 70, status: 'AVAILABLE', diningArea: 'party', seatingStyle: 'hall' },
    ];
  }
  return list;
}

export default function TableFloorPlan({ tables, allTables = tables, selectedArea, onAreaChange, onSelectTable, getTableInfo, renderTable, empty }) {
  const area = diningAreas.find(item => item.id === selectedArea) || diningAreas[0];
  let areaTables = getDiningAreaTables(tables, selectedArea);
  let configuredTables = getDiningAreaTables(allTables, selectedArea);
  if (areaTables.length === 0 && configuredTables.length > 0) areaTables = configuredTables;
  const layouts = configuredTables.map(seatingLayout);
  const roundCount = layouts.filter(layout => layout.shape === 'round').length;
  const sofaCount = layouts.filter(layout => layout.sofa).length;
  const capacities = [...new Set(configuredTables.map(table => Number(table.capacity)))].sort((a, b) => a - b);
  const partyHall = area.id === 'party' ? configuredTables[0] : null;

  return (
    <div className="pos-floor-plans">
      <div className="pos-plan-area-toolbar">
        <label className="pos-plan-area-field" htmlFor="pos-dining-area">
          <span>Dining area</span>
          <div className="pos-select-wrap">
            <select
              id="pos-dining-area"
              className="pos-select"
              value={area.id}
              onChange={event => onAreaChange(event.target.value)}
              aria-controls="pos-selected-dining-plan"
            >
              {diningAreas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <ChevronDown size={16} className="pos-select-arrow" aria-hidden="true" />
          </div>
        </label>
        {areaTables.length > 0 && (
          <span className="pos-plan-area-count" role="status">{areaTables.length} {area.id === 'party' ? (areaTables.length === 1 ? 'hall' : 'halls') : (areaTables.length === 1 ? 'table' : 'tables')} shown</span>
        )}
      </div>
      <section id="pos-selected-dining-plan" className={`pos-dining-plan pos-dining-plan-${area.id}`} aria-labelledby={`pos-dining-${area.id}`}>
        <header className="pos-dining-plan-header">
          <div>
            <h2 id={`pos-dining-${area.id}`}>{area.title}</h2>
            {configuredTables.length > 0 && <p>{partyHall ? `${partyHall.capacity} chairs · stage, food stalls & sound` : `${configuredTables.length} ${area.id === 'family' ? 'large tables' : configuredTables.length === 1 ? 'table' : 'tables'} · ${area.id === 'everyday' ? [roundCount > 0 && `${roundCount} round`, configuredTables.length - roundCount > 0 && `${configuredTables.length - roundCount} square`].filter(Boolean).join(' + ') : sofaCount ? 'Mixed chairs & sofa seating' : 'Chair seating'}`}</p>}
          </div>
          {configuredTables.length > 0 && <span>{partyHall ? `${partyHall.capacity} seats · theatre-style seating` : `${configuredTables.reduce((sum, table) => sum + Number(table.capacity), 0)} seats · ${capacities.length === 1 ? `${capacities[0]} per table` : `tables for ${capacities[0]}–${capacities[capacities.length - 1]}`}`}</span>}
        </header>
        <div className="pos-dining-plan-floor">
          {areaTables.length > 0 ? area.id === 'party' ? <PartyHallPlan table={areaTables[0]} onSelect={onSelectTable} statusLabel={label(areaTables[0].status)} {...getTableInfo?.(areaTables[0])} /> : area.id === 'family' ? <FamilyDiningPlan tables={areaTables} renderTable={renderTable} getLayout={seatingLayout} /> : (
            <div className="pos-plan-table-grid">
              {areaTables.map(table => renderTable(table, seatingLayout(table)))}
            </div>
          ) : configuredTables.length > 0 ? empty : (
            <Empty icon={Armchair} title={`No ${area.title.toLowerCase()} tables`}>
              No tables are configured for this dining area yet.
            </Empty>
          )}
        </div>
        {areaTables.length > 0 && <footer className="pos-dining-plan-footer">
          <span>Top view</span>
          <div>{partyHall ? <span>7 rows × 10 chairs · {partyHall.capacity} seats</span> : <><span>Chairs · cool gray</span>{sofaCount > 0 && <span>Sofas · sage</span>}</>}</div>
        </footer>}
      </section>
    </div>
  );
}
