/*
 * Hosts of this machine or of the local network. A URL a page gives is never
 * requested there by the extension: the background's downloads
 * (image-download.ts) and the images of highlights shown on extension pages
 * (HighlightImage.tsx) check the host first.
 *
 * Hosts are checked as written in the URL: a public name that resolves to a
 * local address (DNS rebinding) is not caught here.
 */

const isPrivateIpv4 = ([a, b]: number[]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  a >= 224;

/** The eight words of an IPv6 address as `URL` writes it (compressed, hex). */
const ipv6Words = (address: string): number[] => {
  const words = (part: string) => (part ? part.split(':').map((w) => parseInt(w, 16)) : []);
  if (!address.includes('::')) return words(address);
  const [head, tail] = address.split('::');
  const [h, t] = [words(head), words(tail)];
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill(0), ...t];
};

const isPrivateIpv6 = (address: string) => {
  const w = ipv6Words(address);
  if (w.length !== 8 || w.some((x) => Number.isNaN(x))) return true;
  const v4 = (hi: number, lo: number) => isPrivateIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  const zero = (from: number, to: number) => w.slice(from, to).every((x) => x === 0);
  // Unspecified, loopback, and IPv4 in IPv6: compatible ::a.b.c.d, mapped
  // ::ffff:a.b.c.d, translated ::ffff:0:a.b.c.d.
  if (zero(0, 4) && ((w[4] === 0 && (w[5] === 0 || w[5] === 0xffff)) || (w[4] === 0xffff && w[5] === 0))) {
    if (w[4] === 0 && w[5] === 0 && w[6] === 0) return true;
    return v4(w[6], w[7]);
  }
  // NAT64 64:ff9b::a.b.c.d (the address it reaches), and the local-use NAT64
  // prefix 64:ff9b:1::/48 (local by definition).
  if (w[0] === 0x64 && w[1] === 0xff9b) return w[2] === 1 || !zero(2, 6) || v4(w[6], w[7]);
  // 6to4 2002:a.b.c.d::/48.
  if (w[0] === 0x2002) return v4(w[1], w[2]);
  return (
    (w[0] & 0xfe00) === 0xfc00 || // unique local
    (w[0] & 0xffc0) === 0xfe80 || // link local
    (w[0] & 0xff00) === 0xff00 // multicast
  );
};

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/**
 * A host of this machine or of the local network: loopback, private, link
 * local (169.254.x, cloud metadata) and other special addresses, `localhost`,
 * names of the local network (`.local`, ..., or one label such as `router`).
 * `hostname` as `URL` gives it: numeric IPv4 forms are already dotted.
 */
export const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[')) return isPrivateIpv6(host.slice(1, -1));
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return isPrivateIpv4(v4.slice(1).map(Number));
  if (host === 'localhost' || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  return !host.includes('.');
};
