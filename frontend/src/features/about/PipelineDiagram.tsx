interface Props {
  nModels: number
}

const W = 300
const H = 40
const GAP = 16

/** Inline SVG of the data → UI pipeline (vertical so it stays legible when stacked). */
export function PipelineDiagram({ nModels }: Props) {
  const steps = [
    ['CSV', 'Z-Alizadeh Sani extension'],
    ['Schema-driven preprocessing', 'config/features.yaml'],
    [`${nModels} XGBoost models`, 'one per target'],
    ['Platt calibration', 'out-of-fold margins'],
    ['TreeSHAP explanations', 'sum to the calibrated logit'],
    ['FastAPI', 'predict, metrics'],
    ['React + React Three Fiber', 'form, 3D heart, results'],
  ]
  const height = steps.length * (H + GAP) - GAP
  return (
    <svg
      role="img"
      aria-label={`Pipeline: ${steps.map((s) => s[0]).join(' → ')}`}
      viewBox={`0 0 ${W} ${height}`}
      className="mx-auto h-auto w-full max-w-xs"
    >
      {steps.map(([title, sub], i) => {
        const y = i * (H + GAP)
        return (
          <g key={title}>
            <rect
              x={0.5}
              y={y + 0.5}
              width={W - 1}
              height={H - 1}
              rx={8}
              fill="var(--card)"
              stroke="var(--border)"
            />
            <text
              x={W / 2}
              y={y + 17}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {title}
            </text>
            <text
              x={W / 2}
              y={y + 32}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {sub}
            </text>
            {i < steps.length - 1 && (
              <path
                d={`M${W / 2} ${y + H + 2} v${GAP - 7} m-4 -4 l4 4 l4 -4`}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
