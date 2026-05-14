import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Line, Text as SvgText, Circle } from 'react-native-svg';

const STAT_KEYS = ['strength', 'speed', 'defense', 'endurance', 'instinct', 'survival'];
const STAT_SHORT = ['FOR', 'VIT', 'DEF', 'END', 'INS', 'SUR'];
const MAX = 10;
const LEVELS = 4;

function getPoint(angle, value, cx, cy, radius) {
  const r = (value / MAX) * radius;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

export default function RadarChart({ stats = {}, size = 180 }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const labelRadius = radius + size * 0.1;
  const n = STAT_KEYS.length;
  const angles = STAT_KEYS.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2);

  // Points du polygone des stats
  const dataPoints = STAT_KEYS.map((key, i) => {
    const val = stats[key] || 0;
    return getPoint(angles[i], val, cx, cy, radius);
  });
  const dataStr = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View>
      <Svg width={size} height={size}>
        {/* Grilles de fond */}
        {Array.from({ length: LEVELS }).map((_, lvl) => {
          const r = (radius * (lvl + 1)) / LEVELS;
          const pts = angles.map(a => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`).join(' ');
          return (
            <Polygon
              key={lvl}
              points={pts}
              fill="none"
              stroke="#1a1a3e"
              strokeWidth="1"
            />
          );
        })}

        {/* Axes */}
        {angles.map((angle, i) => (
          <Line
            key={i}
            x1={cx} y1={cy}
            x2={cx + radius * Math.cos(angle)}
            y2={cy + radius * Math.sin(angle)}
            stroke="#2a2a5a"
            strokeWidth="1"
          />
        ))}

        {/* Polygone des stats */}
        <Polygon
          points={dataStr}
          fill="#e2b96f33"
          stroke="#e2b96f"
          strokeWidth="1.5"
        />

        {/* Points sur les axes */}
        {dataPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#e2b96f" />
        ))}

        {/* Labels */}
        {angles.map((angle, i) => {
          const lx = cx + labelRadius * Math.cos(angle);
          const ly = cy + labelRadius * Math.sin(angle);
          return (
            <SvgText
              key={i}
              x={lx} y={ly + 4}
              textAnchor="middle"
              fontSize={size * 0.065}
              fill="#888"
              fontFamily="monospace"
            >
              {STAT_SHORT[i]}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
