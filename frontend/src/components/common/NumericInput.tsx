import { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Numeric input that stores value as string internally.
 * Solves the "leading zero" problem (e.g. 01000 instead of 1000).
 * The field starts empty when value is 0, allowing clean typing.
 */
export default function NumericInput({ value, onChange, min, max, step = '0.01', className = '', placeholder }: NumericInputProps) {
  const [display, setDisplay] = useState(() => value ? String(value) : '');

  // Sync from parent when value changes externally (e.g. on modal open)
  useEffect(() => {
    setDisplay(value ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplay(raw);

    if (raw === '' || raw === '-') {
      onChange(0);
      return;
    }

    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    // On blur, clean up the display: remove leading zeros, trailing dots, etc.
    if (display === '' || display === '-') {
      setDisplay('');
      return;
    }
    const num = parseFloat(display);
    if (!isNaN(num)) {
      setDisplay(num ? String(num) : '');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder || '0'}
      className={className}
    />
  );
}
