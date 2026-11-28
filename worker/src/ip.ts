import { isIP } from "node:net";

type Cidr4 = readonly [string, number];

const blockedV4: readonly Cidr4[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function parseV4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inCidr4(value: number, [base, bits]: Cidr4): boolean {
  const baseValue = parseV4(base);
  if (baseValue === null) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(baseValue / size);
}

function isPublicV4(address: string): boolean {
  const value = parseV4(address);
  if (value === null) return false;
  return !blockedV4.some((cidr) => inCidr4(value, cidr));
}

function parseV6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseV4(tail);
    if (v4 === null) return null;
    const high = Math.floor(v4 / 65536).toString(16);
    const low = (v4 % 65536).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0] ?? "");
  if (head === null) return null;

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const rest = toGroups(halves[1] ?? "");
  if (rest === null) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

function isPublicV6(address: string): boolean {
  const groups = parseV6(address);
  if (groups === null) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;

  const isMapped =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
  if (isMapped) {
    return isPublicV4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
  }

  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  if (g0 === 0x2001 && g1 < 0x0200) return false;
  if (g0 === 0x2002) return false;
  return true;
}

export function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicAddress(address: string): boolean {
  const bare = stripBrackets(address);
  const family = isIP(bare);
  if (family === 4) return isPublicV4(bare);
  if (family === 6) return isPublicV6(bare);
  return false;
}
