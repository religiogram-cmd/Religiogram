import { DataSource } from 'typeorm';
import { Religion } from '../entities/religion.entity';
import { ProviderRole } from '../entities/provider-role.entity';
import { ServiceCategory } from '../entities/service-category.entity';
import { CatalogService, ServiceType } from '../entities/catalog-service.entity';

export async function seedCatalog(ds: DataSource) {
  const religionRepo = ds.getRepository(Religion);
  const roleRepo     = ds.getRepository(ProviderRole);
  const catRepo      = ds.getRepository(ServiceCategory);
  const svcRepo      = ds.getRepository(CatalogService);

  if (await religionRepo.count() > 0) return; // idempotent

  // ── Religions ───────────────────────────────────────────────────────────
  await religionRepo.save([
    { slug:'hindu',     displayName:'Hindu',     themePrimary:'#C8920A', themeSecondary:'#E8B430', sortOrder:1 },
    { slug:'muslim',    displayName:'Muslim',    themePrimary:'#1A7A40', themeSecondary:'#22C55E', sortOrder:2 },
    { slug:'sikh',      displayName:'Sikh',      themePrimary:'#D97706', themeSecondary:'#FCD34D', sortOrder:3 },
    { slug:'christian', displayName:'Christian', themePrimary:'#6D28D9', themeSecondary:'#A78BFA', sortOrder:4 },
  ]);

  // ── Provider Roles ───────────────────────────────────────────────────────
  await roleRepo.save([
    { slug:'pandit',   religionSlug:'hindu',     displayName:'Pandit',      verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'pujari',   religionSlug:'hindu',     displayName:'Pujari',      verificationRequirements:['aadhaar','photo'] },
    { slug:'jyotishi', religionSlug:'hindu',     displayName:'Jyotishi',    verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'vastu',    religionSlug:'hindu',     displayName:'Vastu Expert',verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'imam',     religionSlug:'muslim',    displayName:'Imam',        verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'maulana',  religionSlug:'muslim',    displayName:'Maulana',     verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'mufti',    religionSlug:'muslim',    displayName:'Mufti',       verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'qari',     religionSlug:'muslim',    displayName:'Qari',        verificationRequirements:['aadhaar','photo'] },
    { slug:'granthi',  religionSlug:'sikh',      displayName:'Granthi',     verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'bhai',     religionSlug:'sikh',      displayName:'Bhai',        verificationRequirements:['aadhaar','photo'] },
    { slug:'raagi',    religionSlug:'sikh',      displayName:'Raagi',       verificationRequirements:['aadhaar','photo'] },
    { slug:'father',   religionSlug:'christian', displayName:'Father',      verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'pastor',   religionSlug:'christian', displayName:'Pastor',      verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'reverend', religionSlug:'christian', displayName:'Reverend',    verificationRequirements:['aadhaar','certificate','photo'] },
    { slug:'deacon',   religionSlug:'christian', displayName:'Deacon',      verificationRequirements:['aadhaar','photo'] },
  ]);

  const C = (religionSlug: string, name: string, icon: string, order: number) =>
    catRepo.save({ religionSlug, name, icon, sortOrder: order });

  type SvcInput = Partial<CatalogService> & { slug: string; name: string };
  const S = (cat: ServiceCategory, data: SvcInput[]) =>
    svcRepo.save(data.map(d => ({ ...d, categoryId: cat.id })));

  // ══════════════════════════════════════════════════════════════════════════
  // HINDU (Section 3.1)
  // ══════════════════════════════════════════════════════════════════════════
  const hBasic   = await C('hindu', 'Daily & Basic Rituals',   '🪔', 1);
  const hFestive = await C('hindu', 'Festival-Based Pujas',    '🎉', 2);
  const hDosha   = await C('hindu', 'Dosha & Problem-Solving', '⭐', 3);
  const hLife    = await C('hindu', 'Life Events & Sanskar',   '💍', 4);
  const hOnline  = await C('hindu', 'Online Hindu Services',   '💻', 5);

  // 3.1.1 Daily / Basic
  await S(hBasic, [
    { slug:'ganesh-puja',           name:'Ganesh Puja',           serviceType:ServiceType.OFFLINE, defaultDurationMin:45,  minPricePaise: 80000,  maxPricePaise: 150000, rgPricePaise: 119900,  marketMinPaise: 80000,  marketMaxPaise: 150000, platformCommissionPct:12, sensitive:false },
    { slug:'lakshmi-puja',          name:'Lakshmi Puja',          serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise:120000,  maxPricePaise: 250000, rgPricePaise: 179900,  marketMinPaise:120000,  marketMaxPaise: 250000, platformCommissionPct:12, sensitive:false },
    { slug:'satyanarayan-katha',    name:'Satyanarayan Katha',    serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise:250000,  maxPricePaise: 600000, rgPricePaise: 399900,  marketMinPaise:250000,  marketMaxPaise: 600000, platformCommissionPct:12, sensitive:false },
    { slug:'daily-ghar-puja',       name:'Daily Ghar Puja',       serviceType:ServiceType.OFFLINE, defaultDurationMin:30,  minPricePaise: 50000,  maxPricePaise: 120000, rgPricePaise:  89900,  marketMinPaise: 50000,  marketMaxPaise: 120000, platformCommissionPct:12, sensitive:false },
    { slug:'tulsi-vivah',           name:'Tulsi Vivah',           serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise:200000,  maxPricePaise: 500000, rgPricePaise: 349900,  marketMinPaise:200000,  marketMaxPaise: 500000, platformCommissionPct:12, sensitive:false },
  ]);

  // 3.1.2 Festival
  await S(hFestive, [
    { slug:'diwali-lakshmi-puja',       name:'Diwali Lakshmi Puja',       serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise:250000,  maxPricePaise: 700000, rgPricePaise: 499900,  marketMinPaise:250000,  marketMaxPaise: 700000, platformCommissionPct:13, sensitive:false },
    { slug:'navratri-durga-puja',       name:'Navratri Durga Puja',       serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise:300000,  maxPricePaise: 800000, rgPricePaise: 549900,  marketMinPaise:300000,  marketMaxPaise: 800000, platformCommissionPct:13, sensitive:false },
    { slug:'ganesh-chaturthi-puja',     name:'Ganesh Chaturthi Puja',     serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise:200000,  maxPricePaise: 600000, rgPricePaise: 399900,  marketMinPaise:200000,  marketMaxPaise: 600000, platformCommissionPct:13, sensitive:false },
    { slug:'karwa-chauth-puja',         name:'Karwa Chauth Puja',         serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise:150000,  maxPricePaise: 400000, rgPricePaise: 249900,  marketMinPaise:150000,  marketMaxPaise: 400000, platformCommissionPct:13, sensitive:false },
    { slug:'makar-sankranti-puja',      name:'Makar Sankranti Puja',      serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise:100000,  maxPricePaise: 300000, rgPricePaise: 199900,  marketMinPaise:100000,  marketMaxPaise: 300000, platformCommissionPct:13, sensitive:false },
  ]);

  // 3.1.3 Dosha
  await S(hDosha, [
    { slug:'navgraha-shanti',   name:'Navgraha Shanti Puja',   serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise: 500000, maxPricePaise:1500000, rgPricePaise: 899900,  marketMinPaise: 500000, marketMaxPaise:1500000, platformCommissionPct:14, sensitive:false },
    { slug:'kaal-sarp-dosh',    name:'Kaal Sarp Dosh Puja',    serviceType:ServiceType.OFFLINE, defaultDurationMin:240, minPricePaise: 700000, maxPricePaise:2500000, rgPricePaise:1299900,  marketMinPaise: 700000, marketMaxPaise:2500000, platformCommissionPct:14, sensitive:false },
    { slug:'mangal-dosh-puja',  name:'Mangal Dosh Puja',       serviceType:ServiceType.OFFLINE, defaultDurationMin:150, minPricePaise: 400000, maxPricePaise:1200000, rgPricePaise: 799900,  marketMinPaise: 400000, marketMaxPaise:1200000, platformCommissionPct:14, sensitive:false },
    { slug:'vastu-shanti-puja', name:'Vastu Shanti Puja',      serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise: 600000, maxPricePaise:2000000, rgPricePaise: 999900,  marketMinPaise: 600000, marketMaxPaise:2000000, platformCommissionPct:14, sensitive:false },
    { slug:'rahu-ketu-shanti',  name:'Rahu-Ketu Shanti',       serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 400000, maxPricePaise:1200000, rgPricePaise: 749900,  marketMinPaise: 400000, marketMaxPaise:1200000, platformCommissionPct:14, sensitive:false },
  ]);

  // 3.1.4 Life Events
  await S(hLife, [
    { slug:'griha-pravesh',  name:'Griha Pravesh Puja',       serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise: 600000, maxPricePaise:2500000, rgPricePaise:1099900,  marketMinPaise: 600000, marketMaxPaise:2500000, platformCommissionPct:13, sensitive:false },
    { slug:'naamkaran',      name:'Naamkaran (Naming)',        serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 300000, maxPricePaise:1000000, rgPricePaise: 599900,  marketMinPaise: 300000, marketMaxPaise:1000000, platformCommissionPct:13, sensitive:false },
    { slug:'mundan',         name:'Mundan Ceremony',          serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 300000, maxPricePaise:1200000, rgPricePaise: 649900,  marketMinPaise: 300000, marketMaxPaise:1200000, platformCommissionPct:13, sensitive:false },
    { slug:'annaprashan',    name:'Annaprashan',              serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 300000, maxPricePaise: 800000, rgPricePaise: 549900,  marketMinPaise: 300000, marketMaxPaise: 800000, platformCommissionPct:13, sensitive:false },
    { slug:'hindu-wedding',  name:'Wedding Ritual (Pandit)',  serviceType:ServiceType.OFFLINE, defaultDurationMin:360, minPricePaise:1500000, maxPricePaise:5000000, rgPricePaise:2499900,  marketMinPaise:1500000, marketMaxPaise:5000000, platformCommissionPct:13, sensitive:false },
    { slug:'hindu-last-rites',name:'Antim Sanskar / Last Rites',serviceType:ServiceType.OFFLINE,defaultDurationMin:120,minPricePaise: 300000, maxPricePaise: 800000, rgPricePaise: 499900,  marketMinPaise: 300000, marketMaxPaise: 800000, platformCommissionPct:7,  sensitive:true  },
  ]);

  // 3.1.5 Online
  await S(hOnline, [
    { slug:'online-puja-basic',    name:'Online Puja (Basic)',        serviceType:ServiceType.ONLINE, defaultDurationMin:45,  minPricePaise: 50000, maxPricePaise:150000, rgPricePaise: 99900, marketMinPaise: 50000, marketMaxPaise:150000, platformCommissionPct:20, sensitive:false },
    { slug:'live-temple-puja',     name:'Live Temple Puja',           serviceType:ServiceType.ONLINE, defaultDurationMin:60,  minPricePaise:100000, maxPricePaise:300000, rgPricePaise:199900, marketMinPaise:100000, marketMaxPaise:300000, platformCommissionPct:20, sensitive:false },
    { slug:'astro-puja-combo',     name:'Astrology + Puja Combo',     serviceType:ServiceType.ONLINE, defaultDurationMin:45,  minPricePaise:150000, maxPricePaise:500000, rgPricePaise:299900, marketMinPaise:150000, marketMaxPaise:500000, platformCommissionPct:25, sensitive:false },
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // MUSLIM (Section 3.3)
  // ══════════════════════════════════════════════════════════════════════════
  const mOnline  = await C('muslim', 'Online Consultation (Imam)', '💬', 1);
  const mOffline = await C('muslim', 'Offline Rituals & Services', '🕌', 2);
  const mAddon   = await C('muslim', 'Add-on Services',            '➕', 3);

  await S(mOnline, [
    // Per-minute consultation (handled by perMinutePaise on provider; these are fixed-session packages)
    { slug:'imam-consult-20min', name:'Imam Consultation (20 min)', serviceType:ServiceType.ONLINE, defaultDurationMin:20, minPricePaise:29900, maxPricePaise:29900, rgPricePaise:29900, marketMinPaise:29900, marketMaxPaise:29900, platformCommissionPct:22, sensitive:false },
    { slug:'imam-consult-30min', name:'Imam Consultation (30 min)', serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise:49900, maxPricePaise:49900, rgPricePaise:49900, marketMinPaise:49900, marketMaxPaise:49900, platformCommissionPct:22, sensitive:false },
  ]);

  await S(mOffline, [
    { slug:'nikah-local',        name:'Nikah Ceremony (Local)',         serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 300000, maxPricePaise: 800000, rgPricePaise: 500000, marketMinPaise: 300000, marketMaxPaise: 800000,  platformCommissionPct:12, sensitive:false },
    { slug:'nikah-experienced',  name:'Nikah Ceremony (Experienced)',   serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 800000, maxPricePaise:2000000, rgPricePaise:1200000, marketMinPaise: 800000, marketMaxPaise:2000000,  platformCommissionPct:12, sensitive:false },
    { slug:'nikah-premium',      name:'Nikah Ceremony (Premium)',       serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise:2000000, maxPricePaise:5000000, rgPricePaise:3000000, marketMinPaise:2000000, marketMaxPaise:5000000,  platformCommissionPct:12, sensitive:false },
    { slug:'janazah-basic',      name:'Janazah Prayer (Basic)',         serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise: 100000, maxPricePaise: 300000, rgPricePaise: 150000, marketMinPaise: 100000, marketMaxPaise: 300000,  platformCommissionPct:7,  sensitive:true  },
    { slug:'janazah-full',       name:'Janazah Prayer (Full guidance)', serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 300000, maxPricePaise: 700000, rgPricePaise: 450000, marketMinPaise: 300000, marketMaxPaise: 700000,  platformCommissionPct:7,  sensitive:true  },
    { slug:'aqeeqah-basic',      name:'Aqeeqah / Naming (Basic)',       serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 200000, maxPricePaise: 500000, rgPricePaise: 300000, marketMinPaise: 200000, marketMaxPaise: 500000,  platformCommissionPct:15, sensitive:false },
    { slug:'aqeeqah-full',       name:'Aqeeqah / Naming (Full)',        serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 500000, maxPricePaise:1200000, rgPricePaise: 750000, marketMinPaise: 500000, marketMaxPaise:1200000,  platformCommissionPct:15, sensitive:false },
    { slug:'dua-blessing-short', name:'Dua / Blessing (Short)',         serviceType:ServiceType.OFFLINE, defaultDurationMin:30,  minPricePaise: 100000, maxPricePaise: 250000, rgPricePaise: 150000, marketMinPaise: 100000, marketMaxPaise: 250000,  platformCommissionPct:15, sensitive:false },
    { slug:'dua-blessing-ext',   name:'Dua / Blessing (Extended)',      serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise: 250000, maxPricePaise: 600000, rgPricePaise: 400000, marketMinPaise: 250000, marketMaxPaise: 600000,  platformCommissionPct:15, sensitive:false },
    { slug:'taraweeh-imam',      name:'Taraweeh Imam (Ramadan)',        serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise: 500000, maxPricePaise:2500000, rgPricePaise:1200000, marketMinPaise: 500000, marketMaxPaise:2500000,  platformCommissionPct:15, sensitive:false },
    { slug:'eid-khutbah',        name:'Eid Khutbah',                    serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise: 300000, maxPricePaise:1500000, rgPricePaise: 700000, marketMinPaise: 300000, marketMaxPaise:1500000,  platformCommissionPct:15, sensitive:false },
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // SIKH (Section 3.4)
  // ══════════════════════════════════════════════════════════════════════════
  const sPath    = await C('sikh', 'Gurbani / Path Services', '📖', 1);
  const sLife    = await C('sikh', 'Sikh Life Events',        '✨', 2);
  const sOnline  = await C('sikh', 'Online Sikh Services',    '💻', 3);

  await S(sPath, [
    { slug:'akhand-path',       name:'Akhand Path (48-hr)',          serviceType:ServiceType.OFFLINE, defaultDurationMin:2880, minPricePaise:1100000, maxPricePaise:3100000, rgPricePaise:1899900, marketMinPaise:1100000, marketMaxPaise:3100000, platformCommissionPct:12, sensitive:false },
    { slug:'sehaj-path',        name:'Sehaj Path (7-10 days)',       serviceType:ServiceType.OFFLINE, defaultDurationMin:7200, minPricePaise: 500000, maxPricePaise:1500000, rgPricePaise: 899900, marketMinPaise: 500000, marketMaxPaise:1500000, platformCommissionPct:12, sensitive:false },
    { slug:'sukhmani-sahib',    name:'Sukhmani Sahib Path',          serviceType:ServiceType.OFFLINE, defaultDurationMin:120,  minPricePaise: 150000, maxPricePaise: 400000, rgPricePaise: 249900, marketMinPaise: 150000, marketMaxPaise: 400000, platformCommissionPct:12, sensitive:false },
    { slug:'ardas-at-home',     name:'Ardas at Home',                serviceType:ServiceType.OFFLINE, defaultDurationMin:45,   minPricePaise:  50000, maxPricePaise: 150000, rgPricePaise:  99900, marketMinPaise:  50000, marketMaxPaise: 150000, platformCommissionPct:12, sensitive:false },
    { slug:'path-bhog',         name:'Path Completion Bhog',         serviceType:ServiceType.OFFLINE, defaultDurationMin:120,  minPricePaise: 200000, maxPricePaise: 600000, rgPricePaise: 349900, marketMinPaise: 200000, marketMaxPaise: 600000, platformCommissionPct:12, sensitive:false },
  ]);

  await S(sLife, [
    { slug:'anand-karaj',        name:'Anand Karaj (Wedding)',       serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise:1100000, maxPricePaise:5100000, rgPricePaise:2499900, marketMinPaise:1100000, marketMaxPaise:5100000, platformCommissionPct:12, sensitive:false },
    { slug:'naam-karan-sikh',    name:'Naam Karan (Naming)',         serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 250000, maxPricePaise: 700000, rgPricePaise: 449900, marketMinPaise: 250000, marketMaxPaise: 700000, platformCommissionPct:12, sensitive:false },
    { slug:'antam-sanskar',      name:'Antam Sanskar (Last Rites)',  serviceType:ServiceType.OFFLINE, defaultDurationMin:150, minPricePaise: 500000, maxPricePaise:1500000, rgPricePaise: 899900, marketMinPaise: 500000, marketMaxPaise:1500000, platformCommissionPct:7,  sensitive:true  },
    { slug:'dastar-bandi',       name:'Dastar Bandi (Turban tying)', serviceType:ServiceType.OFFLINE, defaultDurationMin:90,  minPricePaise: 300000, maxPricePaise:1000000, rgPricePaise: 549900, marketMinPaise: 300000, marketMaxPaise:1000000, platformCommissionPct:12, sensitive:false },
    { slug:'amrit-sanskar-prep', name:'Amrit Sanskar Prep',         serviceType:ServiceType.OFFLINE, defaultDurationMin:150, minPricePaise: 400000, maxPricePaise:1200000, rgPricePaise: 699900, marketMinPaise: 400000, marketMaxPaise:1200000, platformCommissionPct:12, sensitive:false },
  ]);

  await S(sOnline, [
    { slug:'live-gurbani-kirtan',      name:'Live Gurbani Kirtan',          serviceType:ServiceType.ONLINE, defaultDurationMin:60, minPricePaise:100000, maxPricePaise:350000, rgPricePaise:199900, marketMinPaise:100000, marketMaxPaise:350000, platformCommissionPct:20, sensitive:false },
    { slug:'hukamnama-interpretation', name:'Hukamnama Interpretation',     serviceType:ServiceType.ONLINE, defaultDurationMin:20, minPricePaise: 20000, maxPricePaise: 70000, rgPricePaise: 39900, marketMinPaise: 20000, marketMaxPaise: 70000, platformCommissionPct:20, sensitive:false },
    { slug:'sikh-spiritual-counsel',   name:'Sikh Spiritual Counselling',   serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise: 50000, maxPricePaise:150000, rgPricePaise: 89900, marketMinPaise: 50000, marketMaxPaise:150000, platformCommissionPct:22, sensitive:false },
    { slug:'online-sukhmani-path',     name:'Online Sukhmani Sahib Path',   serviceType:ServiceType.ONLINE, defaultDurationMin:90, minPricePaise:120000, maxPricePaise:350000, rgPricePaise:199900, marketMinPaise:120000, marketMaxPaise:350000, platformCommissionPct:20, sensitive:false },
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // CHRISTIAN (Section 3.2)
  // ══════════════════════════════════════════════════════════════════════════
  const cSacrament = await C('christian', 'Sacraments & Core Rituals',        '✝️', 1);
  const cBlessings = await C('christian', 'House Blessings & Special Prayers', '🙏', 2);
  const cEvents    = await C('christian', 'Life Events & Community',           '🎊', 3);
  const cOnline    = await C('christian', 'Online Christian Services',         '💻', 4);

  await S(cSacrament, [
    { slug:'baptism',         name:'Baptism Ceremony',           serviceType:ServiceType.OFFLINE, defaultDurationMin:60,  minPricePaise:200000, maxPricePaise: 600000, rgPricePaise: 400000, marketMinPaise:200000, marketMaxPaise: 600000, platformCommissionPct:12, sensitive:false },
    { slug:'holy-communion',  name:'Holy Communion (Private)',   serviceType:ServiceType.OFFLINE, defaultDurationMin:45,  minPricePaise:150000, maxPricePaise: 400000, rgPricePaise: 250000, marketMinPaise:150000, marketMaxPaise: 400000, platformCommissionPct:12, sensitive:false },
    { slug:'confirmation-guidance', name:'Confirmation Guidance',serviceType:ServiceType.OFFLINE, defaultDurationMin:180, minPricePaise:300000, maxPricePaise: 800000, rgPricePaise: 500000, marketMinPaise:300000, marketMaxPaise: 800000, platformCommissionPct:12, sensitive:false },
    { slug:'christian-wedding',name:'Christian Wedding',         serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise:800000, maxPricePaise:2500000, rgPricePaise:1500000, marketMinPaise:800000, marketMaxPaise:2500000, platformCommissionPct:12, sensitive:false },
    { slug:'christian-funeral',name:'Funeral / Last Rites',      serviceType:ServiceType.OFFLINE, defaultDurationMin:120, minPricePaise:500000, maxPricePaise:1500000, rgPricePaise: 800000, marketMinPaise:500000, marketMaxPaise:1500000, platformCommissionPct:7,  sensitive:true  },
  ]);

  await S(cBlessings, [
    { slug:'house-blessing',       name:'House Blessing',           serviceType:ServiceType.OFFLINE, defaultDurationMin:45, minPricePaise:200000, maxPricePaise: 500000, rgPricePaise:300000, marketMinPaise:200000, marketMaxPaise: 500000, platformCommissionPct:12, sensitive:false },
    { slug:'family-prayer',        name:'Family Prayer Service',    serviceType:ServiceType.OFFLINE, defaultDurationMin:45, minPricePaise:150000, maxPricePaise: 400000, rgPricePaise:250000, marketMinPaise:150000, marketMaxPaise: 400000, platformCommissionPct:12, sensitive:false },
    { slug:'thanksgiving-prayer',  name:'Thanksgiving Prayer',      serviceType:ServiceType.OFFLINE, defaultDurationMin:45, minPricePaise:200000, maxPricePaise: 600000, rgPricePaise:350000, marketMinPaise:200000, marketMaxPaise: 600000, platformCommissionPct:12, sensitive:false },
    { slug:'healing-anointing',    name:'Healing Prayer / Anointing',serviceType:ServiceType.OFFLINE,defaultDurationMin:40, minPricePaise:150000, maxPricePaise: 500000, rgPricePaise:250000, marketMinPaise:150000, marketMaxPaise: 500000, platformCommissionPct:12, sensitive:false },
  ]);

  await S(cEvents, [
    { slug:'birthday-blessing',  name:'Birthday Blessing Prayer',    serviceType:ServiceType.OFFLINE, defaultDurationMin:30, minPricePaise:100000, maxPricePaise: 300000, rgPricePaise:180000, marketMinPaise:100000, marketMaxPaise: 300000, platformCommissionPct:12, sensitive:false },
    { slug:'anniversary-blessing',name:'Anniversary Blessing',       serviceType:ServiceType.OFFLINE, defaultDurationMin:30, minPricePaise:150000, maxPricePaise: 400000, rgPricePaise:220000, marketMinPaise:150000, marketMaxPaise: 400000, platformCommissionPct:12, sensitive:false },
    { slug:'youth-fellowship',   name:'Youth Fellowship Session',    serviceType:ServiceType.OFFLINE, defaultDurationMin:90, minPricePaise:300000, maxPricePaise:1000000, rgPricePaise:500000, marketMinPaise:300000, marketMaxPaise:1000000, platformCommissionPct:12, sensitive:false },
    { slug:'choir-worship',      name:'Choir / Worship Booking',     serviceType:ServiceType.OFFLINE, defaultDurationMin:90, minPricePaise:500000, maxPricePaise:2000000, rgPricePaise:900000, marketMinPaise:500000, marketMaxPaise:2000000, platformCommissionPct:12, sensitive:false },
  ]);

  await S(cOnline, [
    { slug:'christian-counseling',  name:'Christian Counseling',     serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise: 50000, maxPricePaise:150000, rgPricePaise: 90000, marketMinPaise: 50000, marketMaxPaise:150000, platformCommissionPct:20, sensitive:false },
    { slug:'marriage-counseling',   name:'Marriage Counseling',      serviceType:ServiceType.ONLINE, defaultDurationMin:45, minPricePaise:100000, maxPricePaise:250000, rgPricePaise:160000, marketMinPaise:100000, marketMaxPaise:250000, platformCommissionPct:22, sensitive:false },
    { slug:'christian-spiritual-guidance',name:'Spiritual Guidance', serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise: 50000, maxPricePaise:120000, rgPricePaise: 80000, marketMinPaise: 50000, marketMaxPaise:120000, platformCommissionPct:20, sensitive:false },
    { slug:'bible-study',           name:'Bible Study Session',      serviceType:ServiceType.ONLINE, defaultDurationMin:60, minPricePaise: 30000, maxPricePaise:100000, rgPricePaise: 60000, marketMinPaise: 30000, marketMaxPaise:100000, platformCommissionPct:20, sensitive:false },
    { slug:'live-prayer-session',   name:'Live Prayer Session',      serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise: 60000, maxPricePaise:150000, rgPricePaise: 99000, marketMinPaise: 60000, marketMaxPaise:150000, platformCommissionPct:20, sensitive:false },
    { slug:'healing-prayer-online', name:'Healing Prayer Online',    serviceType:ServiceType.ONLINE, defaultDurationMin:30, minPricePaise: 50000, maxPricePaise:150000, rgPricePaise: 90000, marketMinPaise: 50000, marketMaxPaise:150000, platformCommissionPct:20, sensitive:false },
    { slug:'faith-based-guidance',  name:'Faith-Based Life Guidance',serviceType:ServiceType.ONLINE, defaultDurationMin:45, minPricePaise: 80000, maxPricePaise:200000, rgPricePaise:130000, marketMinPaise: 80000, marketMaxPaise:200000, platformCommissionPct:20, sensitive:false },
    { slug:'ask-a-pastor',          name:'Ask a Pastor (Q&A)',       serviceType:ServiceType.ONLINE, defaultDurationMin:15, minPricePaise: 20000, maxPricePaise: 50000, rgPricePaise: 35000, marketMinPaise: 20000, marketMaxPaise: 50000, platformCommissionPct:20, sensitive:false },
  ]);

  console.log('[seedCatalog] Completed — all 4 religions seeded with 50+ SKUs');
}
