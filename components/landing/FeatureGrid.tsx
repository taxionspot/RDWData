"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, ShieldCheck, Database, ArrowRight } from "lucide-react";

type Feature = { title: string; description: string };
type Props = { items: Feature[] };

const featureCfg = [
  {
    Icon: Zap, bg: "bg-brand-600",
    from: "from-brand-400", to: "to-brand-600",
    badge: "bg-brand-100 text-brand-700", badgeText: "Speed",
    glow: "rgba(99,102,241,0.10)",
    ring: "ring-brand-100",
  },
  {
    Icon: ShieldCheck, bg: "bg-emerald-500",
    from: "from-emerald-400", to: "to-emerald-600",
    badge: "bg-emerald-100 text-emerald-700", badgeText: "Accuracy",
    glow: "rgba(16,185,129,0.10)",
    ring: "ring-emerald-100",
  },
  {
    Icon: Database, bg: "bg-sky-500",
    from: "from-sky-400", to: "to-sky-600",
    badge: "bg-sky-100 text-sky-700", badgeText: "Coverage",
    glow: "rgba(14,165,233,0.10)",
    ring: "ring-sky-100",
  },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function FeatureGrid({ items }: Props) {
  const { ref, inView } = useInView();

  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div
          ref={ref}
          className={`mb-14 flex flex-col gap-3 transition-all duration-700 md:flex-row md:items-end md:justify-between
            ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div>
            <span className="section-label">Why PlateIntel</span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Built for decision-makers
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            Whether you&apos;re buying, selling, or inspecting: get the full picture instantly.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid gap-5 md:grid-cols-3">
          {/* Large card */}
          {items[0] && (() => {
            const cfg = featureCfg[0];
            return (
              <div
                className={`group relative col-span-1 overflow-hidden rounded-2xl border border-brand-100 bg-white p-8 shadow-card ring-4 ${cfg.ring} ring-opacity-20
                  transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl md:col-span-2
                  ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ transition: "opacity 600ms, transform 600ms", transitionDelay: "100ms" }}
              >
                {/* Top gradient bar */}
                <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r ${cfg.from} ${cfg.to}`} />

                {/* Hover glow */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl"
                  style={{ background: `radial-gradient(ellipse 70% 60% at 20% 30%, ${cfg.glow}, transparent 70%)` }}
                />

                <div className="relative flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${cfg.bg} text-white shadow-sm
                    transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                    <cfg.Icon className="h-6 w-6" />
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${cfg.badge}`}>
                    {cfg.badgeText}
                  </span>
                </div>

                <h3 className="relative mt-5 font-display text-xl font-bold text-slate-900">{items[0].title}</h3>
                <p className="relative mt-2 text-base leading-relaxed text-slate-500">{items[0].description}</p>

                {/* Animated progress bar */}
                <div className="relative mt-7 flex items-center gap-2">
                  <div className="h-1.5 w-20 rounded-full bg-brand-500 transition-all duration-500 group-hover:w-32" />
                  <div className="h-1.5 w-10 rounded-full bg-brand-200 transition-all duration-500 group-hover:w-12" />
                  <div className="h-1.5 w-5 rounded-full bg-brand-100" />
                </div>

                {/* Corner decoration */}
                <div className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-brand-50/80 transition-all duration-300 group-hover:-right-4 group-hover:-top-4 group-hover:opacity-50" />

                {/* Arrow on hover */}
                <ArrowRight className="absolute bottom-8 right-8 h-5 w-5 text-brand-200 opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
              </div>
            );
          })()}

          {/* Stacked smaller cards */}
          <div className="flex flex-col gap-5">
            {items.slice(1).map((item, i) => {
              const cfg = featureCfg[(i + 1) % featureCfg.length];
              return (
                <div
                  key={item.title}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-card
                    transition-all duration-500 hover:-translate-y-1 hover:shadow-lg
                    ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                  style={{ transitionDelay: `${(i + 2) * 100}ms` }}
                >
                  {/* Hover gradient top bar */}
                  <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r ${cfg.from} ${cfg.to} scale-x-0 transition-transform duration-300 group-hover:scale-x-100 origin-left`} />

                  {/* Hover glow */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl"
                    style={{ background: `radial-gradient(ellipse 70% 60% at 20% 30%, ${cfg.glow}, transparent 70%)` }}
                  />

                  <div className="relative flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cfg.bg} text-white shadow-sm
                      transition-transform duration-300 group-hover:scale-110`}>
                      <cfg.Icon className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${cfg.badge}`}>
                      {cfg.badgeText}
                    </span>
                  </div>

                  <h3 className="relative mt-4 font-display text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="relative mt-1.5 text-sm leading-relaxed text-slate-500">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
