import axios, { AxiosResponse } from 'axios';
import { lookup } from 'node:dns/promises';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { isIP } from 'node:net';

type ResolvedAddress = { address: string; family: 4 | 6 };

const IPV4_NON_PUBLIC: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function ipv4ToBigInt(address: string): bigint | null {
  if (isIP(address) !== 4) return null;
  return address.split('.').reduce((value, part) => {
    return (value << 8n) + BigInt(Number(part));
  }, 0n);
}

function isInIpv4Prefix(address: string, network: string, prefix: number): boolean {
  const value = ipv4ToBigInt(address);
  const base = ipv4ToBigInt(network);
  if (value === null || base === null) return false;
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(32 - prefix);
  return (value & mask) === (base & mask);
}

function ipv6ToBigInt(address: string): bigint | null {
  let input = address.toLowerCase().split('%')[0];

  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':');
    const ipv4 = input.slice(lastColon + 1);
    const value = ipv4ToBigInt(ipv4);
    if (value === null) return null;
    const high = Number((value >> 16n) & 0xffffn).toString(16);
    const low = Number(value & 0xffffn).toString(16);
    input = input.slice(0, lastColon) + ':' + high + ':' + low;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;

  if (
    (halves.length === 1 && left.length !== 8) ||
    (halves.length === 2 && zeroCount < 1)
  ) {
    return null;
  }

  const groups = [...left, ...Array(zeroCount).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  return groups.reduce((value, part) => (value << 16n) + BigInt(parseInt(part, 16)), 0n);
}

function isInIpv6Prefix(address: string, network: string, prefix: number): boolean {
  const value = ipv6ToBigInt(address);
  const base = ipv6ToBigInt(network);
  if (value === null || base === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

const IPV6_NON_PUBLIC: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

export function isPublicIpAddress(address: string, family: number): boolean {
  if (family === 4) {
    const value = ipv4ToBigInt(address);
    return (
      value !== null &&
      !IPV4_NON_PUBLIC.some(([network, prefix]) =>
        isInIpv4Prefix(address, network, prefix),
      )
    );
  }

  if (family === 6 && isIP(address) === 6) {
    // Only global-unicast IPv6 (2000::/3) is eligible.
    return (
      isInIpv6Prefix(address, '2000::', 3) &&
      !IPV6_NON_PUBLIC.some(([network, prefix]) =>
        isInIpv6Prefix(address, network, prefix),
      )
    );
  }

  return false;
}

function validateRemoteUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Upload source must be a valid absolute HTTP(S) URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Upload source must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('Upload source must not include URL credentials.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || isIP(hostname) !== 0) {
    throw new Error('Upload source must use a public hostname, not an IP literal.');
  }

  if (
    hostname === 'localhost' ||
    ['.localhost', '.local', '.internal', '.test', '.example', '.invalid', '.onion'].some(
      (suffix) => hostname.endsWith(suffix),
    )
  ) {
    throw new Error('Upload source hostname is not publicly routable.');
  }

  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) {
    throw new Error('Upload source must use the standard HTTP or HTTPS port.');
  }

  return url;
}

export async function fetchPublicRemoteUrl(input: string): Promise<AxiosResponse<ArrayBuffer>> {
  const url = validateRemoteUrl(input);
  const hostname = url.hostname.toLowerCase();

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true }) as ResolvedAddress[];
  } catch {
    throw new Error('Upload source hostname could not be resolved to a public address.');
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicIpAddress(entry.address, entry.family))
  ) {
    throw new Error('Upload source must resolve only to public IP addresses.');
  }

  // Pin the HTTP client to the address we checked, avoiding a second DNS lookup
  // between validation and connection. Redirects and environment proxies are disabled.
  const target = addresses[0];
  const pinnedLookup = (requestedHost: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback;
    if (requestedHost.toLowerCase() !== hostname) {
      return cb(new Error('Unexpected hostname during pinned DNS lookup'));
    }
    if (typeof options === 'object' && options?.all) {
      return cb(null, [{ address: target.address, family: target.family }]);
    }
    return cb(null, target.address, target.family);
  };

  const httpAgent = new HttpAgent({ keepAlive: false, lookup: pinnedLookup as any });
  const httpsAgent = new HttpsAgent({ keepAlive: false, lookup: pinnedLookup as any });

  try {
    return await axios.get<ArrayBuffer>(url.href, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      maxBodyLength: 8 * 1024 * 1024,
      maxRedirects: 0,
      proxy: false,
      httpAgent,
      httpsAgent,
    });
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}
