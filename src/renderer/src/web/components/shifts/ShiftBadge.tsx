// components/shifts/ShiftBadge.tsx
import { MONO, SHIFT_BG, SHIFT_FG, SHIFT_LINE } from './tokens';

// The one "Shift" badge, used on the Active card and the History row so shift items are easy to tell from tasks.
export default function ShiftBadge() {
  return (
    <span style={{ fontFamily: MONO, fontSize: '0.64rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: SHIFT_FG, background: SHIFT_BG, border: `1px solid ${SHIFT_LINE}`, whiteSpace: 'nowrap' }}>
      Shift
    </span>
  );
}
