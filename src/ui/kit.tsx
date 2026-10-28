import { useEffect, type ReactNode } from 'react';
import { attrTone } from '../game/attributes';
import { POS_LABEL, POS_LINE, type Position } from '../game/formations';
import { CrestArt, type CrestLike } from './art';

export function Card({ title, action, onAction, children, padded }: { title?: ReactNode; action?: string; onAction?: () => void; children: ReactNode; padded?: boolean }) {
  return (
    <section className="card">
      {title && (
        <header className="card__head">
          <span>{title}</span>
          {action && (
            <button type="button" className="card__head-action" onClick={onAction}>
              {action}
            </button>
          )}
        </header>
      )}
      {padded ? <div className="card__body">{children}</div> : children}
    </section>
  );
}

export function SubTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="subtabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`chip${o.value === value ? ' chip--on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.badge ? <span className="badge badge--bad" style={{ marginLeft: 6 }}>{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={`seg__item${o.value === value ? ' seg__item--on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet__head">
          <span className="sheet__title">{title}</span>
          <button type="button" className="btn btn--sm" onClick={onClose}>
            닫기
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <div style={{ padding: '0 16px 14px' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars" aria-label={`${value}점`}>
      {'★'.repeat(full)}
      {half ? '⯪' : ''}
      <span className="stars__off">{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export function PosBadge({ pos }: { pos: Position }) {
  return <span className={`pos pos--${POS_LINE[pos]}`}>{POS_LABEL[pos]}</span>;
}

export function Crest({ club, size = 30 }: { club: CrestLike; size?: number }) {
  return <CrestArt club={club} size={size * 0.87} />;
}

export function tone(value: number): string {
  if (value >= 80) return 'var(--good)';
  if (value >= 65) return '#c3e86a';
  if (value >= 45) return 'var(--warn)';
  return 'var(--bad)';
}

export function Meter({ value, width = 46 }: { value: number; width?: number }) {
  return (
    <span className="meter" style={{ width }} title={String(Math.round(value))}>
      <span className="meter__fill" style={{ width: `${Math.max(4, Math.min(100, value))}%`, background: tone(value) }} />
    </span>
  );
}

export function FormDots({ form }: { form: ('W' | 'D' | 'L')[] }) {
  if (form.length === 0) return <span className="tiny faint">기록 없음</span>;
  return (
    <span className="form">
      {form.map((r, i) => (
        <span key={i} className={`form__dot form__dot--${r}`}>
          {r === 'W' ? '승' : r === 'D' ? '무' : '패'}
        </span>
      ))}
    </span>
  );
}

export function Kv({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className="kv__v">{v}</span>
    </div>
  );
}

export function AttrValue({ text, value, known }: { text: string; value: number; known: boolean }) {
  const cls = text === '?' ? 'attr--unknown' : `attr--${attrTone(value)}`;
  return <span className={`attr-row__v ${cls}`} style={known ? undefined : { fontSize: 12 }}>{text}</span>;
}

export function ratingColor(r: number): string {
  if (r >= 7.5) return 'var(--good)';
  if (r >= 6.8) return '#c3e86a';
  if (r >= 6.2) return 'var(--warn)';
  return 'var(--bad)';
}

export function Tile({ label, value, sub, color, onClick }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; onClick?: () => void }) {
  return (
    <button type="button" className="tile" onClick={onClick} disabled={!onClick}>
      <div className="tile__label">{label}</div>
      <div className="tile__value" style={{ color }}>
        {value}
      </div>
      {sub && <div className="tile__sub">{sub}</div>}
    </button>
  );
}
