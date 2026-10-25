import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/providers/ThemeProvider';

/**
 * Hero illustration: two members exchanging knowledge.
 *
 * Drawn as inline SVG so it scales cleanly, inherits the theme, and animates
 * without loading an asset. The two arcs between the figures carry labelled
 * skill tokens in both directions, which is the whole idea of the product.
 */
export function ExchangeIllustration() {
  const prefersReducedMotion = usePrefersReducedMotion();

  const floatTransition = (delay: number) =>
    prefersReducedMotion
      ? { duration: 0 }
      : {
          duration: 5.5,
          repeat: Infinity,
          repeatType: 'reverse' as const,
          ease: 'easeInOut' as const,
          delay,
        };

  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      <svg viewBox="0 0 520 420" className="h-auto w-full" role="presentation">
        <defs>
          <linearGradient id="ss-arc-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="ss-arc-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id="ss-avatar-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="ss-avatar-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <filter id="ss-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* Soft ambient glow behind the composition */}
        <ellipse cx="260" cy="215" rx="190" ry="150" fill="#6366F1" opacity="0.10" filter="url(#ss-soft)" />

        {/* ---------------- upper arc: person A teaches to person B */}
        <motion.path
          d="M150 150 C 210 60, 310 60, 370 150"
          fill="none"
          stroke="url(#ss-arc-a)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="7 7"
          initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1.6, ease: 'easeInOut' }}
        />
        <motion.polygon
          points="370,150 362,140 372,141"
          fill="#7C3AED"
          animate={prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* ---------------- lower arc: person B teaches to person A */}
        <motion.path
          d="M370 270 C 310 360, 210 360, 150 270"
          fill="none"
          stroke="url(#ss-arc-b)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="7 7"
          initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 1.6, ease: 'easeInOut', delay: 0.25 }}
        />
        <motion.polygon
          points="150,270 158,280 148,279"
          fill="#0EA5E9"
          animate={prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        />

        {/* ---------------- skill tokens travelling along the upper arc */}
        {[
          { label: 'Python', x: 210, y: 92, delay: 0 },
          { label: 'SQL', x: 300, y: 82, delay: 0.8 },
        ].map((token) => (
          <motion.g
            key={token.label}
            animate={prefersReducedMotion ? undefined : { y: [0, -7, 0] }}
            transition={floatTransition(token.delay)}
          >
            <rect x={token.x - 30} y={token.y - 12} width="60" height="24" rx="12" fill="#4F46E5" />
            <text
              x={token.x}
              y={token.y + 4}
              textAnchor="middle"
              fill="white"
              fontSize="11"
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {token.label}
            </text>
          </motion.g>
        ))}

        {/* ---------------- skill tokens travelling along the lower arc */}
        {[
          { label: 'UI Design', x: 210, y: 340, delay: 0.4 },
          { label: 'Figma', x: 306, y: 344, delay: 1.2 },
        ].map((token) => (
          <motion.g
            key={token.label}
            animate={prefersReducedMotion ? undefined : { y: [0, 7, 0] }}
            transition={floatTransition(token.delay)}
          >
            <rect x={token.x - 34} y={token.y - 12} width="68" height="24" rx="12" fill="#0EA5E9" />
            <text
              x={token.x}
              y={token.y + 4}
              textAnchor="middle"
              fill="white"
              fontSize="11"
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {token.label}
            </text>
          </motion.g>
        ))}

        {/* ---------------- person A (left) */}
        <motion.g
          animate={prefersReducedMotion ? undefined : { y: [0, -8, 0] }}
          transition={floatTransition(0)}
        >
          <circle cx="150" cy="210" r="62" fill="url(#ss-avatar-a)" opacity="0.14" />
          <circle cx="150" cy="210" r="52" fill="url(#ss-avatar-a)" />
          {/* head and shoulders */}
          <circle cx="150" cy="192" r="17" fill="white" opacity="0.95" />
          <path
            d="M118 244c0-17.7 14.3-32 32-32s32 14.3 32 32v6h-64v-6z"
            fill="white"
            opacity="0.95"
          />
          <text
            x="150"
            y="290"
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            Amara
          </text>
          <text
            x="150"
            y="306"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10.5"
            opacity="0.62"
            fontFamily="Inter, system-ui, sans-serif"
          >
            teaches Python
          </text>
        </motion.g>

        {/* ---------------- person B (right) */}
        <motion.g
          animate={prefersReducedMotion ? undefined : { y: [0, -8, 0] }}
          transition={floatTransition(1.4)}
        >
          <circle cx="370" cy="210" r="62" fill="url(#ss-avatar-b)" opacity="0.14" />
          <circle cx="370" cy="210" r="52" fill="url(#ss-avatar-b)" />
          <circle cx="370" cy="192" r="17" fill="white" opacity="0.95" />
          <path
            d="M338 244c0-17.7 14.3-32 32-32s32 14.3 32 32v6h-64v-6z"
            fill="white"
            opacity="0.95"
          />
          <text
            x="370"
            y="290"
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            Lucas
          </text>
          <text
            x="370"
            y="306"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10.5"
            opacity="0.62"
            fontFamily="Inter, system-ui, sans-serif"
          >
            teaches UI Design
          </text>
        </motion.g>

        {/* ---------------- the agreed exchange at the centre */}
        <motion.g
          animate={prefersReducedMotion ? undefined : { scale: [1, 1.06, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '260px 210px' }}
        >
          <circle cx="260" cy="210" r="30" fill="none" stroke="#6366F1" strokeWidth="1.5" opacity="0.35" />
          <circle cx="260" cy="210" r="22" fill="#6366F1" />
          <path
            d="M252 210l6 6 12-13"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
      </svg>

      {/* A quiet caption so the diagram is not mysterious. */}
      <p className="mt-2 text-center text-xs ss-subtle">
        One exchange: Python coaching in return for UI design coaching.
      </p>
    </div>
  );
}
