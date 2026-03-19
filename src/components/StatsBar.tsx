const stats = [
  { label: "Sites Analyzed", value: "12,847" },
  { label: "Issues Fixed", value: "284K+" },
  { label: "WCAG Rules", value: "78" },
  { label: "Avg. Score Lift", value: "+63 pts" },
];

export default function StatsBar() {
  return (
    <footer
      className="w-full border-t border-primary/8 mt-auto"
      role="contentinfo"
      aria-label="Platform statistics"
    >
      <div className="max-w-4xl mx-auto px-6 py-6">
        <dl className="flex flex-wrap justify-center gap-8 md:gap-16">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <dt className="text-xs font-medium text-primary/40 uppercase tracking-widest">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold text-primary font-display">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
