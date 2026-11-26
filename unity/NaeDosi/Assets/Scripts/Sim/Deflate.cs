using System;
using System.Collections.Generic;

namespace NaeDosi
{
    /// <summary>
    /// Raw DEFLATE (RFC 1951) in plain C#, because the web build has no native zlib. Inflate reads any
    /// stream (the web game's saves come from fflate); deflate writes LZ77 with the fixed Huffman codes,
    /// which every inflater (fflate included) reads.
    /// </summary>
    public static class Deflate
    {
        static readonly int[] LBASE = { 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258 };
        static readonly int[] LEXT = { 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 };
        static readonly int[] DBASE = { 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 };
        static readonly int[] DEXT = { 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 };
        static readonly int[] CLORDER = { 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 };

        // ------------------------------------------------------------------ inflate

        sealed class Bits
        {
            readonly byte[] d; int pos; uint buf; int cnt;
            public Bits(byte[] d) { this.d = d; }
            public int Get(int n)
            {
                while (cnt < n) { buf |= (uint)(pos < d.Length ? d[pos] : 0) << cnt; pos++; cnt += 8; }
                int v = (int)(buf & ((1u << n) - 1));
                buf >>= n; cnt -= n;
                return v;
            }
            public void Align() { buf = 0; cnt = 0; }
            public int Pos { get => pos; set => pos = value; }
            public byte Byte(int i) => d[i];
            public int Length => d.Length;
        }

        sealed class Huff
        {
            public readonly short[] count = new short[16];
            public readonly short[] sym;
            public Huff(int[] lengths, int n)
            {
                sym = new short[n];
                for (int i = 0; i < n; i++) count[lengths[i]]++;
                count[0] = 0;
                var offs = new short[16];
                for (int i = 1; i < 16; i++) offs[i] = (short)(offs[i - 1] + count[i - 1]);
                for (int i = 0; i < n; i++) if (lengths[i] != 0) sym[offs[lengths[i]]++] = (short)i;
            }
            public int Decode(Bits b)
            {
                int code = 0, first = 0, index = 0;
                for (int len = 1; len < 16; len++)
                {
                    code |= b.Get(1);
                    int c = count[len];
                    if (code - c < first) return sym[index + (code - first)];
                    index += c; first += c; first <<= 1; code <<= 1;
                }
                throw new Exception("bad deflate code");
            }
        }

        static Huff fixedLit, fixedDist;
        static void Fixed()
        {
            if (fixedLit != null) return;
            var l = new int[288];
            for (int i = 0; i < 144; i++) l[i] = 8;
            for (int i = 144; i < 256; i++) l[i] = 9;
            for (int i = 256; i < 280; i++) l[i] = 7;
            for (int i = 280; i < 288; i++) l[i] = 8;
            fixedLit = new Huff(l, 288);
            var d = new int[30];
            for (int i = 0; i < 30; i++) d[i] = 5;
            fixedDist = new Huff(d, 30);
        }

        public static byte[] Inflate(byte[] data)
        {
            var o = new List<byte>(data.Length * 4);
            var b = new Bits(data);
            int last;
            do
            {
                last = b.Get(1);
                int type = b.Get(2);
                if (type == 0)
                {
                    b.Align();
                    int p = b.Pos;
                    int len = b.Byte(p) | (b.Byte(p + 1) << 8);
                    p += 4;
                    for (int i = 0; i < len; i++) o.Add(b.Byte(p + i));
                    b.Pos = p + len;
                }
                else if (type == 1) { Fixed(); Block(b, o, fixedLit, fixedDist); }
                else if (type == 2)
                {
                    int hlit = b.Get(5) + 257, hdist = b.Get(5) + 1, hclen = b.Get(4) + 4;
                    var cl = new int[19];
                    for (int i = 0; i < hclen; i++) cl[CLORDER[i]] = b.Get(3);
                    var clh = new Huff(cl, 19);
                    var lens = new int[hlit + hdist];
                    for (int i = 0; i < hlit + hdist;)
                    {
                        int s = clh.Decode(b);
                        if (s < 16) { lens[i++] = s; continue; }
                        int rep, val = 0;
                        if (s == 16) { val = lens[i - 1]; rep = 3 + b.Get(2); }
                        else if (s == 17) rep = 3 + b.Get(3);
                        else rep = 11 + b.Get(7);
                        while (rep-- > 0) lens[i++] = val;
                    }
                    var ll = new int[hlit]; Array.Copy(lens, ll, hlit);
                    var dl = new int[hdist]; Array.Copy(lens, hlit, dl, 0, hdist);
                    Block(b, o, new Huff(ll, hlit), new Huff(dl, hdist));
                }
                else throw new Exception("bad deflate block");
            } while (last == 0);
            return o.ToArray();
        }

        static void Block(Bits b, List<byte> o, Huff lit, Huff dist)
        {
            for (; ; )
            {
                int s = lit.Decode(b);
                if (s < 256) { o.Add((byte)s); continue; }
                if (s == 256) return;
                s -= 257;
                int len = LBASE[s] + b.Get(LEXT[s]);
                int ds = dist.Decode(b);
                int d = DBASE[ds] + b.Get(DEXT[ds]);
                int start = o.Count - d;
                for (int i = 0; i < len; i++) o.Add(o[start + i]);
            }
        }

        // ------------------------------------------------------------------ deflate (fixed codes)

        sealed class Out
        {
            public readonly List<byte> b = new List<byte>(1 << 16); uint buf; int cnt;
            public void Put(int v, int n) { buf |= (uint)v << cnt; cnt += n; while (cnt >= 8) { b.Add((byte)buf); buf >>= 8; cnt -= 8; } }
            /// <summary>Huffman codes go most-significant bit first.</summary>
            public void Code(int code, int n) { int r = 0; for (int i = 0; i < n; i++) { r = (r << 1) | (code & 1); code >>= 1; } Put(r, n); }
            public void Flush() { if (cnt > 0) { b.Add((byte)buf); buf = 0; cnt = 0; } }
        }

        static void Lit(Out o, int s)
        {
            if (s < 144) o.Code(0x30 + s, 8);
            else if (s < 256) o.Code(0x190 + (s - 144), 9);
            else if (s < 280) o.Code(s - 256, 7);
            else o.Code(0xc0 + (s - 280), 8);
        }

        public static byte[] Compress(byte[] data)
        {
            var o = new Out();
            o.Put(1, 1); // final
            o.Put(1, 2); // fixed Huffman
            const int WIN = 32768, HBITS = 15, MAXCHAIN = 48;
            var head = new int[1 << HBITS]; for (int i = 0; i < head.Length; i++) head[i] = -1;
            var prev = new int[WIN];
            int n = data.Length, p = 0;
            int Hash(int i) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & ((1 << HBITS) - 1);
            void Insert(int i) { if (i + 2 >= n) return; int h = Hash(i); prev[i & (WIN - 1)] = head[h]; head[h] = i; }
            while (p < n)
            {
                int bestLen = 0, bestDist = 0;
                if (p + 2 < n)
                {
                    int cand = head[Hash(p)], chain = 0;
                    while (cand >= 0 && p - cand <= WIN - 1 && chain++ < MAXCHAIN)
                    {
                        int l = 0, max = Math.Min(258, n - p);
                        while (l < max && data[cand + l] == data[p + l]) l++;
                        if (l > bestLen) { bestLen = l; bestDist = p - cand; if (l == 258) break; }
                        int nx = prev[cand & (WIN - 1)];
                        if (nx >= cand) break;
                        cand = nx;
                    }
                }
                if (bestLen >= 3)
                {
                    int li = 0; while (li < 28 && LBASE[li + 1] <= bestLen) li++;
                    Lit(o, 257 + li); o.Put(bestLen - LBASE[li], LEXT[li]);
                    int di = 0; while (di < 29 && DBASE[di + 1] <= bestDist) di++;
                    o.Code(di, 5); o.Put(bestDist - DBASE[di], DEXT[di]);
                    for (int k = 0; k < bestLen; k++) Insert(p + k);
                    p += bestLen;
                }
                else { Lit(o, data[p]); Insert(p); p++; }
            }
            Lit(o, 256);
            o.Flush();
            return o.b.ToArray();
        }
    }
}
