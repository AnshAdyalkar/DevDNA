import { motion } from 'framer-motion';

/** Radial progress ring used for scores (hero placeholder for the DNA visual). */
export function ScoreRing({ value, label }: { value: number; label: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className="relative flex h-48 w-48 items-center justify-center">
      <svg viewBox="0 0 180 180" className="h-48 w-48 -rotate-90">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="rgb(30 41 59)"
          strokeWidth="10"
        />
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="font-mono text-4xl font-bold text-white"
        >
          {value}
        </motion.span>
        <span className="mt-1 text-xs uppercase tracking-widest text-slate-400">{label}</span>
      </div>
    </div>
  );
}
