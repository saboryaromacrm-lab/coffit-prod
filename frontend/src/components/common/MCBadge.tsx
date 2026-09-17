import clsx from 'clsx';
import { getMCClass } from '../../utils/calculators';

interface MCBadgeProps {
  value: number;
  showPercent?: boolean;
  size?: 'sm' | 'md';
}

export default function MCBadge({ value, showPercent = true, size = 'md' }: MCBadgeProps) {
  const mcClass = getMCClass(value);
  const display = showPercent ? `${value.toFixed(1)}%` : value.toFixed(1);

  return (
    <span
      className={clsx(
        'inline-flex items-center font-bold rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        {
          'bg-red-100 text-mc-danger': mcClass === 'danger',
          'bg-orange-100 text-mc-warning': mcClass === 'warning',
          'bg-green-100 text-mc-success': mcClass === 'success',
        }
      )}
    >
      {display}
    </span>
  );
}
