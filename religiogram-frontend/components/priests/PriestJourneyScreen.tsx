'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

const GOLD = '#C8920A'; const GOLD2 = '#E8B430'; const NAVY = '#0A1628'; const BG = '#F5E6C0';

/* ─── Types ─────────────────────────────────────────────────── */
interface OfflineService { id:string; name:string; duration:string; price:number; }
interface Priest {
  id:string; name:string; religion:'hindu'|'muslim'|'sikh'|'christian'; title:string;
  initials:string; color:string; specialty:string[]; languages:string[];
  experience:number; rating:number; reviewCount:number;
  pricePerMin:number; pricePerService:number;
  isOnline:boolean; isVerified:boolean; bio:string; services:OfflineService[];
}
type JourneyView = 'list'|'profile'|'booking'|'booking-confirm'|'consult';

/* ─── Mock Priests ───────────────────────────────────────────── */

const TIME_SLOTS = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM'];
const DATES = Array.from({length:7},(_,i)=>{
  const d=new Date(); d.setDate(d.getDate()+i+1);
  return { label: i===0?'Tomorrow':d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}), value: d.toISOString().split('T')[0] };
});

/* ─── Star Rating ────────────────────────────────────────────── */
function Stars({n}:{n:number}){
  return <span style={{color:GOLD,fontSize:13}}>{'★'.repeat(Math.floor(n))}{'☆'.repeat(5-Math.floor(n))}</span>;
}

/* ─── Priest Avatar ──────────────────────────────────────────── */
function Avatar({p,size=48}:{p:Priest;size?:number}){
  return (
    <div style={{width:size,height:size,borderRadius:size/3,background:p.color,flexShrink:0,
      display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
      <span style={{fontSize:size*0.35,fontWeight:900,color:'#fff'}}>{p.initials}</span>
      {p.isOnline&&<div style={{position:'absolute',bottom:2,right:2,width:size*0.22,height:size*0.22,
        borderRadius:'50%',background:'#22C55E',border:'2px solid #fff'}}/>}
    </div>
  );
}


/* ─── Specialty icon map ─────────────────────────────────────── */
const SPEC_ICON: Record<string,string> = {
  'Puja & Havan':'🪔','Wedding Ceremonies':'💍','Vastu Shastra':'🏛',
  'Havan & Yagna':'🔥','Rudrabhishek':'🙏','Katha':'📖',
  'Antyesti':'🕊','Shraddha':'🙏','Pitru Tarpan':'💧',
  'Nikah':'💍','Janaza':'🕊','Islamic Counseling':'📿',
  'Quran Recitation':'📖','Dua':'🤲','Khatam':'📿',
  'Anand Karaj':'💍','Akhand Path':'📖','Ardas':'🙏',
  'Kirtan':'🎵','Gurbani':'📖','Sukhmani Sahib Path':'📖',
  'Holy Mass':'✝','Baptism':'💧','House Blessing':'🏠',
  'Prayer Service':'🙏','Confirmation':'✝','Counseling':'💬',
};

/* ─── Corner ornament ────────────────────────────────────────── */
function Corner({flip}:{flip?:boolean}){
  const s:React.CSSProperties = flip
    ? {position:'absolute',bottom:5,right:5,transform:'rotate(180deg)',opacity:.35,pointerEvents:'none'}
    : {position:'absolute',top:5,left:5,opacity:.35,pointerEvents:'none'};
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={s}>
      <path d="M1 1 Q11 1 11 11" fill="none" stroke="rgba(200,146,10,.7)" strokeWidth="1.6"/>
      <path d="M1 1 Q1 11 11 11" fill="none" stroke="rgba(200,146,10,.7)" strokeWidth="1.6"/>
      <circle cx="3.5" cy="3.5" r="1.8" fill="rgba(200,146,10,.7)"/>
      <circle cx="7" cy="2" r=".9" fill="rgba(200,146,10,.7)" opacity=".6"/>
      <circle cx="2" cy="7" r=".9" fill="rgba(200,146,10,.7)" opacity=".6"/>
    </svg>
  );
}

/* ─── Priest Card (redesigned) ───────────────────────────────── */
function PriestCard({p,mode,onTap}:{p:Priest;mode:'invite'|'online';onTap:()=>void}){
  return (
    <button onClick={onTap} style={{
      width:'100%', background:'#FFFFFF',
      border:'1.5px solid rgba(200,146,10,.25)', borderRadius:18,
      padding:'14px 12px', marginBottom:12,
      display:'flex', alignItems:'center', gap:12,
      cursor:'pointer', textAlign:'left', position:'relative',
      boxShadow:'0 3px 16px rgba(10,22,40,.1)',
    }}>
      <Corner />
      <Corner flip />

      {/* Photo / Avatar */}
      <div style={{
        width:68, height:80, borderRadius:12, background:NAVY, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,.35)',
        border:'2px solid rgba(200,146,10,.4)',
      }}>
        {(p as any).photo
          ? <img src={(p as any).photo} alt={p.initials} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
          : <span style={{fontSize:22,fontWeight:900,color:'#fff',letterSpacing:-1}}>{p.initials}</span>}
      </div>

      {/* Info */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:16, fontWeight:800, color:NAVY, marginBottom:4, lineHeight:1.2,
          fontFamily:"'Playfair Display',Georgia,serif"}}>{p.name}</div>

        {/* Rating + Verified */}
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap'}}>
          <span style={{fontSize:13, fontWeight:800, color:NAVY}}>★ {p.rating}</span>
          {p.isVerified && (
            <span style={{
              background:NAVY, color:'#fff', fontSize:10.5, fontWeight:700,
              borderRadius:20, padding:'2px 8px', display:'flex', alignItems:'center', gap:3,
            }}>
              <span style={{fontSize:9}}>✓</span> Verified
            </span>
          )}
        </div>

        {/* Specialty pills */}
        <div style={{display:'flex', flexWrap:'wrap', gap:4, marginBottom:5}}>
          {p.specialty.slice(0,3).map(s=>(
            <span key={s} style={{
              background:NAVY, color:'#fff', fontSize:10, fontWeight:600,
              borderRadius:20, padding:'3px 9px',
              display:'inline-flex', alignItems:'center', gap:3,
            }}>
              <span>{SPEC_ICON[s]||'🙏'}</span>
              <span>{s}</span>
            </span>
          ))}
        </div>

        {/* Location */}
        <div style={{fontSize:11, color:'rgba(10,22,40,.55)', fontWeight:600, display:'flex', alignItems:'center', gap:3}}>
          {p.isOnline
            ? <><span>🌐</span><span>Global</span></>
            : <><span>📍</span><span>Local</span></>}
        </div>
      </div>

      {/* Price + Arrow */}
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:7, flexShrink:0}}>
        <div style={{textAlign:'center'}}>
          {mode==='invite' ? (
            <>
              <div style={{fontSize:10, color:'rgba(10,22,40,.5)', fontWeight:600}}>From</div>
              <div style={{fontSize:15, fontWeight:900, color:NAVY}}>{formatRupees(p.pricePerService)}</div>
            </>
          ) : (
            <>
              <div style={{fontSize:13, fontWeight:900, color:NAVY}}>{formatRupees(p.pricePerMin)}</div>
              <div style={{fontSize:10, color:'rgba(10,22,40,.5)', fontWeight:600}}>/min</div>
            </>
          )}
        </div>
        <div style={{
          width:34, height:34, borderRadius:'50%', background:NAVY,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 3px 10px rgba(0,0,0,.35)',
        }}>
          <span style={{color:'#fff', fontSize:18, lineHeight:1, marginLeft:1}}>›</span>
        </div>
      </div>
    </button>
  );
}

/* ─── Priest List View (redesigned) ─────────────────────────── */
function PriestListView({mode,religion,onSelect,onBack}:{mode:'invite'|'online';religion:string;onSelect:(p:Priest)=>void;onBack:()=>void}){
  const [query,setQuery]=useState('');
  const [apiPriests,setApiPriests]=useState<Priest[]>([]);
  const [loading,setLoading]=useState(true);

  // Map display key to API param
  const apiReligion = religion === 'muslim' ? 'islam' : religion;
  const serviceType = mode === 'online' ? 'online' : 'offline';

  useEffect(()=>{
    const token = tokenStore.access ?? '';
    setLoading(true);
    const url = religion === 'all'
      ? `${API_BASE}/priests?serviceType=${serviceType}&page=1&limit=20`
      : `${API_BASE}/priests?religion=${apiReligion}&serviceType=${serviceType}&page=1&limit=20`;
    fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
      .then(r=>r.json())
      .then(json=>{
        const raw: any[] = Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.providers) ? json.providers
          : Array.isArray(json) ? json : [];
        // Map API shape to Priest shape
        const mapped: Priest[] = raw.map((p: any): Priest => ({
          id: p.id ?? p._id ?? String(Math.random()),
          name: p.name ?? p.fullName ?? 'Unknown',
          religion: (p.religion === 'islam' ? 'muslim' : p.religion) ?? 'hindu',
          title: p.title ?? (p.religion === 'sikh' ? 'Granthi' : p.religion === 'islam' ? 'Imam' : p.religion === 'christian' ? 'Father' : 'Pandit'),
          initials: (p.name ?? p.fullName ?? 'UN').split(' ').map((w: string)=>w[0]).join('').slice(0,2).toUpperCase(),
          color: p.color ?? '#7B2D0A',
          specialty: p.specialties ?? p.specialty ?? [],
          languages: p.languages ?? [],
          experience: p.experienceYears ?? p.experience ?? 0,
          rating: Number(p.rating) || 4.5,
          reviewCount: Number(p.reviewCount) || 0,
          pricePerMin: p.pricePerMinutePaise ? Math.round(p.pricePerMinutePaise / 100) : (p.pricePerMin ?? 10),
          pricePerService: p.priceFrom ? Math.round(p.priceFrom / 100) : (p.pricePerService ?? 1500),
          isOnline: p.isOnline ?? false,
          isVerified: p.isVerified ?? p.verified ?? false,
          bio: p.bio ?? '',
          services: (p.services ?? []).map((s: any) => ({
            id: s.id ?? String(Math.random()),
            name: s.name ?? '',
            duration: s.duration ?? s.suggestedDurationMinutes ? `${s.suggestedDurationMinutes} min` : '—',
            price: s.price ?? (s.basePricePaise ? Math.round(s.basePricePaise / 100) : 1500),
          })),
        }));
        setApiPriests(mapped);
      })
      .catch(()=>setApiPriests([]))
      .finally(()=>setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[religion, mode]);

  const priests = apiPriests.filter(p=>{
    const modeMatch = mode==='online' ? p.isOnline : true;
    const q = query.toLowerCase();
    const qMatch = !q||p.name.toLowerCase().includes(q)||p.specialty.some((s: string)=>s.toLowerCase().includes(q));
    return modeMatch && qMatch;
  });

  /* Faith-aware banner image */
  const bannerImg = religion==='hindu' ? '/priests/hindu-invite.jpg'
    : religion==='muslim' ? '/priests/muslim-invite.jpg'
    : religion==='sikh' ? '/priests/sikh-invite.jpg'
    : religion==='christian' ? '/priests/christian-invite.jpg'
    : '/priests/hindu-invite.jpg';
  const bannerFb = 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400&q=70';

  return (
    <div style={{minHeight:'100dvh', background:'#FFFBF0', paddingBottom:80}}>

      {/* ── Header ── */}
      <div style={{
        background:NAVY, padding:'14px 16px',
        display:'flex', alignItems:'center', gap:12,
        position:'sticky', top:0, zIndex:100,
        borderBottom:'1px solid rgba(200,146,10,.2)',
      }}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:GOLD2,fontSize:26,lineHeight:1,padding:'0 4px 0 0'}}>←</button>
        <div style={{flex:1}}>
          <div style={{fontSize:20, fontWeight:900, color:'#fff', fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.2}}>
            {mode==='invite'?'Invite a Priest':'Ask a Priest'}
          </div>
          <div style={{fontSize:11.5, color:'rgba(245,230,192,.55)', marginTop:1}}>
            {mode==='invite'?'Book for ceremonies & events':'Connect online · Chat or Call'}
          </div>
        </div>
        {/* Available pill */}
        <div style={{
          background:NAVY, border:'1.5px solid rgba(200,146,10,.35)',
          borderRadius:24, padding:'6px 12px',
          display:'flex', alignItems:'center', gap:6,
        }}>
          <svg width="15" height="14" viewBox="0 0 16 14" fill="none"><circle cx="5" cy="4" r="3" fill={GOLD2}/><circle cx="11" cy="4" r="3" fill={GOLD2} opacity=".7"/><path d="M0 13c0-2.76 2.24-5 5-5s5 2.24 5 5" fill={GOLD2}/><path d="M8 13c0-2.76 1.34-5 3-5s3 2.24 3 5" fill={GOLD2} opacity=".7"/></svg>
          <span style={{fontSize:12, fontWeight:800, color:GOLD2}}>{loading ? '…' : priests.length} available</span>
        </div>
      </div>

      {/* ── Mode Banner ── */}
      <div style={{margin:'14px 14px 0', borderRadius:18, overflow:'hidden', position:'relative',
        background:'#FFFBF0', border:'1.5px solid rgba(200,146,10,.3)',
        boxShadow:'0 4px 20px rgba(0,0,0,.2)', height:130}}>
        {/* Bg image right side */}
        <img src={mode==='invite'?bannerImg:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=70'}
          onError={(e)=>{(e.target as HTMLImageElement).src=bannerFb}}
          alt="" style={{position:'absolute',right:0,top:0,width:'55%',height:'100%',objectFit:'cover'}} />
        {/* Gradient overlay */}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#FFFBF0 40%,rgba(255,251,240,.9) 56%,rgba(255,251,240,.08) 100%)'}} />
        {/* Content */}
        <div style={{position:'relative',zIndex:2,padding:'16px 16px',display:'flex',alignItems:'center',gap:14,height:'100%',boxSizing:'border-box'}}>
          {/* Icon circle */}
          <div style={{
            width:56, height:56, borderRadius:'50%', flexShrink:0,
            background:NAVY, border:'2.5px solid rgba(200,146,10,.6)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 0 4px rgba(200,146,10,.15)',
          }}>
            {mode==='invite' ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="17" rx="2.5" stroke={GOLD2} strokeWidth="1.7"/>
                <line x1="3" y1="9" x2="21" y2="9" stroke={GOLD2} strokeWidth="1.7"/>
                <line x1="8" y1="2" x2="8" y2="6" stroke={GOLD2} strokeWidth="1.7" strokeLinecap="round"/>
                <line x1="16" y1="2" x2="16" y2="6" stroke={GOLD2} strokeWidth="1.7" strokeLinecap="round"/>
                <rect x="6.5" y="12" width="2.8" height="2.8" rx=".6" fill={GOLD2}/>
                <rect x="10.6" y="12" width="2.8" height="2.8" rx=".6" fill={GOLD2}/>
                <rect x="14.7" y="12" width="2.8" height="2.8" rx=".6" fill={GOLD2}/>
                <rect x="6.5" y="16" width="2.8" height="2.8" rx=".6" fill={GOLD2}/>
                <rect x="10.6" y="16" width="2.8" height="2.8" rx=".6" fill={GOLD2}/>
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M20 2H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3l3 3 3-3h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" stroke={GOLD2} strokeWidth="1.7" strokeLinejoin="round"/>
                <line x1="7" y1="8" x2="17" y2="8" stroke={GOLD2} strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="12" x2="14" y2="12" stroke={GOLD2} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:16, fontWeight:900, color:NAVY, fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.25}}>
              {mode==='invite'?'Offline Service –':'Online Consultation –'}<br/>
              {mode==='invite'?'Home / Venue Visit':'Chat & Call'}
            </div>
            <div style={{fontSize:11.5, color:'rgba(10,22,40,.65)', marginTop:4, lineHeight:1.4, maxWidth:'52%'}}>
              {mode==='invite'?'Priest visits your home or venue on a selected date & time':'Real-time chat or voice call · Billed per minute'}
            </div>
          </div>
        </div>
        {/* Arrow button */}
        <div style={{position:'absolute', bottom:12, right:12, zIndex:3,
          width:34, height:34, borderRadius:'50%', background:NAVY,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 3px 10px rgba(0,0,0,.35)'}}>
          <span style={{color:'#fff', fontSize:18, marginLeft:1}}>›</span>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{padding:'12px 14px 10px'}}>
        <div style={{
          background:'#FFFFFF', borderRadius:50,
          display:'flex', alignItems:'center', gap:10,
          padding:'10px 16px', boxShadow:'0 2px 8px rgba(0,0,0,.12)',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
            <circle cx="11" cy="11" r="8" stroke={NAVY} strokeWidth="2.2"/>
            <path d="m21 21-4.35-4.35" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          <input value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search by name or specialty…"
            style={{flex:1, border:'none', outline:'none', fontSize:13, color:NAVY,
              background:'transparent', fontFamily:'inherit'}} />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
            <line x1="4" y1="6" x2="20" y2="6" stroke={NAVY} strokeWidth="2" strokeLinecap="round"/>
            <line x1="7" y1="12" x2="17" y2="12" stroke={NAVY} strokeWidth="2" strokeLinecap="round"/>
            <line x1="10" y1="18" x2="14" y2="18" stroke={NAVY} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* ── List ── */}
      <div style={{padding:'4px 14px 0'}}>
        {loading
          ? [1,2,3].map(i=>(
              <div key={i} style={{height:100,borderRadius:18,background:'#fff',border:'1.5px solid rgba(200,146,10,.2)',marginBottom:12,opacity:0.6}} />
            ))
          : priests.length===0
          ? <div style={{textAlign:'center',padding:'48px 0',color:'rgba(10,22,40,.55)',fontSize:14,fontWeight:600}}>
              No {mode==='online'?'online ':''} priests available in your area yet. Check back soon.
            </div>
          : priests.map(p=><PriestCard key={p.id} p={p} mode={mode} onTap={()=>onSelect(p)}/>)}
      </div>
    </div>
  );
}


/* ─── Priest Profile View ────────────────────────────────────── */
function PriestProfileView({p,mode,onBook,onConsult,onBack}:{p:Priest;mode:'invite'|'online';onBook:(s:OfflineService)=>void;onConsult:(type:'chat'|'call')=>void;onBack:()=>void}){
  const [tab,setTab]=useState<'about'|'services'>('about');
  const rClergy: Record<string,string> = {hindu:'Pandit',muslim:'Imam',sikh:'Granthi',christian:'Father'};
  return (
    <div style={{minHeight:'100dvh',background:'#F8F4EC',paddingBottom:100}}>
      {/* Header */}
      <div style={{background:NAVY,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,
        position:'sticky',top:0,zIndex:100}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:GOLD2,fontSize:24,lineHeight:1,padding:0}}>‹</button>
        <span style={{fontSize:17,fontWeight:900,color:GOLD,fontFamily:"'Playfair Display',Georgia,serif"}}>{p.title} Profile</span>
      </div>

      {/* Hero */}
      <div style={{background:NAVY,padding:'24px 20px 28px',textAlign:'center'}}>
        <Avatar p={p} size={80}/>
        <div style={{marginTop:12,fontSize:20,fontWeight:900,color:'#fff',fontFamily:"'Playfair Display',Georgia,serif"}}>{p.name}</div>
        <div style={{fontSize:13,color:'rgba(245,230,192,.65)',marginTop:3}}>{p.title} · {p.experience} yrs experience</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:8}}>
          <Stars n={p.rating}/>
          <span style={{fontSize:12,color:'rgba(245,230,192,.7)'}}>{p.rating} ({p.reviewCount.toLocaleString()} reviews)</span>
        </div>
        {p.isVerified&&<div style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:8,
          background:'rgba(34,197,94,.15)',border:'1px solid rgba(34,197,94,.35)',borderRadius:20,padding:'4px 12px'}}>
          <span style={{color:'#22C55E',fontSize:12,fontWeight:700}}>✓ Verified Priest</span>
        </div>}
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:12,flexWrap:'wrap'}}>
          {p.languages.map(l=><span key={l} style={{fontSize:11,background:'rgba(200,146,10,.18)',color:GOLD2,
            borderRadius:12,padding:'3px 10px',fontWeight:600}}>{l}</span>)}
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:1,background:'rgba(200,146,10,.15)',margin:'0',borderTop:'1px solid rgba(200,146,10,.2)'}}>
        {[
          {label:'Experience',value:`${p.experience} yrs`},
          mode==='invite'?{label:'Starting at',value:formatRupees(p.pricePerService)}:{label:'Per Minute',value:formatRupees(p.pricePerMin)},
          {label:'Reviews',value:p.reviewCount.toLocaleString()},
        ].map(s=>(
          <div key={s.label} style={{background:'#fff',padding:'14px 8px',textAlign:'center'}}>
            <div style={{fontSize:16,fontWeight:900,color:NAVY}}>{s.value}</div>
            <div style={{fontSize:10.5,color:'rgba(10,22,40,.45)',marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'#fff',borderBottom:'1px solid rgba(200,146,10,.2)'}}>
        {(['about','services'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'12px',border:'none',cursor:'pointer',
            background:tab===t?'rgba(200,146,10,.08)':'transparent',
            borderBottom:tab===t?`2.5px solid ${GOLD}`:'2.5px solid transparent',
            fontSize:13,fontWeight:700,color:tab===t?GOLD:'rgba(10,22,40,.5)',textTransform:'capitalize'}}>
            {t==='about'?'About':'Services'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{padding:'16px 16px'}}>
        {tab==='about'&&(
          <div>
            <div style={{fontSize:14,color:'rgba(10,22,40,.75)',lineHeight:1.65,marginBottom:16}}>{p.bio}</div>
            <div style={{fontSize:13,fontWeight:700,color:NAVY,marginBottom:8}}>Specialisations</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
              {p.specialty.map(s=><span key={s} style={{fontSize:12,background:'rgba(200,146,10,.1)',color:GOLD,
                border:'1px solid rgba(200,146,10,.3)',borderRadius:20,padding:'4px 12px',fontWeight:600}}>{s}</span>)}
            </div>
          </div>
        )}
        {tab==='services'&&(
          <div>
            {mode==='invite'
              ? p.services.map(s=>(
                  <div key={s.id} style={{background:'#fff',border:'1px solid rgba(200,146,10,.2)',borderRadius:14,
                    padding:'14px 14px',marginBottom:10,display:'flex',alignItems:'center',gap:12,
                    boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:3}}>{s.name}</div>
                      <div style={{fontSize:12,color:'rgba(10,22,40,.5)'}}>⏱ {s.duration}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:15,fontWeight:900,color:GOLD,marginBottom:6}}>{formatRupees(s.price)}</div>
                      <button onClick={()=>onBook(s)} style={{background:`linear-gradient(90deg,${GOLD},${GOLD2})`,
                        color:NAVY,fontSize:11,fontWeight:800,padding:'6px 14px',borderRadius:12,border:'none',cursor:'pointer'}}>
                        Book →
                      </button>
                    </div>
                  </div>
                ))
              : (
                <div>
                  <div style={{background:'rgba(200,146,10,.06)',border:'1px solid rgba(200,146,10,.2)',borderRadius:14,
                    padding:'16px',marginBottom:16,textAlign:'center'}}>
                    <div style={{fontSize:22,fontWeight:900,color:GOLD,marginBottom:4}}>{formatPerMinute(p.pricePerMin * 100)}</div>
                    <div style={{fontSize:12,color:'rgba(10,22,40,.5)'}}>Billed per minute · Pay only for time used</div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <button onClick={()=>onConsult('chat')} style={{background:`linear-gradient(135deg,${NAVY},#162B56)`,
                      border:`1.5px solid rgba(200,146,10,.4)`,borderRadius:14,padding:'16px 12px',cursor:'pointer',
                      display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                      <span style={{fontSize:28}}>💬</span>
                      <span style={{fontSize:14,fontWeight:800,color:GOLD}}>Chat</span>
                      <span style={{fontSize:11,color:'rgba(245,230,192,.55)'}}>Text consultation</span>
                    </button>
                    <button onClick={()=>onConsult('call')} style={{background:`linear-gradient(135deg,#06200E,#0F3D1E)`,
                      border:`1.5px solid rgba(34,197,94,.3)`,borderRadius:14,padding:'16px 12px',cursor:'pointer',
                      display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                      <span style={{fontSize:28}}>📞</span>
                      <span style={{fontSize:14,fontWeight:800,color:'#4ADE80'}}>Voice Call</span>
                      <span style={{fontSize:11,color:'rgba(245,230,192,.55)'}}>Live voice session</span>
                    </button>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* CTA sticky bottom */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid rgba(200,146,10,.2)',
        padding:'12px 16px',display:'flex',gap:10,boxShadow:'0 -4px 16px rgba(0,0,0,.1)'}}>
        {mode==='invite'
          ? <button onClick={()=>setTab('services')} style={{flex:1,background:`linear-gradient(90deg,${GOLD},${GOLD2})`,
              color:NAVY,fontSize:14,fontWeight:900,padding:'13px',borderRadius:14,border:'none',cursor:'pointer'}}>
              View Services & Book
            </button>
          : <>
              <button onClick={()=>onConsult('chat')} style={{flex:1,background:`linear-gradient(90deg,${NAVY},#162B56)`,
                color:GOLD,fontSize:13,fontWeight:800,padding:'13px',borderRadius:14,border:`1px solid rgba(200,146,10,.3)`,cursor:'pointer'}}>
                💬 Chat · {formatPerMinute(p.pricePerMin * 100)}
              </button>
              <button onClick={()=>onConsult('call')} style={{flex:1,background:'linear-gradient(90deg,#06200E,#0F3D1E)',
                color:'#4ADE80',fontSize:13,fontWeight:800,padding:'13px',borderRadius:14,border:'1px solid rgba(34,197,94,.3)',cursor:'pointer'}}>
                📞 Call · {formatPerMinute(p.pricePerMin * 100)}
              </button>
            </>}
      </div>
    </div>
  );
}

/* ─── Booking Flow ───────────────────────────────────────────── */
function BookingFlow({p,service,onConfirm,onBack}:{p:Priest;service:OfflineService;onConfirm:()=>void;onBack:()=>void}){
  const [step,setStep]=useState(1);
  const [selDate,setSelDate]=useState('');
  const [selTime,setSelTime]=useState('');
  const [address,setAddress]=useState('');
  const [note,setNote]=useState('');
  const total = service.price + 99; // convenience fee

  return (
    <div style={{minHeight:'100dvh',background:'#F8F4EC',paddingBottom:90}}>
      {/* Header */}
      <div style={{background:NAVY,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,
        position:'sticky',top:0,zIndex:100}}>
        <button onClick={step===1?onBack:()=>setStep((s: any)=>s-1)} style={{background:'none',border:'none',cursor:'pointer',color:GOLD2,fontSize:24,lineHeight:1,padding:0}}>‹</button>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:900,color:GOLD}}>Book Service</div>
          <div style={{fontSize:11,color:'rgba(245,230,192,.55)'}}>Step {step} of 3</div>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[1,2,3].map(i=><div key={i} style={{width:22,height:4,borderRadius:2,
            background:i<=step?GOLD:'rgba(255,255,255,.2)'}}/>)}
        </div>
      </div>

      {/* Service summary bar */}
      <div style={{background:'#fff',borderBottom:'1px solid rgba(200,146,10,.15)',padding:'12px 16px',
        display:'flex',alignItems:'center',gap:10}}>
        <Avatar p={p} size={38}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:NAVY}}>{p.name}</div>
          <div style={{fontSize:12,color:'rgba(10,22,40,.5)'}}>{service.name} · {service.duration}</div>
        </div>
        <div style={{fontSize:15,fontWeight:900,color:GOLD}}>{formatRupees(service.price)}</div>
      </div>

      <div style={{padding:'16px 16px'}}>
        {/* Step 1: Date & Time */}
        {step===1&&(
          <div>
            <div style={{fontSize:16,fontWeight:800,color:NAVY,marginBottom:14}}>Select Date</div>
            <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:8,marginBottom:20}}>
              {DATES.map(d=>(
                <button key={d.value} onClick={()=>setSelDate(d.value)} style={{
                  flexShrink:0,background:selDate===d.value?GOLD:'#fff',
                  color:selDate===d.value?NAVY:NAVY,border:`1.5px solid ${selDate===d.value?GOLD:'rgba(200,146,10,.2)'}`,
                  borderRadius:12,padding:'10px 14px',cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap',
                }}>{d.label}</button>
              ))}
            </div>
            <div style={{fontSize:16,fontWeight:800,color:NAVY,marginBottom:14}}>Select Time Slot</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {TIME_SLOTS.map(t=>(
                <button key={t} onClick={()=>setSelTime(t)} style={{
                  background:selTime===t?GOLD:'#fff',color:selTime===t?NAVY:NAVY,
                  border:`1.5px solid ${selTime===t?GOLD:'rgba(200,146,10,.2)'}`,
                  borderRadius:10,padding:'10px 6px',cursor:'pointer',fontSize:12,fontWeight:600,
                }}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Address */}
        {step===2&&(
          <div>
            <div style={{fontSize:16,fontWeight:800,color:NAVY,marginBottom:14}}>Service Location</div>
            <textarea value={address} onChange={e=>setAddress(e.target.value)}
              placeholder="Enter your complete address (house no., street, locality, city)…"
              style={{width:'100%',border:'1.5px solid rgba(200,146,10,.3)',borderRadius:12,
                padding:'12px 14px',fontSize:13,color:NAVY,outline:'none',
                minHeight:100,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
            <div style={{marginTop:14}}>
              <div style={{fontSize:14,fontWeight:700,color:NAVY,marginBottom:8}}>Special Instructions (optional)</div>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Any specific instructions for the priest…"
                style={{width:'100%',border:'1.5px solid rgba(200,146,10,.2)',borderRadius:12,
                  padding:'12px 14px',fontSize:13,color:NAVY,outline:'none',
                  minHeight:70,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>
          </div>
        )}

        {/* Step 3: Review & Pay */}
        {step===3&&(
          <div>
            <div style={{fontSize:16,fontWeight:800,color:NAVY,marginBottom:14}}>Review & Confirm</div>
            {[
              {label:'Service',value:service.name},
              {label:'Priest',value:p.name},
              {label:'Date',value:DATES.find(d=>d.value===selDate)?.label||selDate},
              {label:'Time',value:selTime},
              {label:'Duration',value:service.duration},
              {label:'Address',value:address},
            ].map(row=>(
              <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
                padding:'10px 0',borderBottom:'1px solid rgba(200,146,10,.1)'}}>
                <span style={{fontSize:12,color:'rgba(10,22,40,.5)',fontWeight:600,minWidth:80}}>{row.label}</span>
                <span style={{fontSize:13,color:NAVY,fontWeight:600,textAlign:'right',flex:1,paddingLeft:12}}>{row.value}</span>
              </div>
            ))}
            <div style={{background:'rgba(200,146,10,.06)',border:'1px solid rgba(200,146,10,.2)',borderRadius:14,
              padding:'14px',marginTop:16}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,color:'rgba(10,22,40,.6)'}}>Service fee</span>
                <span style={{fontSize:13,color:NAVY,fontWeight:600}}>{formatRupees(service.price)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:13,color:'rgba(10,22,40,.6)'}}>Platform fee</span>
                <span style={{fontSize:13,color:NAVY,fontWeight:600}}>{formatRupees(99)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(200,146,10,.2)',paddingTop:10}}>
                <span style={{fontSize:15,fontWeight:800,color:NAVY}}>Total</span>
                <span style={{fontSize:15,fontWeight:900,color:GOLD}}>{formatRupees(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid rgba(200,146,10,.15)',
        padding:'12px 16px',boxShadow:'0 -4px 16px rgba(0,0,0,.08)'}}>
        {step<3
          ? <button onClick={()=>setStep((s: any)=>s+1)}
              disabled={step===1?(!selDate||!selTime):step===2?!address.trim():false}
              style={{width:'100%',background:(!selDate||!selTime)&&step===1?'rgba(200,146,10,.3)':`linear-gradient(90deg,${GOLD},${GOLD2})`,
                color:NAVY,fontSize:14,fontWeight:900,padding:'14px',borderRadius:14,border:'none',cursor:'pointer'}}>
              Continue →
            </button>
          : <button onClick={onConfirm} style={{width:'100%',background:`linear-gradient(90deg,${GOLD},${GOLD2})`,
              color:NAVY,fontSize:14,fontWeight:900,padding:'14px',borderRadius:14,border:'none',cursor:'pointer'}}>
              Confirm & Pay {formatRupees(total)} →
            </button>}
      </div>
    </div>
  );
}

/* ─── Booking Confirmation ───────────────────────────────────── */
function BookingConfirm({p,service,onDone}:{p:Priest;service:OfflineService;onDone:()=>void}){
  return (
    <div style={{minHeight:'100dvh',background:'#F8F4EC',display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',padding:'32px 24px',textAlign:'center'}}>
      <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(34,197,94,.15)',
        border:'2px solid rgba(34,197,94,.4)',display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:36,marginBottom:20}}>✓</div>
      <div style={{fontSize:22,fontWeight:900,color:NAVY,fontFamily:"'Playfair Display',Georgia,serif",marginBottom:8}}>Booking Confirmed!</div>
      <div style={{fontSize:14,color:'rgba(10,22,40,.55)',lineHeight:1.6,marginBottom:24}}>
        {p.name} has been booked for {service.name}.<br/>You'll receive a confirmation shortly.
      </div>
      <div style={{background:'#fff',border:'1.5px solid rgba(200,146,10,.25)',borderRadius:16,
        padding:'16px 20px',marginBottom:28,width:'100%',maxWidth:320}}>
        <div style={{fontSize:13,color:'rgba(10,22,40,.5)',marginBottom:4}}>Booking ID</div>
        <div style={{fontSize:16,fontWeight:800,color:NAVY}}>RG{Math.random().toString(36).substr(2,8).toUpperCase()}</div>
      </div>
      <button onClick={onDone} style={{background:`linear-gradient(90deg,${GOLD},${GOLD2})`,color:NAVY,
        fontSize:14,fontWeight:900,padding:'13px 32px',borderRadius:14,border:'none',cursor:'pointer'}}>
        Done
      </button>
    </div>
  );
}

/* ─── Online Consult View ────────────────────────────────────── */
function OnlineConsultView({p,type,onEnd}:{p:Priest;type:'chat'|'call';onEnd:()=>void}){
  const [phase,setPhase]=useState<'connecting'|'active'|'ended'>('connecting');
  const [secs,setSecs]=useState(0);
  const [msgs,setMsgs]=useState<{from:'user'|'priest';text:string}[]>([]);
  const [input,setInput]=useState('');
  const timerRef=useRef<NodeJS.Timeout|null>(null);
  const endRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const t=setTimeout(()=>{
      setPhase('active');
      setMsgs([{from:'priest',text:`Sat Sri Akal / Namaste / As-salamu alaykum. I am ${p.name}. How can I help you today?`}]);
    },2500);
    return ()=>clearTimeout(t);
  },[p.name]);

  useEffect(()=>{
    if(phase==='active'){
      timerRef.current=setInterval(()=>setSecs((s: any)=>s+1),1000);
    }
    return ()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[phase]);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);

  const cost = Math.floor(secs/60)*p.pricePerMin + (secs%60>0?p.pricePerMin:0);
  const fmt = `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;

  const sendMsg = ()=>{
    if(!input.trim()) return;
    setMsgs((m: any)=>[...m,{from:'user',text:input}]);
    const q=input; setInput('');
    setTimeout(()=>{
      setMsgs((m: any)=>[...m,{from:'priest',text:`Thank you for your question. Based on my knowledge and experience, I would advise you to ${['perform a Shanti puja for peace','recite the relevant prayers daily','consult the Guru Granth Sahib for guidance','read scripture and pray'][['hindu','muslim','sikh','christian'].indexOf(p.religion)]}. Feel free to ask more.`}]);
    },1500);
  };

  const handleEnd = ()=>{
    if(timerRef.current)clearInterval(timerRef.current);
    setPhase('ended');
  };

  if(phase==='connecting') return (
    <div style={{minHeight:'100dvh',background:NAVY,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',gap:20,padding:24}}>
      <Avatar p={p} size={80}/>
      <div style={{fontSize:18,fontWeight:800,color:'#fff'}}>{p.name}</div>
      <div style={{fontSize:13,color:'rgba(245,230,192,.55)'}}>Connecting {type==='call'?'voice call':'chat'}…</div>
      <div style={{display:'flex',gap:6,marginTop:8}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:GOLD,
          animation:`pulse 1s ${i*0.33}s infinite`}}/>)}
      </div>
      <button onClick={onEnd} style={{marginTop:24,background:'rgba(239,68,68,.2)',color:'#F87171',
        border:'1px solid rgba(239,68,68,.3)',borderRadius:20,padding:'10px 28px',cursor:'pointer',fontSize:13,fontWeight:700}}>
        Cancel
      </button>
    </div>
  );

  if(phase==='ended') return (
    <div style={{minHeight:'100dvh',background:'#F8F4EC',display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',padding:24,textAlign:'center'}}>
      <div style={{fontSize:36,marginBottom:16}}>🙏</div>
      <div style={{fontSize:20,fontWeight:900,color:NAVY,fontFamily:"'Playfair Display',Georgia,serif",marginBottom:8}}>Session Ended</div>
      <div style={{background:'#fff',border:'1.5px solid rgba(200,146,10,.25)',borderRadius:16,padding:'20px',
        marginBottom:20,width:'100%',maxWidth:300}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontSize:13,color:'rgba(10,22,40,.5)'}}>Duration</span>
          <span style={{fontSize:13,fontWeight:700,color:NAVY}}>{fmt}</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontSize:13,color:'rgba(10,22,40,.5)'}}>Rate</span>
          <span style={{fontSize:13,fontWeight:700,color:NAVY}}>{formatPerMinute(p.pricePerMin * 100)}</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(200,146,10,.15)',paddingTop:10}}>
          <span style={{fontSize:15,fontWeight:800,color:NAVY}}>Amount charged</span>
          <span style={{fontSize:15,fontWeight:900,color:GOLD}}>{formatRupees(Math.max(cost,p.pricePerMin))}</span>
        </div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:20}}>
        {[1,2,3,4,5].map(i=><button key={i} style={{fontSize:28,background:'none',border:'none',cursor:'pointer'}} onClick={()=>{}}>⭐</button>)}
      </div>
      <button onClick={onEnd} style={{background:`linear-gradient(90deg,${GOLD},${GOLD2})`,color:NAVY,
        fontSize:14,fontWeight:900,padding:'13px 32px',borderRadius:14,border:'none',cursor:'pointer'}}>Done</button>
    </div>
  );

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#F8F4EC'}}>
      {/* Call header */}
      <div style={{background:NAVY,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
        <Avatar p={p} size={38}/>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>{p.name}</div>
          <div style={{fontSize:11,color:'rgba(245,230,192,.55)'}}>{type==='call'?'🔴 Live Voice Call':'💬 Live Chat'} · {fmt}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:13,fontWeight:800,color:GOLD}}>{formatRupees(cost)}</div>
          <div style={{fontSize:10,color:'rgba(245,230,192,.4)'}}>charged</div>
        </div>
        <button onClick={handleEnd} style={{background:'rgba(239,68,68,.2)',color:'#F87171',border:'1px solid rgba(239,68,68,.3)',
          borderRadius:20,padding:'6px 12px',cursor:'pointer',fontSize:11,fontWeight:700,flexShrink:0}}>End</button>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',padding:'16px 14px',display:'flex',flexDirection:'column',gap:10}}>
        {msgs.map((m: any,i: any)=>(
          <div key={i} style={{display:'flex',justifyContent:m.from==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'78%',background:m.from==='user'?`linear-gradient(135deg,${GOLD},${GOLD2})`:'#fff',
              color:m.from==='user'?NAVY:'rgba(10,22,40,.8)',borderRadius:m.from==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
              padding:'10px 13px',fontSize:13,lineHeight:1.5,
              boxShadow:'0 1px 4px rgba(0,0,0,.08)'}}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{background:'#fff',borderTop:'1px solid rgba(200,146,10,.15)',padding:'10px 14px',
        display:'flex',gap:8,alignItems:'center'}}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&sendMsg()}
          placeholder="Type your question…"
          style={{flex:1,border:'1.5px solid rgba(200,146,10,.25)',borderRadius:20,padding:'10px 14px',
            fontSize:13,outline:'none',color:NAVY}}/>
        <button onClick={sendMsg} style={{background:`linear-gradient(90deg,${GOLD},${GOLD2})`,color:NAVY,
          border:'none',borderRadius:'50%',width:40,height:40,cursor:'pointer',fontSize:18,
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>↑</button>
      </div>
    </div>
  );
}

/* ─── Main PriestJourneyScreen ───────────────────────────────── */
interface Props { mode:'invite'|'online'; religion:string; onBack:()=>void; }

export default function PriestJourneyScreen({ mode, religion, onBack }: Props) {
  const [view,setView]=useState<JourneyView>('list');
  const [priest,setPriest]=useState<Priest|null>(null);
  const [service,setService]=useState<OfflineService|null>(null);
  const [consultType,setConsultType]=useState<'chat'|'call'>('chat');

  const handleSelectPriest=(p:Priest)=>{ setPriest(p); setView('profile'); };
  const handleBook=(s:OfflineService)=>{ setService(s); setView('booking'); };
  const handleConsult=(t:'chat'|'call')=>{ setConsultType(t); setView('consult'); };

  if(view==='list')  return <PriestListView mode={mode} religion={religion} onSelect={handleSelectPriest} onBack={onBack}/>;
  if(view==='profile'&&priest) return <PriestProfileView p={priest} mode={mode} onBook={handleBook} onConsult={handleConsult} onBack={()=>setView('list')}/>;
  if(view==='booking'&&priest&&service) return <BookingFlow p={priest} service={service} onConfirm={()=>setView('booking-confirm')} onBack={()=>setView('profile')}/>;
  if(view==='booking-confirm'&&priest&&service) return <BookingConfirm p={priest} service={service} onDone={onBack}/>;
  if(view==='consult'&&priest) return <OnlineConsultView p={priest} type={consultType} onEnd={onBack}/>;
  return null;
}
