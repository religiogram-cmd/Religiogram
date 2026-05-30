'use client';
import { useState } from 'react';

const GOLD = '#C8920A'; const GOLD2 = '#E8B430'; const NAVY = '#0A1628'; const BG = '#F5E6C0';

type RegStep = 1|2|3|4|5;

interface RegData {
  // Step 1 — Personal Info
  fullName: string; title: string; religion: string; experience: string;
  languages: string; city: string; phone: string; email: string;
  // Step 2 — Services & Pricing
  serviceType: string; // 'offline'|'online'|'both'
  services: string; pricePerMin: string; pricePerService: string;
  // Step 3 — Bio & Credentials
  bio: string; qualification: string; institution: string;
  // Step 4 — Availability
  days: string[]; timeFrom: string; timeTo: string;
  // Step 5 — Documents (filenames only in mock)
  aadhar: string; certificate: string; photo: string;
}

const FAITHS = [
  { key:'hindu',    label:'Hindu',    clergy:['Pandit','Pujari','Acharya','Jyotishi'] },
  { key:'muslim',   label:'Muslim',   clergy:['Imam','Maulana','Mufti','Qari'] },
  { key:'sikh',     label:'Sikh',     clergy:['Granthi','Bhai','Raghi'] },
  { key:'christian',label:'Christian',clergy:['Father','Reverend','Pastor','Deacon'] },
];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TIMES = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
               '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM'];

const EMPTY: RegData = {
  fullName:'', title:'', religion:'', experience:'',
  languages:'', city:'', phone:'', email:'',
  serviceType:'both', services:'', pricePerMin:'', pricePerService:'',
  bio:'', qualification:'', institution:'',
  days:[], timeFrom:'9:00 AM', timeTo:'6:00 PM',
  aadhar:'', certificate:'', photo:'',
};

/* ── helpers ── */
function Field({ label, value, onChange, placeholder, multiline, type }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; multiline?:boolean; type?:string }) {
  const base: React.CSSProperties = {
    width:'100%', border:'1.5px solid rgba(200,146,10,.3)', borderRadius:12,
    padding:'11px 14px', fontSize:13, color:NAVY, outline:'none', boxSizing:'border-box',
    fontFamily:'inherit', background:'#fff',
  };
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, fontWeight:700, color:NAVY, display:'block', marginBottom:5 }}>{label}</label>
      {multiline
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
            style={{ ...base, resize:'vertical' }} />
        : <input type={type||'text'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={base} />}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, fontWeight:700, color:NAVY, display:'block', marginBottom:5 }}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{
        width:'100%', border:'1.5px solid rgba(200,146,10,.3)', borderRadius:12,
        padding:'11px 14px', fontSize:13, color:NAVY, outline:'none', background:'#fff',
        appearance:'none', fontFamily:'inherit',
      }}>
        <option value="">— Select —</option>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/* ── Step Progress ── */
function StepBar({ step }: { step:RegStep }) {
  const labels = ['Personal','Services','Bio','Schedule','Documents'];
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'12px 14px', gap:0 }}>
      {labels.map((l,i)=>{
        const n=(i+1) as RegStep;
        const done=step>n; const active=step===n;
        return (
          <div key={l} style={{ display:'flex', alignItems:'center', flex:i<labels.length-1?1:'none' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 }}>
              <div style={{
                width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                background:done?GOLD:active?NAVY:'rgba(10,22,40,.12)',
                border:active?`2px solid ${GOLD}`:'2px solid transparent',
                fontSize:11, fontWeight:800,
                color:done?NAVY:active?GOLD:'rgba(10,22,40,.35)',
              }}>
                {done?'✓':n}
              </div>
              <span style={{ fontSize:9, fontWeight:600, color:active?GOLD:done?GOLD:'rgba(10,22,40,.35)', whiteSpace:'nowrap' }}>{l}</span>
            </div>
            {i<labels.length-1&&<div style={{ flex:1, height:2, background:done?GOLD:'rgba(10,22,40,.12)', margin:'0 4px', marginBottom:14 }}/>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Personal Info ── */
function Step1({ d, set }: { d:RegData; set:(k:keyof RegData,v:any)=>void }) {
  const faith = FAITHS.find(f=>f.key===d.religion);
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:NAVY, marginBottom:16 }}>Personal Information</div>
      <Select label="Your Faith / Religion" value={d.religion} onChange={v=>{ set('religion',v); set('title',''); }}
        options={FAITHS.map(f=>({value:f.key,label:f.label}))} />
      {faith && (
        <Select label="Title / Designation" value={d.title} onChange={v=>set('title',v)}
          options={faith.clergy.map(c=>({value:c,label:c}))} />
      )}
      <Field label="Full Name" value={d.fullName} onChange={v=>set('fullName',v)} placeholder="e.g. Pandit Rajesh Sharma" />
      <Field label="Years of Experience" value={d.experience} onChange={v=>set('experience',v)} placeholder="e.g. 15" type="number" />
      <Field label="Languages Spoken" value={d.languages} onChange={v=>set('languages',v)} placeholder="e.g. Hindi, Sanskrit, English" />
      <Field label="City / Location" value={d.city} onChange={v=>set('city',v)} placeholder="e.g. New Delhi" />
      <Field label="Phone Number" value={d.phone} onChange={v=>set('phone',v)} placeholder="+91 XXXXX XXXXX" type="tel" />
      <Field label="Email Address" value={d.email} onChange={v=>set('email',v)} placeholder="you@example.com" type="email" />
    </div>
  );
}

/* ── Step 2: Services & Pricing ── */
function Step2({ d, set }: { d:RegData; set:(k:keyof RegData,v:any)=>void }) {
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:NAVY, marginBottom:16 }}>Services & Pricing</div>

      {/* Service type selection */}
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, fontWeight:700, color:NAVY, display:'block', marginBottom:8 }}>Service Type</label>
        <div style={{ display:'flex', gap:8 }}>
          {[{v:'offline',l:'Offline Only'},{v:'online',l:'Online Only'},{v:'both',l:'Both'}].map(opt=>(
            <button key={opt.v} onClick={()=>set('serviceType',opt.v)} style={{
              flex:1, padding:'10px 6px', borderRadius:12, border:`1.5px solid ${d.serviceType===opt.v?GOLD:'rgba(200,146,10,.2)'}`,
              background:d.serviceType===opt.v?`rgba(200,146,10,.1)`:'#fff',
              color:d.serviceType===opt.v?GOLD:NAVY, fontSize:12, fontWeight:700, cursor:'pointer',
            }}>{opt.l}</button>
          ))}
        </div>
      </div>

      <Field label="Services Offered" value={d.services} onChange={v=>set('services',v)}
        placeholder="e.g. Satyanarayan Puja, Griha Pravesh, Wedding Ceremonies…" multiline />

      {(d.serviceType==='offline'||d.serviceType==='both') && (
        <Field label="Starting Price per Service (₹)" value={d.pricePerService} onChange={v=>set('pricePerService',v)}
          placeholder="e.g. 1500" type="number" />
      )}
      {(d.serviceType==='online'||d.serviceType==='both') && (
        <Field label="Price per Minute — Online Chat/Call (₹)" value={d.pricePerMin} onChange={v=>set('pricePerMin',v)}
          placeholder="e.g. 12" type="number" />
      )}

      <div style={{ background:'rgba(200,146,10,.07)', border:'1px solid rgba(200,146,10,.2)', borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:GOLD, marginBottom:4 }}>ℹ️ How pricing works</div>
        <div style={{ fontSize:11.5, color:'rgba(10,22,40,.6)', lineHeight:1.6 }}>
          ReligioGram charges a 15% platform fee on bookings. You receive 85% of the service amount directly to your bank account after service completion.
        </div>
      </div>
    </div>
  );
}

/* ── Step 3: Bio & Credentials ── */
function Step3({ d, set }: { d:RegData; set:(k:keyof RegData,v:any)=>void }) {
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:NAVY, marginBottom:16 }}>Bio & Credentials</div>
      <Field label="Professional Bio" value={d.bio} onChange={v=>set('bio',v)}
        placeholder="Describe your background, training and what makes you special…" multiline />
      <Field label="Highest Religious Qualification" value={d.qualification} onChange={v=>set('qualification',v)}
        placeholder="e.g. Shastri, Acharya, Hafiz-e-Quran…" />
      <Field label="Institution / Seminary / Gurudwara / Church" value={d.institution} onChange={v=>set('institution',v)}
        placeholder="e.g. Kashi Vidyapeeth, Darul Uloom…" />

      <div style={{ background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#15803D', marginBottom:4 }}>✓ Verification Badge</div>
        <div style={{ fontSize:11.5, color:'rgba(10,22,40,.6)', lineHeight:1.6 }}>
          Once your documents are verified (Step 5), you will receive a <strong>Verified Priest</strong> badge visible to all users, boosting your profile visibility and trust.
        </div>
      </div>
    </div>
  );
}

/* ── Step 4: Availability ── */
function Step4({ d, set }: { d:RegData; set:(k:keyof RegData,v:any)=>void }) {
  const toggleDay = (day:string) => {
    const cur = d.days;
    set('days', cur.includes(day) ? cur.filter(x=>x!==day) : [...cur,day]);
  };
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:NAVY, marginBottom:16 }}>Availability</div>

      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, fontWeight:700, color:NAVY, display:'block', marginBottom:8 }}>Available Days</label>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {DAYS.map(day=>(
            <button key={day} onClick={()=>toggleDay(day)} style={{
              padding:'8px 12px', borderRadius:10, border:`1.5px solid ${d.days.includes(day)?GOLD:'rgba(200,146,10,.2)'}`,
              background:d.days.includes(day)?`rgba(200,146,10,.12)`:'#fff',
              color:d.days.includes(day)?GOLD:NAVY, fontSize:12, fontWeight:700, cursor:'pointer',
            }}>{day}</button>
          ))}
        </div>
      </div>

      <Select label="Available From" value={d.timeFrom} onChange={v=>set('timeFrom',v)}
        options={TIMES.map(t=>({value:t,label:t}))} />
      <Select label="Available Until" value={d.timeTo} onChange={v=>set('timeTo',v)}
        options={TIMES.map(t=>({value:t,label:t}))} />

      <div style={{ background:'rgba(200,146,10,.07)', border:'1px solid rgba(200,146,10,.2)', borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:11.5, color:'rgba(10,22,40,.6)', lineHeight:1.6 }}>
          You can update your availability at any time from the <strong>Provider Dashboard</strong>. Keeping your calendar up-to-date avoids cancellations.
        </div>
      </div>
    </div>
  );
}

/* ── Step 5: Documents ── */
function Step5({ d, set }: { d:RegData; set:(k:keyof RegData,v:any)=>void }) {
  function MockUpload({ label, fieldKey, hint }: { label:string; fieldKey:keyof RegData; hint:string }) {
    const val = d[fieldKey] as string;
    return (
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:12, fontWeight:700, color:NAVY, display:'block', marginBottom:5 }}>{label}</label>
        <div style={{ border:`1.5px dashed rgba(200,146,10,${val?'.5':'.25'})`, borderRadius:12,
          padding:'16px', background:val?'rgba(200,146,10,.06)':'#fafaf8',
          display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
          onClick={()=>set(fieldKey, val ? '' : `${fieldKey}_sample.jpg`)}>
          <div style={{ width:40, height:40, borderRadius:10, background:val?`rgba(200,146,10,.15)`:'rgba(200,146,10,.08)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
            {val ? '✓' : '📎'}
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:val?GOLD:NAVY }}>{val ? 'Uploaded ✓' : 'Tap to Upload'}</div>
            <div style={{ fontSize:11, color:'rgba(10,22,40,.45)', marginTop:2 }}>{hint}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:NAVY, marginBottom:16 }}>Upload Documents</div>
      <MockUpload label="Aadhaar Card / Govt. ID" fieldKey="aadhar" hint="JPG, PNG or PDF · Max 5 MB" />
      <MockUpload label="Religious Qualification Certificate" fieldKey="certificate" hint="Degree, certificate or letter from institution" />
      <MockUpload label="Profile Photo" fieldKey="photo" hint="Clear face photo · JPG or PNG · Max 2 MB" />
      <div style={{ background:'rgba(200,146,10,.07)', border:'1px solid rgba(200,146,10,.2)', borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:GOLD, marginBottom:4 }}>🔒 Your data is safe</div>
        <div style={{ fontSize:11.5, color:'rgba(10,22,40,.6)', lineHeight:1.6 }}>
          Documents are used only for identity verification. They are encrypted and never shared with third parties or users.
        </div>
      </div>
    </div>
  );
}

/* ── Success Screen ── */
function SuccessScreen({ onDone }: { onDone:()=>void }) {
  return (
    <div style={{ minHeight:'100dvh', background:'#F8F4EC', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
      <div style={{ width:90, height:90, borderRadius:'50%', background:'rgba(200,146,10,.12)',
        border:`2px solid rgba(200,146,10,.4)`, display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:42, marginBottom:20 }}>🙏</div>
      <div style={{ fontSize:24, fontWeight:900, color:NAVY, fontFamily:"'Playfair Display',Georgia,serif", marginBottom:8 }}>
        Application Submitted!
      </div>
      <div style={{ fontSize:14, color:'rgba(10,22,40,.55)', lineHeight:1.65, marginBottom:28, maxWidth:300 }}>
        Thank you for registering on ReligioGram. Our team will review your profile and documents within <strong>2–3 working days</strong>. You'll be notified via SMS and email.
      </div>
      <div style={{ background:'#fff', border:`1.5px solid rgba(200,146,10,.25)`, borderRadius:16,
        padding:'16px 20px', marginBottom:28, width:'100%', maxWidth:320 }}>
        <div style={{ fontSize:12, color:'rgba(10,22,40,.45)', marginBottom:4 }}>Application ID</div>
        <div style={{ fontSize:18, fontWeight:900, color:NAVY, letterSpacing:1 }}>
          RG-P-{Math.random().toString(36).substr(2,8).toUpperCase()}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', maxWidth:320 }}>
        <button onClick={onDone} style={{
          background:`linear-gradient(90deg,${GOLD},${GOLD2})`, color:NAVY,
          fontSize:14, fontWeight:900, padding:'13px', borderRadius:14, border:'none', cursor:'pointer',
        }}>Back to Home</button>
      </div>
    </div>
  );
}

/* ── Main Component ── */
interface Props { onBack: ()=>void; }
export default function PriestRegistrationScreen({ onBack }: Props) {
  const [step, setStep] = useState<RegStep>(1);
  const [done, setDone] = useState(false);
  const [data, setData] = useState<RegData>({ ...EMPTY });

  const set = (k: keyof RegData, v: any) => setData((d: any)=>({ ...d, [k]:v }));

  const canNext: Record<RegStep, boolean> = {
    1: !!(data.religion && data.title && data.fullName && data.phone),
    2: !!(data.services && data.serviceType),
    3: !!(data.bio.trim().length > 20),
    4: data.days.length > 0,
    5: true,
  };

  if (done) return <SuccessScreen onDone={onBack} />;

  return (
    <div style={{ minHeight:'100dvh', background:'#F8F4EC', paddingBottom:90 }}>
      {/* Header */}
      <div style={{ background:NAVY, padding:'14px 16px', display:'flex', alignItems:'center', gap:12,
        position:'sticky', top:0, zIndex:100, borderBottom:'1px solid rgba(200,146,10,.15)' }}>
        <button onClick={step===1?onBack:()=>setStep((s: any)=>(s-1) as RegStep)}
          style={{ background:'none', border:'none', cursor:'pointer', color:GOLD2, fontSize:24, lineHeight:1, padding:0 }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',Georgia,serif" }}>
            Become a Service Provider
          </div>
          <div style={{ fontSize:11, color:'rgba(245,230,192,.5)' }}>Register as a verified priest / religious guide</div>
        </div>
      </div>

      {/* Step progress */}
      <div style={{ background:'#fff', borderBottom:'1px solid rgba(200,146,10,.1)' }}>
        <StepBar step={step} />
      </div>

      {/* Content */}
      <div style={{ padding:'20px 16px' }}>
        {step===1 && <Step1 d={data} set={set} />}
        {step===2 && <Step2 d={data} set={set} />}
        {step===3 && <Step3 d={data} set={set} />}
        {step===4 && <Step4 d={data} set={set} />}
        {step===5 && <Step5 d={data} set={set} />}
      </div>

      {/* CTA */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff',
        borderTop:'1px solid rgba(200,146,10,.15)', padding:'12px 16px', boxShadow:'0 -4px 16px rgba(0,0,0,.08)' }}>
        <div style={{ display:'flex', gap:10 }}>
          {step > 1 && (
            <button onClick={()=>setStep((s: any)=>(s-1) as RegStep)} style={{
              flex:'0 0 auto', padding:'13px 20px', background:'transparent',
              border:`1.5px solid rgba(200,146,10,.35)`, borderRadius:14, cursor:'pointer',
              fontSize:14, fontWeight:700, color:NAVY,
            }}>← Back</button>
          )}
          <button
            onClick={step<5?()=>setStep((s: any)=>(s+1) as RegStep):()=>setDone(true)}
            disabled={!canNext[step as RegStep]}
            style={{
              flex:1, background:canNext[step as RegStep]?`linear-gradient(90deg,${GOLD},${GOLD2})`:'rgba(200,146,10,.25)',
              color:NAVY, fontSize:14, fontWeight:900, padding:'13px', borderRadius:14, border:'none',
              cursor:canNext[step as RegStep]?'pointer':'default',
            }}>
            {step<5 ? 'Continue →' : 'Submit Application →'}
          </button>
        </div>
      </div>
    </div>
  );
}
