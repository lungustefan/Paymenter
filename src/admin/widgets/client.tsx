'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminActions } from '../actions/client';
import { LoadingIndicator } from '../ui/Icon';

/** `wire:poll.20s`: the page is refreshed every interval (`'20s'`, `'10m'`) */
export function WidgetPoll({ interval }: { interval: string }) {
    const router = useRouter();
    useEffect(() => {
        const m = /^(\d+)(ms|s|m)?$/.exec(interval);
        if (!m) return;
        const ms = Number(m[1]) * (m[2] === 'ms' ? 1 : m[2] === 'm' ? 60_000 : 1000);
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') router.refresh();
        }, ms);
        return () => clearInterval(timer);
    }, [interval, router]);
    return null;
}

const computed = (el: HTMLElement | null) => (el ? getComputedStyle(el).color : '');

/** the sparkline of a stat (`stats-overview/stat/chart.js`) */
export function StatChart({ color, values }: { color: string; values: Array<number | string> }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const bg = useRef<HTMLSpanElement>(null);
    const border = useRef<HTMLSpanElement>(null);
    const chart = useRef<any>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { Chart } = await import('chart.js/auto');
            if (cancelled || !canvas.current) return;
            chart.current?.destroy();
            chart.current = new Chart(canvas.current, {
                type: 'line',
                data: {
                    labels: values.map((_v, i) => i),
                    datasets: [{ data: values.map(Number), borderWidth: 2, fill: 'start', tension: 0.5, backgroundColor: computed(bg.current), borderColor: computed(border.current) }],
                },
                options: { animation: { duration: 0 }, elements: { point: { radius: 0 } }, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } },
            });
        })();
        return () => {
            cancelled = true;
            chart.current?.destroy();
        };
    }, [values]);

    return (
        <div>
            <div className={`fi-color fi-color-${color} fi-wi-stats-overview-stat-chart`}>
                <canvas ref={canvas} aria-hidden="true" />
                <span ref={bg} className="fi-wi-stats-overview-stat-chart-bg-color"></span>
                <span ref={border} className="fi-wi-stats-overview-stat-chart-border-color"></span>
            </div>
        </div>
    );
}

export interface ChartData {
    datasets: Array<Record<string, any>>;
    labels: string[];
}

/** the canvas of a chart widget (`widgets/components/chart.js`): Filament's defaults around the options of the widget */
export function ChartCanvas({ type, data, options, label, maxHeight }: { type: string; data: ChartData; options: Record<string, any>; label: string; maxHeight?: string | null }) {
    const frame = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const bg = useRef<HTMLSpanElement>(null);
    const border = useRef<HTMLSpanElement>(null);
    const grid = useRef<HTMLSpanElement>(null);
    const text = useRef<HTMLSpanElement>(null);
    const chart = useRef<any>(null);
    const latest = useRef(data);
    latest.current = data;

    const colors = useCallback(() => ({ backgroundColor: computed(bg.current), borderColor: computed(border.current), textColor: computed(text.current), gridColor: computed(grid.current) }), []);

    // create the chart once, then follow the data
    useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | null = null;
        (async () => {
            const { Chart } = await import('chart.js/auto');
            if (cancelled || !canvas.current) return;
            const o: any = structuredClone(options ?? {});
            o.animation ??= {};
            o.animation.duration ??= 0;
            o.font ??= {};
            o.font.family ??= getComputedStyle(frame.current as HTMLElement).fontFamily;
            o.borderWidth ??= 2;
            o.responsive ??= false;
            o.maintainAspectRatio ??= canvas.current.style.maxHeight !== '100%';
            o.pointHitRadius ??= 4;
            o.pointRadius ??= 2;
            o.scales ??= {};
            o.scales.x ??= {};
            o.scales.x.border ??= {};
            o.scales.x.border.display ??= false;
            o.scales.x.grid ??= {};
            o.scales.x.grid.display ??= false;
            o.scales.y ??= {};
            o.scales.y.border ??= {};
            o.scales.y.border.display ??= false;
            o.scales.y.grid ??= {};
            const c = colors();
            o.backgroundColor = options?.backgroundColor ?? c.backgroundColor;
            o.borderColor = options?.borderColor ?? c.borderColor;
            o.color = options?.color ?? c.textColor;
            o.pointBackgroundColor = options?.pointBackgroundColor ?? o.borderColor;
            o.elements ??= {};
            o.elements.bar ??= {};
            o.elements.bar.borderColor = o.borderColor;
            o.scales.x.grid.color = options?.scales?.x?.grid?.color ?? c.gridColor;
            o.scales.y.grid.color = options?.scales?.y?.grid?.color ?? c.gridColor;
            const d = structuredClone(latest.current);
            for (const set of d.datasets) {
                if (type === 'bar' && set.backgroundColor !== undefined) set.borderColor ??= set.backgroundColor;
                if (['line', 'scatter'].includes(type) && set.borderColor !== undefined) set.pointBackgroundColor ??= set.borderColor;
            }
            chart.current = new Chart(canvas.current, { type: type as any, data: d as any, options: o });
            // `ResizeObserver` on the frame, like the Alpine component
            observer = new ResizeObserver(() => chart.current?.resize());
            observer.observe(frame.current as HTMLElement);
        })();
        return () => {
            cancelled = true;
            observer?.disconnect();
            chart.current?.destroy();
            chart.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);

    useEffect(() => {
        const c = chart.current;
        if (!c) return;
        const d = structuredClone(data);
        for (const set of d.datasets) if (['line', 'scatter'].includes(type) && set.borderColor !== undefined) set.pointBackgroundColor ??= set.borderColor;
        c.data = d;
        c.update('resize');
    }, [data, type]);

    return (
        <div>
            <div ref={frame} data-chart-type={type} className={`fi-color fi-color-primary fi-wi-chart-frame fi-wi-chart-canvas-ctn${maxHeight ? ' fi-wi-chart-frame-no-aspect-ratio' : ''}`}>
                <canvas ref={canvas} role="img" aria-label={label} style={maxHeight ? { maxHeight } : { maxHeight: '100%' }} />
                <span ref={bg} className="fi-wi-chart-bg-color"></span>
                <span ref={border} className="fi-wi-chart-border-color"></span>
                <span ref={grid} className="fi-wi-chart-grid-color"></span>
                <span ref={text} className="fi-wi-chart-text-color"></span>
            </div>
        </div>
    );
}

/** the chart of a chart widget with its filter select (`wire:model.live="filter"`) */
export function ChartWithFilter({
    widget,
    type,
    initial,
    options,
    label,
    maxHeight,
    filters,
    filter,
    filterLabel,
    heading,
}: {
    widget: string;
    type: string;
    initial: ChartData;
    options: Record<string, any>;
    label: string;
    maxHeight?: string | null;
    filters: Array<{ value: string; label: string }> | null;
    filter: string | null;
    filterLabel: string;
    heading: string | null;
}) {
    const { dispatch } = useAdminActions();
    const [data, setData] = useState(initial);
    const [current, setCurrent] = useState(filter);
    const [loading, setLoading] = useState(false);

    const change = async (value: string) => {
        setCurrent(value);
        setLoading(true);
        try {
            const result = await dispatch({ type: 'widget', widget, method: 'getData', args: [value] });
            if (result.data) setData(result.data as ChartData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="fi-section fi-section-has-header">
            {(heading || filters) && (
                <header className="fi-section-header">
                    {heading && (
                        <div className="fi-section-header-text-ctn">
                            <h2 className="fi-section-header-heading">{heading}</h2>
                        </div>
                    )}
                    {filters && (
                        <div className="fi-section-header-after-ctn">
                            <div className="fi-input-wrp fi-wi-chart-filter">
                                <div className="fi-input-wrp-prefix fi-inline" style={loading ? { display: 'flex' } : { display: 'none' }}>
                                    <LoadingIndicator />
                                </div>
                                <div className={loading ? 'fi-input-wrp-content-ctn' : 'fi-input-wrp-content-ctn fi-input-wrp-content-ctn-ps'}>
                                    <select className="fi-select-input fi-select-input-has-inline-prefix" aria-label={filterLabel} value={current ?? ''} onChange={(e) => void change(e.target.value)}>
                                        {filters.map((f) => (
                                            <option key={f.value} value={f.value}>
                                                {f.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </header>
            )}
            <div className="fi-section-content-ctn">
                <div className="fi-section-content">
                    <ChartCanvas type={type} data={data} options={options} label={label} maxHeight={maxHeight} />
                </div>
            </div>
        </section>
    );
}

/** a text that is copied to the clipboard on click and says so for two seconds (`x-data="{ copied: false }"`) */
export function CopyText({ text, className }: { text: string; className: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <p
            className={className}
            onClick={() => {
                void navigator.clipboard?.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
        >
            {copied ? 'Copied!' : text}
        </p>
    );
}
