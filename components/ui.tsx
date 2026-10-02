import { ChevronLeft, ChevronRight, Cloud, CloudLightning, CloudRain, CloudSun, CloudSunRain, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { SERIES_COLOR, SERIES_SHORT } from "@/lib/game/data/teams";
import { COMPOUND_INFO } from "@/lib/game/tyres";
import type { Compound, SeriesId } from "@/lib/game/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const WEATHER_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  Tormenta: { Icon: CloudLightning, color: "#a5b4fc" },
  Lluvia: { Icon: CloudRain, color: "#93c5fd" },
  Llovizna: { Icon: CloudSunRain, color: "#bfdbfe" },
  Nublado: { Icon: Cloud, color: "#cbd5e1" },
  "Parcialmente nublado": { Icon: CloudSun, color: "#fde68a" },
  Soleado: { Icon: Sun, color: "#fcd34d" },
};

/** Icono SVG del tiempo a partir de `describeWeather(...)`. */
export function WeatherIcon({ w, className }: { w: { label: string }; className?: string }) {
  const { Icon, color } = WEATHER_ICONS[w.label] ?? WEATHER_ICONS.Soleado;
  return (
    <span title={w.label} className="inline-flex">
      <Icon className={cx("h-6 w-6", className)} color={color} strokeWidth={1.8} />
    </span>
  );
}

/** Negro o blanco según lo claro que sea el color de fondo. */
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const v = parseInt(m[1], 16);
  const lum = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  return lum > 150 ? "#0b0d10" : "#fff";
}

/**
 * Panel con cabecera. Con `fill` ocupa todo el alto disponible y su cuerpo se convierte en una
 * columna flexible, de modo que una lista paginada dentro pueda medir el espacio que le queda.
 */
export function Panel({
  title,
  icon: Icon,
  right,
  children,
  className,
  bodyClass,
  fill,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  fill?: boolean;
}) {
  return (
    <section className={cx("mm-panel rounded-xl", fill && "flex min-h-0 flex-col overflow-hidden", className)}>
      {(title || right) && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
          <h3 className="flex min-w-0 items-center gap-2.5 truncate text-sm font-black uppercase tracking-[0.08em] text-fg">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-[#7aa2ff]" strokeWidth={2.2} />}
            {title}
          </h3>
          {right}
        </header>
      )}
      <div className={cx("p-4", fill && "flex min-h-0 flex-1 flex-col", bodyClass)}>{children}</div>
    </section>
  );
}

/* ───────────────────────── Paginación sin scroll ─────────────────────────
 * El juego nunca hace scroll: las listas largas se dividen en páginas según el espacio real
 * disponible. `useSize` mide un contenedor de alto fijo y `fitCount` calcula cuántas filas o
 * columnas de tamaño conocido caben en él.
 */

/** Mide un elemento con ResizeObserver. Se usa como `ref={ref}`. */
export function useSize<T extends HTMLElement = HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

/** Cuántos elementos de tamaño `item` (más `gap` entre ellos) caben en `space`, descontando `reserved`. */
export function fitCount(space: number, item: number, gap = 0, reserved = 0) {
  return Math.max(1, Math.floor((space - reserved + gap) / (item + gap)));
}

export interface PagerState {
  page: number;
  pages: number;
  start: number;
  end: number;
  setPage: (p: number) => void;
}

/**
 * Página actual de una lista de `total` elementos con `per` por página. Si cambia el tamaño de
 * página (al redimensionar la ventana) vuelve a la página que contiene `focus`.
 */
export function usePager(total: number, per: number, focus?: number): PagerState {
  const pages = Math.max(1, Math.ceil(total / per));
  const [sel, setSel] = useState<{ per: number; page: number } | null>(null);
  const wanted = sel && sel.per === per ? sel.page : focus !== undefined && focus >= 0 ? Math.floor(focus / per) : 0;
  const page = Math.max(0, Math.min(pages - 1, wanted));
  return {
    page,
    pages,
    start: page * per,
    end: Math.min(total, page * per + per),
    setPage: (p) => setSel({ per, page: Math.max(0, Math.min(pages - 1, p)) }),
  };
}

/** Controles ◀ 2/5 ▶. No muestra nada si todo cabe en una página. */
export function Pager({ pager, label, className, dark }: { pager: PagerState; label?: string; className?: string; dark?: boolean }) {
  if (pager.pages <= 1) return null;
  const btn = cx(
    "grid h-7 w-7 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-30",
    dark ? "border-white/10 bg-white/5 hover:bg-white/15" : "border-line-2 bg-panel-3 hover:bg-line-2",
  );
  return (
    <div className={cx("flex shrink-0 items-center gap-1.5 text-xs font-semibold", className)}>
      <button type="button" className={btn} disabled={pager.page === 0} onClick={() => pager.setPage(pager.page - 1)} aria-label="Página anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-12 text-center tabular text-muted">
        {label ? `${label} ` : ""}
        {pager.page + 1}/{pager.pages}
      </span>
      <button type="button" className={btn} disabled={pager.page >= pager.pages - 1} onClick={() => pager.setPage(pager.page + 1)} aria-label="Página siguiente">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Rejilla paginada que llena el alto disponible: calcula columnas y filas a partir del tamaño
 * mínimo de cada tarjeta y estira las celdas para ocupar todo el espacio.
 */
export function PagedGrid<T>({
  items,
  minW,
  minH,
  maxCols,
  gap = 12,
  keyOf,
  render,
  focus,
  header,
  className,
}: {
  items: T[];
  minW: number;
  minH: number;
  maxCols?: number;
  gap?: number;
  keyOf: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  focus?: number;
  header?: ReactNode;
  className?: string;
}) {
  const [ref, size] = useSize();
  const cols = Math.min(maxCols ?? Infinity, fitCount(size.w, minW, gap));
  const rows = fitCount(size.h, minH, gap);
  const pager = usePager(items.length, cols * rows, focus);
  const style: CSSProperties = {
    gap,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
  return (
    <div className={cx("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex min-h-7 shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">{header}</div>
        <Pager pager={pager} />
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full" style={style}>
          {items.slice(pager.start, pager.end).map((it, i) => (
            <div key={keyOf(it)} className="min-h-0 min-w-0">
              {render(it, pager.start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Lista o tabla paginada por filas de alto fijo. `children` recibe el rango visible;
 * el contenedor medido debe tener alto definido (flex-1 dentro de una columna).
 */
export function useRowPager(total: number, rowH: number, headH = 0, focus?: number) {
  const [ref, size] = useSize();
  const per = fitCount(size.h, rowH, 0, headH);
  const pager = usePager(total, per, focus);
  return { ref, pager };
}

type BtnVariant = "primary" | "ghost" | "subtle" | "danger" | "good";

export function Btn({
  variant = "subtle",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "xs" | "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-accent text-white hover:bg-[#ff2419]",
    ghost: "bg-transparent text-muted hover:text-fg hover:bg-panel-3",
    subtle: "bg-panel-3 text-fg hover:bg-line-2 border border-line-2",
    danger: "bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25",
    good: "bg-good/15 text-good border border-good/40 hover:bg-good/25",
  }[variant];
  const s = { xs: "h-6 px-2 text-[11px]", sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-base" }[size];
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        v,
        s,
        className,
      )}
    />
  );
}

export function Tyre({ c, size = 22, age }: { c: Compound; size?: number; age?: number }) {
  const info = COMPOUND_INFO[c];
  return (
    <span className="inline-flex items-center gap-1" title={info.name}>
      <span
        className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none"
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, Math.round(size / 7))}px solid ${info.color}`,
          fontSize: Math.round(size * (info.letter.length > 1 ? 0.36 : 0.46)),
          color: info.color,
          background: "#0b0b0b",
        }}
      >
        {info.letter}
      </span>
      {age !== undefined && <span className="text-[11px] tabular text-muted">{age}</span>}
    </span>
  );
}

export function SeriesBadge({ s, className }: { s: SeriesId; className?: string }) {
  return (
    <span className={cx("inline-block rounded px-1.5 py-0.5 text-[10px] font-black leading-none text-white", className)} style={{ background: SERIES_COLOR[s] }}>
      {SERIES_SHORT[s]}
    </span>
  );
}

/** Ruta del logo de cada categoría dentro de `public/`. Si falta el archivo se muestra el texto. */
export const SERIES_LOGO: Record<SeriesId, string> = {
  f1: "/logos/f1.svg",
  f2: "/logos/f2.svg",
  f3: "/logos/f3.svg",
};

export function SeriesLogo({ s, className, textClass }: { s: SeriesId; className?: string; textClass?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cx("font-black italic", textClass)} style={{ color: SERIES_COLOR[s] }}>
        {SERIES_SHORT[s]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SERIES_LOGO[s]}
      alt={SERIES_SHORT[s]}
      className={cx("w-auto object-contain object-left", className)}
      onError={() => setFailed(true)}
      // El error puede ocurrir antes de hidratar, cuando `onError` aún no está enganchado.
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}

export function Nat({ code }: { code: string }) {
  return <span className="rounded border border-line-2 px-1 py-px text-[9px] font-semibold tracking-wider text-muted">{code}</span>;
}

export function Stripe({ color, className }: { color: string; className?: string }) {
  return <span className={cx("inline-block w-1 shrink-0 self-stretch rounded-full", className)} style={{ background: color }} />;
}

export function Meter({ value, max = 100, color = "var(--accent)", className, height = 6 }: { value: number; max?: number; color?: string; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-panel-3", className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  size = "sm",
  fill,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string; activeColor?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: "xs" | "sm";
  /** Ocupa todo el ancho con columnas iguales. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx("gap-1 rounded-lg bg-panel-2 p-1", fill ? "grid min-w-0 flex-1" : "inline-flex flex-wrap", className)}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            type="button"
            key={String(o.value)}
            title={o.title}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "truncate rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35",
              size === "xs" ? (fill ? "px-0.5 py-1 text-[10px]" : "px-2 py-0.5 text-[10px]") : "px-2.5 py-1 text-xs",
              active ? "text-white" : "text-muted hover:bg-panel-3 hover:text-fg",
            )}
            style={active ? { background: o.activeColor ?? "var(--accent)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Con `tall` el modal ocupa casi toda la ventana y su cuerpo es una columna flexible (para listas paginadas). */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  tall,
  right,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  tall?: boolean;
  right?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cx(
          "flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-2xl",
          wide ? "max-w-5xl" : "max-w-2xl",
          tall && "h-full max-h-[900px]",
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="truncate text-base font-bold">{title}</h2>
          <div className="flex items-center gap-2">
            {right}
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-panel-3 hover:text-fg" aria-label="Cerrar">
              ✕
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">{label}</div>
      <div className="truncate text-lg font-bold tabular">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("inline-flex flex-wrap gap-1 rounded-lg bg-black/25 p-1", className)}>
      {tabs.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "rounded-md px-4 py-1.5 text-sm font-black uppercase tracking-wider transition-colors",
            t.id === value ? "bg-white text-black shadow" : "text-muted hover:bg-white/5 hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function posColor(pos: number, status: "FIN" | "DNF", points = 0): string {
  if (status === "DNF") return "bg-bad/20 text-bad";
  if (pos === 1) return "bg-[#d4a017] text-black";
  if (pos === 2) return "bg-[#b8bec8] text-black";
  if (pos === 3) return "bg-[#b0703c] text-black";
  if (points > 0) return "bg-good/20 text-good";
  return "bg-panel-3 text-muted";
}

export function RatingBar({ label, value, compare, max = 100 }: { label: string; value: number; compare?: number; max?: number }) {
  const color = value >= 90 ? "#22c55e" : value >= 82 ? "#84cc16" : value >= 75 ? "#f59e0b" : "#ef4444";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-xs text-muted">{label}</span>
      <span className="text-xs font-bold tabular">{value.toFixed(0)}</span>
      <div className="relative col-span-2">
        <Meter value={value - 50} max={max - 50} color={color} />
        {compare !== undefined && (
          <span className="absolute top-[-2px] h-[10px] w-0.5 bg-white/70" style={{ left: `${Math.max(0, Math.min(100, ((compare - 50) / (max - 50)) * 100))}%` }} title={`Mejor de la parrilla: ${compare.toFixed(0)}`} />
        )}
      </div>
    </div>
  );
}
