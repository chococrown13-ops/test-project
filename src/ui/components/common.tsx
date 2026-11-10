import type { ReactNode } from 'react';
import type { Team } from '../../game/types';

export function Card({
  title,
  action,
  children,
  padded = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <header className="card__head">
          <span>{title}</span>
          {action && <span className="header__spacer">{action}</span>}
        </header>
      )}
      {padded ? <div className="card__body">{children}</div> : children}
    </section>
  );
}

export function Crest({ team, size = 30 }: { team: Team; size?: number }) {
  return (
    <div
      className="header__crest"
      style={{
        width: size,
        height: size,
        background: team.color,
        color: team.accent,
        fontSize: size * 0.33,
      }}
    >
      {team.shortName}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`seg__item${option.value === value ? ' seg__item--active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field__label">{label}</div>
      {children}
    </div>
  );
}

/** Colour ramp shared by every 0-100 gauge in the app. */
export function gaugeColor(value: number): string {
  if (value >= 80) return '#3ddc91';
  if (value >= 60) return '#a3e635';
  if (value >= 40) return '#f5a524';
  return '#f4586a';
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="modal__head">
          <span className="modal__title">{title}</span>
          <button type="button" className="btn" style={{ padding: '6px 12px' }} onClick={onClose}>
            닫기
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
