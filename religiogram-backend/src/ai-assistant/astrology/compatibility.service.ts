import { Injectable } from '@nestjs/common';

// 8 kootas with their max points
const KOOTAS = [
  { name: 'Varna',     max: 1  },
  { name: 'Vashya',    max: 2  },
  { name: 'Tara',      max: 3  },
  { name: 'Yoni',      max: 4  },
  { name: 'Graha Maitri', max: 5 },
  { name: 'Gana',      max: 6  },
  { name: 'Bhakoot',   max: 7  },
  { name: 'Nadi',      max: 8  },
];

const NAKSHATRA_VARNA = [0,0,1,2,3,1,2,3,1,2,3,1,2,3,1,2,3,1,2,3,1,2,3,1,2,3,1];
const NAKSHATRA_GANA  = [0,0,0,1,0,2,0,1,2,2,2,1,1,2,0,0,1,2,2,2,1,1,0,2,0,1,1];
// 0=Deva, 1=Manushya, 2=Rakshasa

@Injectable()
export class CompatibilityService {
  calculateGunaScore(boyNakshatraIdx: number, girlNakshatraIdx: number): {
    total: number; maxTotal: number; percentage: number;
    kootas: Array<{ name: string; score: number; max: number }>;
    verdict: string;
  } {
    const b = boyNakshatraIdx  % 27;
    const g = girlNakshatraIdx % 27;

    const scores = [
      this.varna(b, g),
      this.vashya(b, g),
      this.tara(b, g),
      this.yoni(b, g),
      this.grahaMaitri(b, g),
      this.gana(b, g),
      this.bhakoot(b, g),
      this.nadi(b, g),
    ];

    const kootas = KOOTAS.map((k, i) => ({ name: k.name, score: scores[i], max: k.max }));
    const total    = scores.reduce((a, b) => a + b, 0);
    const maxTotal = 36;
    const percentage = Math.round((total / maxTotal) * 100);

    let verdict: string;
    if (total >= 32)      verdict = 'Excellent match — highly auspicious';
    else if (total >= 27) verdict = 'Very good match — recommended';
    else if (total >= 18) verdict = 'Average match — acceptable with remedies';
    else if (total >= 14) verdict = 'Below average — consider remedies';
    else                  verdict = 'Poor match — consult a priest for guidance';

    return { total, maxTotal, percentage, kootas, verdict };
  }

  private varna(b: number, g: number): number {
    const bv = NAKSHATRA_VARNA[b] ?? 0;
    const gv = NAKSHATRA_VARNA[g] ?? 0;
    return bv >= gv ? 1 : 0;
  }

  private vashya(b: number, g: number): number {
    // Simplified: same sign group = 2, friendly = 1, else 0
    const bSign = Math.floor(b * 12 / 27);
    const gSign = Math.floor(g * 12 / 27);
    if (bSign === gSign) return 2;
    if (Math.abs(bSign - gSign) <= 2) return 1;
    return 0;
  }

  private tara(b: number, g: number): number {
    // Tara: girl's nakshatra counted from boy's
    const diff = ((g - b) % 27 + 27) % 27;
    const tara = (diff % 9) + 1;
    const favorable = [1, 3, 5, 7];
    return favorable.includes(tara) ? 3 : tara === 2 ? 1 : 0;
  }

  private yoni(b: number, g: number): number {
    // Simplified yoni compatibility
    const bGroup = b % 7;
    const gGroup = g % 7;
    if (bGroup === gGroup) return 4;
    if (Math.abs(bGroup - gGroup) === 1) return 3;
    if (Math.abs(bGroup - gGroup) <= 3) return 2;
    return 0;
  }

  private grahaMaitri(b: number, g: number): number {
    // Lords of moon signs — simplified
    const bSign = Math.floor(b * 12 / 27);
    const gSign = Math.floor(g * 12 / 27);
    const diff = Math.abs(bSign - gSign);
    if (diff === 0) return 5;
    if (diff <= 2) return 4;
    if (diff <= 4) return 3;
    if (diff <= 6) return 2;
    return 1;
  }

  private gana(b: number, g: number): number {
    const bg = NAKSHATRA_GANA[b] ?? 0;
    const gg = NAKSHATRA_GANA[g] ?? 0;
    if (bg === gg) return 6;
    if (bg === 0 && gg === 1) return 5; // Deva + Manushya
    if (bg === 1 && gg === 0) return 4;
    return 0;
  }

  private bhakoot(b: number, g: number): number {
    const bSign = Math.floor(b * 12 / 27) + 1;
    const gSign = Math.floor(g * 12 / 27) + 1;
    const diff = ((gSign - bSign) % 12 + 12) % 12;
    const inauspicious = [6, 8, 2];
    return inauspicious.includes(diff) ? 0 : 7;
  }

  private nadi(b: number, g: number): number {
    // 0=Adi, 1=Madhya, 2=Antya — same nadi = 0 points (Nadi dosha)
    const bNadi = b % 3;
    const gNadi = g % 3;
    return bNadi === gNadi ? 0 : 8;
  }
}
