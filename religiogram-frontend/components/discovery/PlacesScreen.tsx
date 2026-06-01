'use client';

import { useState, useCallback, useEffect, useRef , Suspense} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useReligion, UserReligion } from '@/lib/useReligion';
import ReligionPicker from './ReligionPicker';
import { tokenStore } from '@/lib/api';

const GOLD    = '#C8920A';
const GOLD2   = '#E8C050';
const NAVY    = '#0A1628';
const PARCH   = '#FFFBF0';
const CARD    = '#FFFFFF';
const BORDER  = 'rgba(200,146,10,0.22)';
const CHIP_BG = 'rgba(20,38,72,0.85)';

/* ── Professional faith symbols (SVG — no emoji) ─────────────────────── */
function FaithIcon({ k, active }: { k: string; active: boolean }) {
  const col = active ? NAVY : GOLD2;
  if (k === 'hindu') return (
    <span style={{ fontSize:26, fontWeight:800, color:col, fontFamily:"Georgia,'Times New Roman',serif", lineHeight:1, display:'block' }}>ॐ</span>
  );
  if (k === 'muslim') return (
    <svg width="24" height="22" viewBox="0 0 24 22" fill="none">
      <path d="M20 11a8 8 0 1 1-8-8 6 6 0 0 0 8 8z" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="16,3 17,6.2 20.4,6.2 17.7,8.1 18.7,11.3 16,9.4 13.3,11.3 14.3,8.1 11.6,6.2 15,6.2" fill={col}/>
    </svg>
  );
  if (k === 'sikh') return (
    <svg width="22" height="24" viewBox="0 0 22 24" fill={col}>
      <line x1="11" y1="0" x2="11" y2="24" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="11" cy="12" r="5.5" stroke={col} strokeWidth="2" fill="none"/>
      <path d="M11 1 L5 7 L11 6 L17 7 Z" fill={col}/>
      <path d="M11 23 L5 17 L11 18 L17 17 Z" fill={col}/>
    </svg>
  );
  if (k === 'christian') return (
    <svg width="18" height="24" viewBox="0 0 18 24" fill={col}>
      <rect x="7.5" y="0" width="3" height="24" rx="1.5"/>
      <rect x="0" y="7" width="18" height="3" rx="1.5"/>
    </svg>
  );
  /* all faiths — 8-pointed star */
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={col}>
      <path d="M12 2l2.09 6.26L20.18 6l-3.45 5.5 6.27 2.09-6.27 2.09 3.45 5.5-6.09-2.26L12 22l-2.09-6.26L3.82 18l3.45-5.5L1 10.41l6.27-2.09L4.18 3l6.09 2.26z"/>
    </svg>
  );
}

/* ── Small faith icons for compact chips ─────────────────────────────── */
function FaithIconSmall({ k, active }: { k: string; active: boolean }) {
  const col = active ? NAVY : GOLD2;
  if (k === 'hindu') return (
    <span style={{ fontSize:16, fontWeight:800, color:col, fontFamily:"Georgia,'Times New Roman',serif", lineHeight:1, display:'block' }}>ॐ</span>
  );
  if (k === 'muslim') return (
    <svg width="15" height="14" viewBox="0 0 24 22" fill="none">
      <path d="M20 11a8 8 0 1 1-8-8 6 6 0 0 0 8 8z" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="16,3 17,6.2 20.4,6.2 17.7,8.1 18.7,11.3 16,9.4 13.3,11.3 14.3,8.1 11.6,6.2 15,6.2" fill={col}/>
    </svg>
  );
  if (k === 'sikh') return (
    <svg width="14" height="15" viewBox="0 0 22 24" fill={col}>
      <line x1="11" y1="0" x2="11" y2="24" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="11" cy="12" r="5.5" stroke={col} strokeWidth="2" fill="none"/>
      <path d="M11 1 L5 7 L11 6 L17 7 Z" fill={col}/>
      <path d="M11 23 L5 17 L11 18 L17 17 Z" fill={col}/>
    </svg>
  );
  if (k === 'christian') return (
    <svg width="11" height="15" viewBox="0 0 18 24" fill={col}>
      <rect x="7.5" y="0" width="3" height="24" rx="1.5"/>
      <rect x="0" y="7" width="18" height="3" rx="1.5"/>
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={col}>
      <path d="M12 2l2.09 6.26L20.18 6l-3.45 5.5 6.27 2.09-6.27 2.09 3.45 5.5-6.09-2.26L12 22l-2.09-6.26L3.82 18l3.45-5.5L1 10.41l6.27-2.09L4.18 3l6.09 2.26z"/>
    </svg>
  );
}

/* ── Types ───────────────────────────────────────────────────────────── */
type PlaceType     = 'temple'|'mosque'|'church'|'gurudwara'|'monastery';
type PlaceReligion = 'all'|'hindu'|'muslim'|'christian'|'sikh'|'buddhist'|'jain';
type FilterRel     = 'all'|'hindu'|'muslim'|'christian'|'sikh';
type SortBy        = 'dist_low_high'|'dist_high_low'|'rating_low_high'|'rating_high_low';
interface Place {
  id:string; name:string; type:PlaceType; religion:PlaceReligion;
  location:string; distance?:string; rating:number; reviewCount:number;
  isOpen:boolean; coverColor:string; coverColor2:string; coverAccent:string;
  icon:string; featured?:boolean;
  distKm:number; yearsOld:number; entryFee:number;
  photoUrl?:string; placeLabel?:string;
}
interface Filter { sort:SortBy; status:'all'|'open'; }
const DEFAULT_FILTER: Filter = { sort:'dist_low_high', status:'all' };
const RTYPE: Partial<Record<FilterRel,PlaceType[]>> = {
  hindu:['temple'], muslim:['mosque'], christian:['church'], sikh:['gurudwara'],
};

const FAITH_META: Record<string,{label:string;sym:string;color:string}> = {
  hindu:     { label:'Hindu Temple', sym:'☸', color:'#C2410C' },
  muslim:    { label:'Masjid',       sym:'☪', color:'#15803D' },
  sikh:      { label:'Gurdwara',     sym:'☬', color:'#B45309' },
  christian: { label:'Church',       sym:'✝', color:'#6D28D9' },
  buddhist:  { label:'Monastery',    sym:'☸', color:'#92400E' },
  jain:      { label:'Jain Temple',  sym:'☸', color:'#92400E' },
};


/* ── Map a Google Place API response to our Place shape ─────────── */
const REL_COVER: Record<string, { cc:string; cc2:string; ca:string; icon:string }> = {
  hindu:     { cc:'#7B2D0A', cc2:'#C4501A', ca:'#F4A460', icon:'🪔' },
  muslim:    { cc:'#063A20', cc2:'#0F6840', ca:'#4CAF78', icon:'🕌' },
  sikh:      { cc:'#5C3206', cc2:'#B86010', ca:'#E8A030', icon:'🛕' },
  christian: { cc:'#28106A', cc2:'#5030AA', ca:'#9060E0', icon:'⛪' },
  other:     { cc:'#1A2A4A', cc2:'#2A4A7A', ca:'#6090C0', icon:'🏛️' },
};
function googlePlaceToPlace(p: {
  id:string; name:string; religion:string; placeType:string;
  location:string; distance:string|null; distKm:number;
  rating:number; reviewCount:number; isOpen:boolean;
  featured:boolean; verified:boolean; photoUrl:string|null;
  lat:number; lng:number;
}): Place {
  const rel = p.religion as PlaceReligion;
  const cv  = REL_COVER[rel] ?? REL_COVER.other;
  const type: PlaceType =
    rel === 'hindu' ? 'temple' : rel === 'muslim' ? 'mosque' :
    rel === 'sikh' ? 'gurudwara' : rel === 'christian' ? 'church' : 'temple';
  return {
    id: p.id, name: p.name, type, religion: rel,
    location: typeof p.location === 'string' ? p.location : '',
    distance: p.distance ?? undefined,
    rating: Number(p.rating) || 4.0, reviewCount: Number(p.reviewCount) || 0,
    isOpen: p.isOpen ?? true,
    coverColor: cv.cc, coverColor2: cv.cc2, coverAccent: cv.ca,
    icon: cv.icon, featured: p.featured ?? false,
    distKm: Number(p.distKm) || 0, yearsOld: 0, entryFee: 0,
    photoUrl: p.photoUrl ?? undefined,
    placeLabel: p.placeType ?? undefined,
  };
}

// ALL_PLACES removed — using live API data + optional static fallback below

const FAITH_CHIPS: { key:FilterRel; label:string }[] = [
  { key:'all',       label:'All Faiths' },
  { key:'hindu',     label:'Hindu'      },
  { key:'muslim',    label:'Muslim'     },
  { key:'sikh',      label:'Sikh'       },
  { key:'christian', label:'Christian'  },
];

type FilterCat = 'sort'|'status';
function buildCats(religion: FilterRel) {
  const typeOpts: Record<FilterRel,{value:string;label:string}[]> = {
    all:[{value:'temple',label:'Temple'},{value:'mosque',label:'Mosque'},{value:'church',label:'Church'},{value:'gurudwara',label:'Gurudwara'},{value:'monastery',label:'Monastery'}],
    hindu:[{value:'temple',label:'Temple'}], muslim:[{value:'mosque',label:'Mosque'}],
    christian:[{value:'church',label:'Church'}], sikh:[{value:'gurudwara',label:'Gurudwara'}],
  };
  return [
    { key:'sort' as FilterCat,     label:'Sort by',    multi:false, options:[{value:'dist_low_high',label:'Distance: Low to High'},{value:'dist_high_low',label:'Distance: High to Low'},{value:'rating_low_high',label:'Rating: Low to High'},{value:'rating_high_low',label:'Rating: High to Low'}] },
    { key:'status' as FilterCat,   label:'Status',     multi:false, options:[{value:'all',label:'All Places'},{value:'open',label:'Open Now'}] },
  ];
}
function countActive(f: Filter) {
  return (f.status !== 'all' ? 1 : 0) + (f.sort !== 'dist_low_high' ? 1 : 0);
}

/* ── Filter Sheet ─────────────────────────────────────────────────── */
function FilterSheet({ filters, religion, onApply, onClose }: {
  filters:Filter; religion:FilterRel; onApply:(f:Filter)=>void; onClose:()=>void;
}) {
  const [draft, setDraft] = useState<Filter>({ ...filters });
  const [active, setActive] = useState<FilterCat>('sort');
  const cats = buildCats(religion);
  const cat  = cats.find(c => c.key === active)!;
  const isSel = (v:string) => {
    if (cat.key === 'sort')     return draft.sort === v;
    if (cat.key === 'status')   return draft.status === v;
    return false;
  };
  const toggle = (v:string) => setDraft((p: any) => {
    const d = { ...p };
    if (cat.key === 'sort')     { d.sort     = v as SortBy;       return d; }
    if (cat.key === 'status')   { d.status   = v as 'all'|'open'; return d; }
    return d;
  });
  const badge = (k:FilterCat) => {
    if (k==='sort')     return draft.sort !== 'dist_low_high' ? 1 : 0;
    if (k==='status')   return draft.status !== 'all' ? 1 : 0;
    return 0;
  };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div style={{ position:'relative', background:PARCH, borderRadius:'20px 20px 0 0', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ background:NAVY, padding:'14px 20px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ flex:1, fontSize:15, fontWeight:800, color:GOLD, fontFamily:"'Playfair Display',serif" }}>Sort &amp; Filter</span>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${BORDER}`, borderRadius:8, cursor:'pointer', padding:'4px 10px', color:GOLD, fontSize:13 }}>&#x2715;</button>
        </div>
        <div style={{ display:'flex', height:280, overflow:'hidden' }}>
          <div style={{ width:130, borderRight:`1.5px solid ${BORDER}`, overflowY:'auto', flexShrink:0, background:'#FDF6E3' }}>
            {cats.map(c => {
              const a = active === c.key;
              const n = badge(c.key);
              return (
                <button key={c.key} onClick={() => setActive(c.key)}
                  style={{ width:'100%', textAlign:'left', padding:'14px 12px', background:a?PARCH:'transparent', border:'none', borderLeft:`3px solid ${a?GOLD:'transparent'}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
                  <span style={{ fontSize:12.5, fontWeight:a?700:500, color:a?NAVY:'rgba(10,22,40,.55)' }}>{c.label}</span>
                  {n > 0 && <span style={{ width:17, height:17, borderRadius:'50%', background:GOLD, color:NAVY, fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{n}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
            {cat.options.map(opt => {
              const sel = isSel(opt.value);
              return (
                <button key={opt.value} onClick={() => toggle(opt.value)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:sel?'rgba(200,146,10,.06)':'transparent', border:'none', cursor:'pointer', borderBottom:`1px solid ${BORDER}`, textAlign:'left', gap:12 }}>
                  <span style={{ fontSize:13, fontWeight:sel?700:400, color:sel?NAVY:'rgba(10,22,40,.7)' }}>{opt.label}</span>
                  {!cat.multi
                    ? <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, border:`2px solid ${sel?GOLD:'rgba(200,146,10,.3)'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>{sel && <div style={{ width:10, height:10, borderRadius:'50%', background:GOLD }} />}</div>
                    : <div style={{ width:20, height:20, borderRadius:5, flexShrink:0, border:`2px solid ${sel?GOLD:'rgba(200,146,10,.3)'}`, background:sel?GOLD:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>{sel && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={NAVY} strokeWidth="2" strokeLinecap="round"/></svg>}</div>
                  }
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding:'12px 16px', borderTop:`1.5px solid ${BORDER}`, display:'flex', gap:10, flexShrink:0, background:PARCH }}>
          <button onClick={() => setDraft({ ...DEFAULT_FILTER })}
            style={{ padding:'12px 18px', borderRadius:12, border:`1.5px solid ${BORDER}`, background:'transparent', color:GOLD, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Reset
          </button>
          <button onClick={() => { onApply(draft); onClose(); }}
            style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${GOLD},${GOLD2})`, color:NAVY, fontSize:14, fontWeight:900, fontFamily:"'Playfair Display',serif", cursor:'pointer' }}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Place Card ──────────────────────────────────────────────────── */
function PlaceCard({ place }: { place: Place }) {
  const fm = FAITH_META[place.religion] ?? { label:'Place of Worship', sym:'✦', color:GOLD };
  const label = place.placeLabel ?? fm.label;

  return (
    <Link href={`/place/${place.id}`} style={{ display:'block', textDecoration:'none', marginBottom:14 }}>
      <div style={{ background:CARD, borderRadius:16, overflow:'hidden', border:'1px solid rgba(200,146,10,.13)', boxShadow:'0 3px 22px rgba(10,22,40,.11)', display:'flex', flexDirection:'row', minHeight:145 }}>

        {/* ── LEFT: Photo panel ── */}
        <div style={{ width:132, flexShrink:0, position:'relative', overflow:'hidden', background:`linear-gradient(160deg,${place.coverColor},${place.coverColor2})` }}>
          {place.photoUrl
            ? <Image
                src={place.photoUrl}
                alt={place.name}
                fill
                loading="lazy"
                sizes="132px"
                style={{ objectFit:'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:44 }}>{place.icon}</span>
              </div>
          }
          {/* subtle bottom fade for depth */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,rgba(0,0,0,.08) 0%,transparent 40%,rgba(0,0,0,.22) 100%)' }} />
          {place.featured && (
            <div style={{ position:'absolute', top:9, left:9, background:GOLD, borderRadius:8, padding:'3px 8px', zIndex:2, boxShadow:'0 2px 8px rgba(0,0,0,.28)' }}>
              <span style={{ fontSize:8.5, fontWeight:900, color:NAVY, letterSpacing:0.3 }}>&#9733; Featured</span>
            </div>
          )}
        </div>

        {/* ── RIGHT: Info panel ── */}
        <div style={{ flex:1, padding:'11px 10px 11px 12px', display:'flex', flexDirection:'column', minWidth:0, gap:4 }}>

          {/* Row 1: faith type + heart */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, fontWeight:700, color:fm.color }}>
              <span style={{ fontSize:14, lineHeight:1 }}>{fm.sym}</span>
              {label}
            </span>
            <span style={{ fontSize:20, color:'rgba(10,22,40,.18)', lineHeight:1, cursor:'pointer' }}>&#9825;</span>
          </div>

          {/* Row 2: Name */}
          <p style={{ fontSize:15.5, fontWeight:900, color:NAVY, fontFamily:"'Playfair Display',Georgia,serif", margin:0, lineHeight:1.25 }}>
            {place.name}
          </p>

          {/* Row 3: Rating + Verified */}
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ color:'#F59E0B', fontSize:12, lineHeight:1 }}>&#9733;</span>
            <span style={{ fontSize:13, fontWeight:800, color:NAVY }}>{place.rating}</span>
            <span style={{ color:'rgba(10,22,40,.18)', fontSize:12 }}>|</span>
            <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
              <circle cx="12" cy="12" r="11" fill="#2563EB"/>
              <path d="M7 12l3.5 3.5L17 8.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize:11.5, fontWeight:700, color:'#1D4ED8' }}>Verified</span>
          </div>

          {/* Row 4: Distance + location */}
          {place.distance && (
            <p style={{ fontSize:11, color:'rgba(10,22,40,.50)', margin:0, fontWeight:500, lineHeight:1.4 }}>
              &#128205; {place.distance}&nbsp;&bull;&nbsp;{place.location}
            </p>
          )}

          {/* Row 5: Buttons */}
          <div style={{ display:'flex', gap:6, marginTop:'auto', paddingTop:2 }}>
            <div style={{
              borderRadius:20, padding:'5px 10px', fontSize:10, fontWeight:700, whiteSpace:'nowrap', flexShrink:0,
              background:place.isOpen?'#DCFCE7':'#FEE2E2',
              color:place.isOpen?'#15803D':'#B91C1C',
              border:`1px solid ${place.isOpen?'#BBF7D0':'#FECACA'}`,
            }}>
              {place.isOpen ? 'Open Now' : 'Closed'}
            </div>
            <div style={{ flex:1, borderRadius:20, padding:'5px 8px', fontSize:10, fontWeight:800, background:NAVY, color:GOLD2, display:'flex', alignItems:'center', justifyContent:'center', gap:2, whiteSpace:'nowrap' }}>
              View Details &#8250;
            </div>
          </div>

        </div>
      </div>
    </Link>
  );
}

/* ── Religion label helpers ───────────────────────────────────────── */
const RELIGION_LABELS: Record<UserReligion, { nearby: string; global: string }> = {
  all:       { nearby: 'Nearby Places',     global: 'Global Places'     },
  hindu:     { nearby: 'Nearby Temples',    global: 'Temples Worldwide' },
  muslim:    { nearby: 'Nearby Mosques',    global: 'Mosques Worldwide' },
  sikh:      { nearby: 'Nearby Gurudwaras', global: 'Gurudwaras Worldwide' },
  christian: { nearby: 'Nearby Churches',   global: 'Churches Worldwide' },
};

/* ── Main Screen ─────────────────────────────────────────────────── */
function PlacesInner() {
  const router  = useRouter();
  const params  = useSearchParams();

  /* Religion from localStorage */
  const { religion: userReligion, confirmReligion, loaded } = useReligion();

  /* Internal filter state — religion is now driven by userReligion */
  const religion: FilterRel = (userReligion ?? 'all') as FilterRel;
  const [filters,    setFilters]    = useState<Filter>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search,     setSearch]     = useState('');
  const [localTab,   setLocalTab]   = useState<'local'|'global'>('local');
  const [openOnly,   setOpenOnly]   = useState(false);
  const [apiPlaces,  setApiPlaces]  = useState<Place[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Debounced search ───────────────────────────────────────────────── */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Fetch places: backend API first, Google Places API as fallback ── */
  useEffect(() => {
    setGeoLoading(true);
    setApiPlaces(null);

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';
    const token = tokenStore.access ?? '';
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };

    // Map frontend sort values to API params
    const sortByMap: Record<SortBy, string> = {
      dist_low_high:   'distance',
      dist_high_low:   'distance_desc',
      rating_low_high: 'rating',
      rating_high_low: 'rating_desc',
    };

    function fetchFromGoogle(lat: number, lng: number, rel: string) {
      const url = `/api/places?lat=${lat}&lng=${lng}&religion=${rel}&scope=local`;
      return fetch(url, { signal })
        .then(r => r.json())
        .then((body: { places: any[] }) => {
          if (body.places?.length) {
            setApiPlaces(body.places.map(googlePlaceToPlace));
          }
        })
        .catch(() => {});
    }

    function fetchFromBackend(lat: number, lng: number, rel: string) {
      const qp = new URLSearchParams({
        religion: rel,
        lat: String(lat),
        lng: String(lng),
        page: '1',
        limit: '20',
        sortBy: sortByMap[filters.sort] ?? 'distance',
      });
      if (filters.status === 'open' || openOnly) qp.set('isOpen', 'true');
      if (debouncedSearch.trim()) qp.set('query', debouncedSearch.trim());
      return fetch(`${API_BASE_URL}/places?${qp}`, { headers, signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('not ok')))
        .then(data => {
          const items: any[] = data?.data ?? data?.places ?? data?.items ?? [];
          if (items.length > 0) {
            setApiPlaces(items.map((p: any) => ({
              id: p.id ?? p._id ?? String(Math.random()),
              name: p.name,
              type: p.type ?? p.placeType ?? 'temple',
              religion: (p.religion ?? 'hindu') as any,
              location: p.address ?? p.location ?? '',
              distance: p.distanceText ?? (p.distKm ? `${p.distKm} km` : undefined),
              distKm: Number(p.distKm) || 0,
              yearsOld: p.yearsOld ?? 0,
              entryFee: p.entryFee ?? 0,
              rating: Number(p.rating) || 4.5,
              reviewCount: p.reviewCount ?? 0,
              isOpen: p.isOpen ?? true,
              coverColor: '#7B2D0A',
              coverColor2: '#C4501A',
              coverAccent: '#F4A460',
              icon: p.icon ?? '🛕',
              featured: p.featured ?? false,
              photoUrl: p.imageUrl ?? p.photoUrl ?? undefined,
              placeLabel: p.placeLabel ?? p.type ?? undefined,
            })));
            return true; // signal success
          }
          return false;
        });
    }

    function withLocation(lat: number, lng: number) {
      // Try backend first, fall back to Google Places proxy
      fetchFromBackend(lat, lng, religion)
        .then(ok => {
          if (!ok) return fetchFromGoogle(lat, lng, religion);
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') {
            fetchFromGoogle(lat, lng, religion).catch(() => {});
          }
        })
        .finally(() => { if (!signal.aborted) setGeoLoading(false); });
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => withLocation(pos.coords.latitude, pos.coords.longitude),
        () => withLocation(20.5937, 78.9629),  // India centroid fallback
        { timeout: 6000 },
      );
    } else {
      withLocation(20.5937, 78.9629);
    }

    return () => { abortRef.current?.abort(); };
  }, [religion, filters, openOnly, debouncedSearch]);

  const activeFilters = countActive(filters);

  const applyFilters = useCallback((places: Place[]) => {
    let list = places;
    if (religion !== 'all') {
      const dft = RTYPE[religion];
      list = list.filter(p => p.religion === religion);
    }
    if (filters.status === 'open' || openOnly) list = list.filter(p => p.isOpen);
    if (search.trim()) list = list.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase())
    );
    switch (filters.sort) {
      case 'dist_high_low':   list = [...list].sort((a,b) => b.distKm - a.distKm);  break;
      case 'rating_low_high': list = [...list].sort((a,b) => a.rating - b.rating);  break;
      case 'rating_high_low': list = [...list].sort((a,b) => b.rating - a.rating);  break;
    }
    return list;
  }, [religion, filters, search, openOnly]);

  // Use live API places; empty list shown as loading/empty state
  const sourcePlaces = apiPlaces ?? [];
  const allFiltered  = applyFilters(sourcePlaces);
  // For "Nearby" tab: if we have API places use all of them; else filter by distance field
  const nearby       = apiPlaces ? allFiltered : allFiltered.filter((p: any) => p.distance);
  const globalList   = apiPlaces ? allFiltered : allFiltered.filter((p: any) => !p.distance);
  const displayList  = localTab === 'local' ? nearby : globalList;

  const cardLabel = RELIGION_LABELS[(userReligion ?? 'all') as UserReligion];

  /* Show nothing while reading localStorage (avoids flash) */
  if (!loaded) return <div style={{ minHeight:'100svh', background:NAVY }} />;

  /* Religion not yet set → show full-screen picker */
  if (userReligion === null) return <ReligionPicker onConfirm={confirmReligion} />;

  return (
    <div style={{ minHeight:'100svh', background:NAVY, paddingBottom:80, overflowX:'hidden' }}>

      {/* ══════════════════════════════════════════════════════════
          HERO — 220px, image visible behind semi-transparent scrim
          logo inside (no Home button), text overlaid bottom-half
          ══════════════════════════════════════════════════════════ */}
      <div style={{ position:'relative', width:'100%', height:220, overflow:'hidden' }}>

        {/* LCP image — priority + sizes so the browser picks the right
            srcset variant (AVIF/WebP) and starts decoding immediately. */}
        <Image
          src="/holy-places-hero.jpg"
          alt="Sacred places"
          fill
          priority
          fetchPriority="high"
          sizes="(max-width: 640px) 100vw, 640px"
          style={{ objectFit:'cover', objectPosition:'center 45%' }}
        />

        {/* Gentle 3-stop overlay: dark top → clear middle → semi-dark bottom
            This keeps the golden image visible behind the text */}
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to bottom, rgba(10,22,40,.75) 0%, rgba(10,22,40,.08) 38%, rgba(10,22,40,.08) 52%, rgba(10,22,40,.80) 100%)' }} />



        {/* ── Text overlaid in lower half of hero ── */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'0 20px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <div style={{ height:1, width:16, background:GOLD2, opacity:.9 }} />
            <span style={{ fontSize:10.5, color:GOLD2, fontWeight:700, letterSpacing:3, textTransform:'uppercase' }}>Discover</span>
            <div style={{ height:1, width:16, background:GOLD2, opacity:.9 }} />
          </div>
          <h1 style={{ fontSize:30, fontWeight:900, color:'#FFFDF5', fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.08, margin:'0 0 4px', textShadow:'0 2px 16px rgba(0,0,0,.70)' }}>
            Sacred Places
          </h1>
          <p style={{ fontSize:12, color:'rgba(255,253,245,.70)', margin:0, fontWeight:500, letterSpacing:0.5 }}>
            Explore nearby places of worship for you
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CONTROLS — compact, all on NAVY
          ══════════════════════════════════════════════════════════ */}

      {/* Search */}
      <div style={{ background:NAVY, padding:'7px 12px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', background:'rgba(255,255,255,.97)', border:`1.5px solid rgba(200,146,10,.45)`, borderRadius:9, padding:'6px 10px', gap:7, boxShadow:'0 2px 8px rgba(0,0,0,.18)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>
          </svg>
          <input type="text" placeholder="Search temples, mosques, churches, gurudwaras..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:10, color:'rgba(10,22,40,.70)', fontFamily:'inherit' }} />
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/>
          </svg>
        </div>
      </div>

      {/* Local / Global */}
      <div style={{ background:NAVY, padding:'0 12px 7px' }}>
        <div style={{ display:'flex', background:'rgba(255,255,255,.06)', borderRadius:50, padding:2, border:`1px solid rgba(200,146,10,.20)` }}>
          {(['local','global'] as const).map(t => (
            <button key={t} onClick={() => setLocalTab(t)}
              style={{ flex:1, padding:'6px 0', border:'none', cursor:'pointer', borderRadius:50, background:localTab===t?`linear-gradient(90deg,${GOLD},${GOLD2})`:'transparent', color:localTab===t?NAVY:'rgba(232,196,80,.55)', fontSize:11, fontWeight:800, fontFamily:"'Playfair Display',serif", display:'flex', alignItems:'center', justifyContent:'center', gap:4, boxShadow:localTab===t?'0 2px 8px rgba(200,146,10,.40)':'none' }}>
              {t === 'local' ? '📍 Local' : '🌐 Global'}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CARDS — warm parchment, visible on first load
          ══════════════════════════════════════════════════════════ */}
      <div style={{ background:PARCH, borderRadius:'22px 22px 0 0', padding:'20px 16px 28px', minHeight:400, boxShadow:'0 -4px 24px rgba(10,22,40,.20)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:18, fontWeight:900, color:NAVY, fontFamily:"'Playfair Display',Georgia,serif" }}>
              {localTab === 'local' ? cardLabel.nearby : cardLabel.global}
            </span>
            <span style={{ color:GOLD, fontSize:16, fontWeight:700 }}>&#8592;</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={() => setFilterOpen(true)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:30, border:`1.5px solid ${activeFilters?GOLD:'rgba(10,22,40,.18)'}`, background:activeFilters?`rgba(200,146,10,.10)`:'rgba(10,22,40,.06)', color:activeFilters?GOLD:NAVY, fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
              Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}
            </button>
            <span style={{ fontSize:12.5, fontWeight:700, color:GOLD, fontFamily:"'Playfair Display',serif", cursor:'pointer' }}>View All &#8250;</span>
          </div>
        </div>

        {geoLoading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ background:'#FDF6E3', borderRadius:16, marginBottom:14, overflow:'hidden', border:'1px solid rgba(200,146,10,.13)', display:'flex', minHeight:145 }}>
                <div style={{ width:132, flexShrink:0, background:'#E8D5B0', position:'relative' }}>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)', animation:'shimmer 1.4s infinite' }} />
                </div>
                <div style={{ flex:1, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ height:11, background:'#E8D5B0', borderRadius:6, width:'40%' }} />
                  <div style={{ height:16, background:'#D9C49A', borderRadius:6, width:'80%' }} />
                  <div style={{ height:12, background:'#E8D5B0', borderRadius:6, width:'55%' }} />
                  <div style={{ height:11, background:'#EDD9B5', borderRadius:6, width:'70%' }} />
                  <div style={{ display:'flex', gap:6, marginTop:'auto' }}>
                    <div style={{ height:28, width:72, background:'#E8D5B0', borderRadius:20 }} />
                    <div style={{ height:28, flex:1, background:'#D9C49A', borderRadius:20 }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : displayList.length === 0 ? (
          <div style={{ textAlign:'center', padding:'72px 24px' }}>
            <div style={{
              width:72, height:72, margin:'0 auto 18px',
              borderRadius:'50%',
              background:`radial-gradient(circle at 30% 30%, ${GOLD}22, transparent 70%)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:34,
            }}>
              &#128221;
            </div>
            <p style={{ fontSize:18, fontWeight:800, color:NAVY, fontFamily:"'Playfair Display',serif", margin:0 }}>
              Coming Soon
            </p>
            <p style={{ fontSize:13, color:'rgba(10,22,40,.6)', marginTop:8, lineHeight:1.55, maxWidth:280, marginInline:'auto' }}>
              We&apos;re mapping sacred places across India. Live discovery will be available in a future update.
            </p>
          </div>
        ) : (
          displayList.map((p: any) => <PlaceCard key={p.id} place={p} />)
        )}
      </div>

      {filterOpen && (
        <FilterSheet filters={filters} religion={religion} onApply={setFilters} onClose={() => setFilterOpen(false)} />
      )}
    </div>
  );
}

export default function PlacesScreen() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100svh', background: '#FFFBF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid rgba(200,146,10,0.2)', borderTopColor: '#C8920A', borderRadius: '50%' }} />
      </div>
    }>
      <PlacesInner />
    </Suspense>
  );
}
