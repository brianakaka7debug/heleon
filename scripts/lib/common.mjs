import { promises as fs } from 'node:fs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const readJsonIfExists = async (filePath, fallback = null) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const parseArgs = () => {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[token.slice(2)] = true;
    } else {
      args[token.slice(2)] = next;
      index += 1;
    }
  }
  return args;
};

export const parseGtfsTimeToSeconds = (value) => {
  if (!value || typeof value !== 'string' || !value.includes(':')) {
    return null;
  }

  const [h, m, s] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (![h, m, s].every(Number.isFinite)) {
    return null;
  }

  return h * 3600 + m * 60 + s;
};

export const hstDateParts = (date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';

  return {
    year: Number.parseInt(value('year'), 10),
    month: Number.parseInt(value('month'), 10),
    day: Number.parseInt(value('day'), 10),
    hour: Number.parseInt(value('hour'), 10),
    minute: Number.parseInt(value('minute'), 10),
    second: Number.parseInt(value('second'), 10)
  };
};
