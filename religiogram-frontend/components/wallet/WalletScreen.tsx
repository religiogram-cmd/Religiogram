'use client';
import { useState, useEffect, useCallback } from 'react';
import { walletApi, type WalletBalance, type WalletTransaction } from '@/lib/wallet-api';
import { formatINR } from '@/lib/format-currency';
import { EmptyState } from '@/components/EmptyState';

const NAVY='#1B2A5C', GOLD='#C8920A';
const QUICK_AMOUNTS = [200, 500, 1000, 2000];

function txEmoji(t: string, c: boolean): string {
  if (t==='recharge'||t==='topup') return '✅';
  if (t==='refund') return '🔄';
  if (t==='promo') return '🎁';
  if (t==='consultation') return '💬';
  return c ? '✅' : '📅';
}
function fmt(p: number, _d = 0) { return formatINR(p); }
function fmtDate(s: string) { try { return new Date(s).toLocaleDateString('en-IN', { day:'numeric', month:'short' }); } catch { return s; } }

/** Load Razorpay checkout.js once and resolve when ready */
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function WalletScreen() {
  const [ca, setCa]       = useState('');
  const [bal, setBal]     = useState<WalletBalance | null>(null);
  const [txns, setTxns]   = useState<WalletTransaction[]>([]);
  const [ldBal, setLdBal] = useState(true);
  const [ldTx, setLdTx]   = useState(true);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg]     = useState<string | null>(null);

  useEffect(() => {
    walletApi.balance().then(b => setBal(b)).catch(console.error).finally(() => setLdBal(false));
    walletApi.transactions().then(r => setTxns(r.transactions)).catch(console.error).finally(() => setLdTx(false));
  }, []);

  const addMoney = useCallback(async (amtRupees: number) => {
    if (adding) return;
    const amtPaise = amtRupees * 100;
    setAdding(true);
    setMsg(null);

    try {
      // Step 1: Create Razorpay order on server
      const order = await walletApi.initiateTopUp({ amountPaise: amtPaise });

      // Step 2: Load Razorpay SDK and open checkout modal
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Failed to load Razorpay SDK');

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key:        order.keyId,
          amount:     order.amountPaise,
          currency:   order.currency,
          order_id:   order.razorpayOrderId,
          name:       'ReligioGram',
          description:'Wallet Top-Up',
          theme:      { color: GOLD },
          modal:      { ondismiss: () => reject(new Error('dismissed')) },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              // Step 3: Confirm credit on server
              await walletApi.confirmTopUp(response.razorpay_payment_id, amtPaise);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
        rzp.open();
      });

      // Refresh balance and transactions
      const [newBal, newTxns] = await Promise.all([
        walletApi.balance(),
        walletApi.transactions(),
      ]);
      setBal(newBal);
      setTxns(newTxns.transactions);
      setMsg(`${formatINR(amtRupees * 100)} added to your wallet.`);
    } catch (err: any) {
      if (err?.message === 'dismissed') {
        setMsg(null); // user closed modal — no error
      } else {
        console.error(err);
        setMsg('Top-up failed. Please try again.');
      }
    } finally {
      setAdding(false);
    }
  }, [adding]);

  const addCustom = () => {
    const v = parseInt(ca, 10);
    if (!v || v < 10) { setMsg(`Minimum top-up amount is ${formatINR(1000)}`); return; }
    if (v > 50000)    { setMsg(`Maximum top-up amount is ${formatINR(5000000)}`); return; }
    addMoney(v);
    setCa('');
  };

  const isError = !!msg && (msg.includes('failed') || msg.includes('valid') || msg.includes('Minimum') || msg.includes('Maximum'));
  const balR = bal ? fmt(bal.availablePaise, 2) : '—';
  const proR = bal ? fmt(bal.promoCreditsPaise) : '—';
  const hldR = bal ? fmt(bal.heldPaise)         : '0';

  return (
    <div style={{ background:'#FFFBF0', minHeight:'100vh', paddingBottom:88 }}>
      {/* Header */}
      <div style={{ background:'#FFFFFF', padding:'20px 20px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 2px 8px rgba(27,42,92,0.08)' }}>
        <h1 style={{ fontFamily:'Cinzel,serif', color:NAVY, fontSize:22, fontWeight:700, margin:0 }}>My Wallet</h1>
        <span/>
      </div>

      <div style={{ padding:'20px 16px 0' }}>
        {/* Balance card */}
        <div style={{ borderRadius:20, background:'linear-gradient(135deg,#1B2A5C 0%,#2D3E7C 60%,#1B2A5C 100%)', padding:'24px 22px', marginBottom:20, position:'relative', overflow:'hidden', boxShadow:'0 8px 24px rgba(27,42,92,0.30)' }}>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:13, margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>Available Balance</p>
          {ldBal
            ? <p style={{ color:'#fff', fontSize:28, fontWeight:800, margin:'0 0 6px' }}>Loading...</p>
            : <p style={{ color:'#fff', fontSize:38, fontWeight:800, margin:'0 0 6px', letterSpacing:'-0.02em' }}>{balR}</p>
          }
          <p style={{ color:'#C8920ACC', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>Promo Credits: {proR}</p>
          <div style={{ display:'flex', alignItems:'center', gap:6, borderTop:'1px solid rgba(255,255,255,0.15)', paddingTop:12 }}>
            <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>Held:</span>
            <span style={{ color:'#fff', fontSize:12, fontWeight:600 }}>{hldR}</span>
          </div>
        </div>

        {/* Status message */}
        {msg && (
          <div style={{ background: isError ? '#fef2f2' : '#f0fdf4', border:'1px solid '+(isError ? '#fca5a5' : '#86efac'), borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:13, color: isError ? '#dc2626' : '#16a34a' }}>
            {msg}
          </div>
        )}

        {/* Quick add buttons */}
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          {QUICK_AMOUNTS.map(a => (
            <button key={a} onClick={() => addMoney(a)} disabled={adding}
              style={{ flex:1, padding:'9px 0', borderRadius:50, border:'1.5px solid #C8920A', background:'transparent', color:'#C8920A', fontSize:12, fontWeight:700, cursor:adding?'not-allowed':'pointer', opacity:adding?0.6:1 }}>
              +{formatINR(a * 100)}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div style={{ background:'#fff', borderRadius:14, padding:16, boxShadow:'0 2px 10px rgba(27,42,92,0.07)', marginBottom:24, border:'1px solid rgba(200,146,10,0.12)' }}>
          <p style={{ fontSize:13, color:NAVY, fontWeight:600, margin:'0 0 10px' }}>Add Custom Amount</p>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1, display:'flex', alignItems:'center', border:'1.5px solid rgba(27,42,92,0.2)', borderRadius:10, padding:'0 12px', background:'#FFFBF0' }}>
              <span style={{ color:'#7A6650', fontSize:16, marginRight:4 }}>₹</span>
              <input
                type="number" placeholder="Min ₹10, max ₹50,000"
                value={ca} onChange={e => setCa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                min={10} max={50000}
                style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:NAVY, padding:'10px 0' }}
              />
            </div>
            <button onClick={addCustom} disabled={adding}
              style={{ background:GOLD, color:'#fff', border:'none', borderRadius:10, padding:'0 18px', fontSize:13, fontWeight:700, cursor:adding?'not-allowed':'pointer', opacity:adding?0.7:1 }}>
              {adding ? '...' : 'Add Money'}
            </button>
          </div>
        </div>

        {/* Transaction history */}
        <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 10px rgba(27,42,92,0.07)', border:'1px solid rgba(200,146,10,0.12)', marginBottom:16, overflow:'hidden' }}>
          <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid rgba(27,42,92,0.08)' }}>
            <h2 style={{ fontFamily:'Cinzel,serif', color:NAVY, fontSize:15, fontWeight:700, margin:0 }}>Transaction History</h2>
          </div>
          {ldTx
            ? <div style={{ padding:'24px 16px', textAlign:'center', color:'#7A6650', fontSize:13 }}>Loading...</div>
            : txns.length === 0
              ? <EmptyState
                  icon="💳"
                  title="No transactions yet"
                  subtitle="Add money to your wallet or make a booking to see transactions here"
                />
              : txns.map((tx: any, i: number) => {
                  const c = tx.direction === 1;
                  return (
                    <div key={tx.id}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:c?'#f0fdf4':'#fff5f5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                          {txEmoji(tx.type, c)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, fontWeight:600, color:NAVY, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.description}</p>
                          <p style={{ fontSize:11, color:'#7A6650', margin:0 }}>{fmtDate(tx.createdAt)}</p>
                        </div>
                        <span style={{ fontSize:14, fontWeight:700, flexShrink:0, color:c?'#16a34a':'#dc2626' }}>
                          {c ? '+' : '-'}{fmt(tx.amountPaise)}
                        </span>
                      </div>
                      {i < txns.length - 1 && <div style={{ height:1, background:'rgba(27,42,92,0.06)', margin:'0 16px' }}/>}
                    </div>
                  );
                })
          }
          <div style={{ borderTop:'1px solid rgba(27,42,92,0.08)', padding:'14px 16px', textAlign:'center' }}>
            <button style={{ background:'transparent', border:'none', cursor:'pointer', color:GOLD, fontSize:13, fontWeight:700 }}>
              Download Statement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
