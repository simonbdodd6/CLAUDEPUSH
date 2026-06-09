/**
 * Terminal output formatting for the Rugby Coaching Assistant.
 * Uses ANSI escape codes — works in any standard terminal.
 */

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[97m',
  bgDark: '\x1b[48;5;234m',
};

const W = 62;

export function hr(ch = '─') {
  return c.dim + ch.repeat(W) + c.reset;
}

export function header(title, subtitle = '') {
  const lines = [
    hr('═'),
    `  ${c.bold}${c.green}${title}${c.reset}`,
  ];
  if (subtitle) lines.push(`  ${c.dim}${subtitle}${c.reset}`);
  lines.push(hr('═'));
  return lines.join('\n');
}

export function section(emoji, title) {
  return `\n${emoji}  ${c.bold}${c.cyan}${title.toUpperCase()}${c.reset}`;
}

export function bullet(text, indent = '  ') {
  return `${indent}${c.green}•${c.reset} ${text}`;
}

export function numbered(items, indent = '  ') {
  return items.map((t, i) => `${indent}${c.dim}${i + 1}.${c.reset} ${t}`).join('\n');
}

export function tag(text, color = c.yellow) {
  return `${color}[${text}]${c.reset}`;
}

export function dim(text) {
  return `${c.dim}${text}${c.reset}`;
}

export function bold(text) {
  return `${c.bold}${text}${c.reset}`;
}

export function warn(text) {
  return `${c.yellow}⚠  ${text}${c.reset}`;
}

export function info(text) {
  return `${c.blue}ℹ  ${text}${c.reset}`;
}

export function footer(elapsed, mode, kbSize) {
  const parts = [`Generated in ${elapsed}s`];
  if (kbSize != null) parts.push(`Knowledge base: ${kbSize} item${kbSize !== 1 ? 's' : ''}`);
  if (mode) parts.push(`Mode: ${mode}`);
  return `\n${hr()}\n  ${c.dim}${parts.join(' · ')}${c.reset}\n${hr('═')}`;
}

export function formatList(items, color = '') {
  if (!items?.length) return dim('  None found');
  return items.map(t => bullet(color ? `${color}${t}${c.reset}` : t)).join('\n');
}

export function formatKeyValue(map, color = c.yellow) {
  return Object.entries(map).map(([k, v]) =>
    `  ${color}${k}${c.reset}  ${v}`
  ).join('\n');
}
