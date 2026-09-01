import type { ReactNode } from 'react';

export function Card({ title, action, children, tone }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; tone?: 'good' | 'bad' | 'warn';
}) {
  return (
    <section className={`card${tone ? ` card--${tone}` : ''}`}>
      {(title || action) && (
        <header className="card__head">
          <span className="card__title">{title}</span>
          {action}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Btn({ children, onClick, variant = 'default', block, disabled, small }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  block?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${block ? ' btn--block' : ''}${small ? ' btn--small' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: 'good' | 'bad' | 'dim' }) {
  return (
    <div className="kv">
      <span className="kv__key">{k}</span>
      <span className={`kv__value${tone ? ` kv__value--${tone}` : ''}`}>{v}</span>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad';
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value${tone ? ` stat__value--${tone}` : ''}`}>{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}

/** 0-100 값을 막대로. */
export function Meter({ label, value, max = 100, tone }: {
  label?: ReactNode; value: number; max?: number; tone?: 'good' | 'warn' | 'bad';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const auto = pct > 66 ? 'good' : pct > 33 ? 'warn' : 'bad';
  return (
    <div className="meter">
      {label && <span className="meter__label">{label}</span>}
      <span className="meter__track">
        <span className={`meter__fill meter__fill--${tone ?? auto}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="meter__value">{Math.round(value)}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Chip({ children, active, onClick, color }: {
  children: ReactNode; active?: boolean; onClick?: () => void; color?: string;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip--active' : ''}${onClick ? '' : ' chip--static'}`}
      style={color ? { borderColor: color } : undefined}
      onClick={onClick}
      disabled={!onClick}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__item${option.value === value ? ' segmented__item--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** 숫자를 크게 조정하는 입력. 이적료처럼 자릿수가 큰 값에 씁니다. */
export function Stepper({ value, onChange, step, min = 0, max = Infinity, format }: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
}) {
  const clamp = (next: number): number => Math.max(min, Math.min(max, Math.round(next * 10) / 10));
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => onChange(clamp(value - step))}>−</button>
      <span className="stepper__value">{format ? format(value) : value}</span>
      <button type="button" className="stepper__btn" onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}

/** 전체 화면 상세. 모바일에서 뒤로 가기 대신 닫기 버튼을 씁니다. */
export function Sheet({ title, subtitle, onClose, children, footer }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="sheet">
      <header className="sheet__head">
        <div className="sheet__titles">
          <h2 className="sheet__title">{title}</h2>
          {subtitle && <span className="sheet__sub">{subtitle}</span>}
        </div>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="닫기">✕</button>
      </header>
      <div className="sheet__body">{children}</div>
      {footer && <div className="sheet__footer">{footer}</div>}
    </div>
  );
}

export function Crest({ color, accent, label, size = 30 }: {
  color: string; accent: string; label: string; size?: number;
}) {
  return (
    <span
      className="crest"
      style={{ background: color, color: accent, width: size, height: size, fontSize: size * 0.36 }}
    >
      {label.slice(0, 3)}
    </span>
  );
}
