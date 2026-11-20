import React from 'react';
import { tableLabel } from '../../services/tablePresentation';
import './FamilyDiningPlan.css';

function FamilyChair({ x, y, rotation = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <rect className="pos-plan-chair" x={-21} y={-20} width={42} height={40} rx={7} />
      <rect className="pos-plan-chair-back" x={-21} y={-20} width={42} height={9} rx={4} />
    </g>
  );
}

function FamilySofa({ seats, bottom = false }) {
  return (
    <g transform={`translate(340 ${bottom ? 262 : 54})${bottom ? ' rotate(180)' : ''}`}>
      <rect className="pos-plan-sofa" x={-240} y={-21} width={480} height={42} rx={4} />
      {Array.from({ length: seats }, (_, index) => (
        <rect key={index} className="pos-plan-sofa-cushion" x={-232 + index * 464 / seats} y={-12} width={464 / seats - 3} height={30} rx={4} />
      ))}
    </g>
  );
}

function ChairRow({ count, bottom = false }) {
  return Array.from({ length: count }, (_, index) => (
    <FamilyChair key={index} x={count === 1 ? 340 : 125 + index * 430 / (count - 1)} y={bottom ? 262 : 54} rotation={bottom ? 180 : 0} />
  ));
}

export function FamilyDiningTable({ table, layout, children, onClick, ...props }) {
  const seating = layout.seatingStyle;
  const capacity = Number(table.capacity);
  const topCount = Math.ceil((capacity - (seating === 'sofas' ? 0 : 2)) / 2);
  const bottomCount = capacity - (seating === 'sofas' ? 0 : 2) - topCount;
  return (
    <button type="button" className={`pos-family-layout-table pos-plan-table status-${table.status.toLowerCase()}`} onClick={onClick} {...props}>
      <span className="pos-family-table-stage">
        <svg viewBox="0 0 680 300" aria-hidden="true" focusable="false">
          {seating === 'chairs' ? <ChairRow count={topCount} /> : <FamilySofa seats={topCount} />}
          {seating === 'sofas' ? <FamilySofa seats={bottomCount} bottom /> : <ChairRow count={bottomCount} bottom />}
          {seating !== 'sofas' && <>
            <FamilyChair x={58} y={160} rotation={270} />
            <FamilyChair x={622} y={160} rotation={90} />
          </>}
          <rect className="pos-plan-tabletop" x={100} y={90} width={480} height={140} rx={12} />
        </svg>
        <span className="pos-plan-table-details pos-family-table-details">
          <strong>{tableLabel(table)}</strong>
          <span className="pos-plan-capacity">{table.capacity} people</span>
          {children}
        </span>
      </span>
      <span className="pos-plan-caption">{layout.caption}</span>
    </button>
  );
}

export default function FamilyDiningPlan({ tables, renderTable, getLayout }) {
  return (
    <div className="pos-family-layout-grid">
      {tables.map(table => renderTable(table, getLayout(table)))}
    </div>
  );
}
