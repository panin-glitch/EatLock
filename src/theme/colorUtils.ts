function clampAlpha(alpha: number): number {
  if (Number.isNaN(alpha)) return 1;
  return Math.min(1, Math.max(0, alpha));
}

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.replace('#', '').trim();

  if (normalized.length === 3 || normalized.length === 4) {
    const [r, g, b] = normalized.slice(0, 3).split('').map((value) => value + value);
    return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
  }

  if (normalized.length === 6 || normalized.length === 8) {
    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ];
  }

  return null;
}

function parseRgbColor(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith('#')) return parseHexColor(color);
  if (color.startsWith('rgb')) return parseRgbColor(color);
  return null;
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;

  const [red, green, blue] = rgb;
  return `rgba(${red},${green},${blue},${clampAlpha(alpha)})`;
}

export function isColorDark(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return false;

  const [red, green, blue] = rgb;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 150;
}
