const STORAGE_KEY = 'invoicer_v2';

function emptyState(){ return { items:[], customers:[], bills:[], settings:{ businessName:'My Business' } }; }
function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return emptyState();
    const d = JSON.parse(raw);
    if(!Array.isArray(d.items)) d.items = [];
    if(!Array.isArray(d.customers)) d.customers = [];
    if(!Array.isArray(d.bills)) d.bills = [];
    if(!d.settings) d.settings = { businessName:'My Business' };
    return d;
  }catch(e){ return emptyState(); }
}
function saveData(d){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
  catch(e){ alert('Storage unavailable'); }
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function getSettings(){ return loadData().settings || { businessName:'My Business' }; }
function saveSettings(s){
  const d = loadData();
  d.settings = Object.assign({}, d.settings || {}, s);
  saveData(d);
}

function fmtINR(n){
  n = Number(n)||0;
  const neg = n < 0;
  const v = Math.abs(n);
  const s = v.toFixed(v % 1 === 0 ? 0 : 2);
  return (neg ? '-₹' : '₹') + s;
}
function fmtDate(d){
  d = d instanceof Date ? d : new Date(d);
  return d.getDate() + '/' + (d.getMonth()+1) + '/' + String(d.getFullYear()).slice(2);
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function qs(n){ return new URLSearchParams(location.search).get(n); }

function getItems(){ return loadData().items.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')); }
function getItem(id){ return loadData().items.find(i=>i.id===id)||null; }
function upsertItem(it){
  const d = loadData();
  const i = d.items.findIndex(x=>x.id===it.id);
  if(i === -1){ it.id = it.id || uid(); it.createdAt = it.createdAt || Date.now(); d.items.push(it); }
  else { d.items[i] = Object.assign({}, d.items[i], it); }
  saveData(d);
  return it;
}
function removeItem(id){
  const d = loadData();
  d.items = d.items.filter(i=>i.id !== id);
  saveData(d);
}

function getCustomers(){ return loadData().customers.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')); }
function getCustomer(id){ return loadData().customers.find(c=>c.id===id)||null; }
function upsertCustomer(c){
  const d = loadData();
  const i = d.customers.findIndex(x=>x.id===c.id);
  if(i === -1){ c.id = c.id || uid(); c.createdAt = c.createdAt || Date.now(); c.balance = Number(c.balance)||0; d.customers.push(c); }
  else { d.customers[i] = Object.assign({}, d.customers[i], c); }
  saveData(d);
  return c;
}
function removeCustomer(id){
  const d = loadData();
  d.customers = d.customers.filter(c=>c.id !== id);
  d.bills = d.bills.filter(b=>b.customerId !== id);
  saveData(d);
}

function getBills(cid){
  const list = cid ? loadData().bills.filter(b=>b.customerId===cid) : loadData().bills.slice();
  return list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function getBill(id){ return loadData().bills.find(b=>b.id===id)||null; }
function saveBill(b){
  const d = loadData();
  b.id = b.id || uid();
  b.createdAt = b.createdAt || Date.now();
  const i = d.bills.findIndex(x=>x.id===b.id);
  if(i === -1) d.bills.push(b); else d.bills[i] = b;
  saveData(d);
  return b;
}
function deleteBill(id){
  const d = loadData();
  d.bills = d.bills.filter(b=>b.id !== id);
  saveData(d);
}
function nextBillSeq(customerId){
  const bills = loadData().bills.filter(b=>b.customerId===customerId);
  const max = bills.reduce((m,b)=>Math.max(m, Number(b.seq)||0), 0);
  return max + 1;
}
function recalcCustomerBalance(cid){
  const d = loadData();
  const bills = d.bills.filter(b=>b.customerId===cid);
  const bal = bills.reduce((s,b)=>s+(Number(b.grandTotal)||0)-(Number(b.paid)||0),0);
  const i = d.customers.findIndex(c=>c.id===cid);
  if(i !== -1){ d.customers[i].balance = bal; saveData(d); }
  return bal;
}

function cleanPhone(p){
  let d = String(p||'').replace(/\D/g,'');
  if(d.length === 10) d = '91'+d;
  return d;
}
function waLink(phone, text){
  return 'https://wa.me/' + cleanPhone(phone) + '?text=' + encodeURIComponent(text);
}
function padRow(left, right, width){
  width = width || 32;
  left = String(left); right = String(right);
  const total = left.length + right.length;
  if(total >= width) return left + ' ' + right;
  return left + ' '.repeat(width - total) + right;
}
function buildBillText(bill){
  const lines = [];
  lines.push('------------------------------');
  lines.push(fmtDate(bill.date || bill.createdAt));
  lines.push('');
  (bill.items||[]).forEach(it=>{
    const amt = (Number(it.qty)||0)*(Number(it.price)||0);
    const desc = (it.name||'Item') + ' x' + (it.qty||0);
    lines.push(padRow(desc, String(amt), 32));
  });
  lines.push('------------------------------');
  lines.push(padRow('Total', fmtINR(bill.total), 32));
  lines.push(padRow('Old', fmtINR(bill.oldBalance), 32));
  lines.push('------------------------------');
  lines.push(padRow('Grand Total', fmtINR(bill.grandTotal), 32));
  if(Number(bill.paid) > 0){
    lines.push('------------------------------');
    lines.push(padRow('Paid', fmtINR(bill.paid), 32));
    lines.push(padRow('Due', fmtINR((bill.grandTotal||0)-(bill.paid||0)), 32));
  }
  if(bill.notes && String(bill.notes).trim()){
    lines.push('------------------------------');
    lines.push('Notes:');
    lines.push(String(bill.notes).trim());
  }
  lines.push('------------------------------');
  return lines.join('\n');
}
function openWa(link){
  const a = document.createElement('a');
  a.href = link; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function toast(msg){
  const old = document.querySelector('.toast');
  if(old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2400);
}
function mountModal(html, onReady){
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-backdrop">' + html + '</div>';
  const back = root.querySelector('.modal-backdrop');
  back.addEventListener('click', e => { if(e.target === back) closeModal(); });
  if(onReady) onReady(root);
}
function closeModal(){
  const root = document.getElementById('modalRoot');
  if(root) root.innerHTML = '';
}
async function copyToClipboard(text){
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch(e){}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch(e){ return false; }
}

const ICON_PATHS = {
  back:   '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  user:   '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.3 2.6-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14.8c2.6.2 4.7 2.2 4.7 5.2"/>',
  users:  '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.3 2.6-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14.8c2.6.2 4.7 2.2 4.7 5.2"/>',
  doc:    '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  box:    '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  home:   '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/>',
  send:   '<path d="M4 4l16 8-16 8 4-8-4-8z"/>',
  image:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/>',
  trash:  '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/>',
  edit:   '<path d="M4 20l4-1 11-11a1.5 1.5 0 0 0 0-2.1l-1-1a1.5 1.5 0 0 0-2.1 0L5 16l-1 4z"/>',
  dots:   '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  check:  '<path d="M5 13l4 4 10-10"/>',
  gear:   '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"/>'
};
function icon(name, size){
  size = size || 22;
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name]||'') + '</svg>';
}

function truncateText(ctx, text, maxW){
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 0 && ctx.measureText(text + '…').width > maxW){
    text = text.slice(0, -1);
  }
  return text + '…';
}
function wrapText(ctx, text, maxW){
  const words = String(text||'').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words){
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur){ lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawLetterSpaced(ctx, text, startX, y, spacing){
  let x = startX;
  for (const ch of text){
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}
function measureLetterSpaced(ctx, text, spacing){
  let w = 0;
  for (const ch of text){ w += ctx.measureText(ch).width + spacing; }
  return w - spacing;
}

function drawHeaderBg(ctx, W, H){
  ctx.fillStyle = '#fdf6f3';
  ctx.fillRect(0, 0, W, H);
  const splats = [
    { x:100, y:40,  r:280, c0:'rgba(244,190,180,0.65)', c1:'rgba(244,190,180,0)' },
    { x:340, y:10,  r:220, c0:'rgba(248,205,195,0.55)', c1:'rgba(248,205,195,0)' },
    { x:640, y:60,  r:300, c0:'rgba(247,200,190,0.6)',  c1:'rgba(247,200,190,0)' },
    { x:960, y:20,  r:230, c0:'rgba(245,195,185,0.55)', c1:'rgba(245,195,185,0)' },
    { x:180, y:230, r:200, c0:'rgba(250,215,205,0.5)',  c1:'rgba(250,215,205,0)' },
    { x:820, y:250, r:220, c0:'rgba(248,200,190,0.5)',  c1:'rgba(248,200,190,0)' }
  ];
  splats.forEach(s => {
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, s.c0);
    g.addColorStop(1, s.c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  const fade = ctx.createLinearGradient(0, H - 90, 0, H);
  fade.addColorStop(0, 'rgba(255,255,255,0)');
  fade.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - 90, W, 90);
}

function drawInvoiceTag(ctx, x, y){
  const text = 'Invoice';
  const fontSize = 54;
  ctx.font = '400 ' + fontSize + 'px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(text);
  const padX = 44;
  const boxW = m.width + padX * 2;
  const boxH = fontSize + 44;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + boxW / 2 - m.width / 2, y + boxH / 2 + 2);
}

function drawBusinessName(ctx, rightX, yMain, ySub, name){
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const full = String(name || 'Business').trim();
  const words = full.split(/\s+/);
  const main = (words[0] || '').toUpperCase();
  const rest = words.slice(1).join(' ').toUpperCase();
  ctx.fillStyle = '#0f172a';
  ctx.font = '500 60px "Playfair Display", Georgia, "Times New Roman", serif';
  ctx.fillText(main, rightX, yMain);
  if (rest){
    ctx.font = '400 22px Inter, system-ui, sans-serif';
    const spacing = 8;
    const w = measureLetterSpaced(ctx, rest, spacing);
    drawLetterSpaced(ctx, rest, rightX - w, ySub, spacing);
  }
}

function renderBillCanvas(bill, customer, settings){
  const SCALE = 2;
  const W = 1080;
  const PAD = 60;
  const HEADER_H = 320;

  const colRatios = [0.40, 0.18, 0.17, 0.25];
  const xs = [0];
  colRatios.forEach(r => xs.push(xs[xs.length - 1] + r * W));

  const items = bill.items || [];
  const itemRowH = 64;
  const minBodyH = 220;
  const bodyH = Math.max(minBodyH, items.length * itemRowH + 20);
  const tableHeaderH = 60;
  const totalRowH = 52;
  const paidRows = Number(bill.paid) > 0 ? 2 : 0;
  const totalsRows = 2 + paidRows;
  const totalsH = totalRowH * totalsRows;

  const infoY = HEADER_H + 70;
  const infoBlockH = 110;
  const tableY = infoY + infoBlockH + 20;
  const tableEndY = tableY + tableHeaderH + bodyH + totalsH;

  const hasNotes = bill.notes && String(bill.notes).trim().length > 0;
  const notesH = hasNotes ? 180 : 0;
  const notesY = hasNotes ? tableEndY + 50 : 0;
  const H = hasNotes ? notesY + notesH + 60 : tableEndY + 60;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  drawHeaderBg(ctx, W, HEADER_H);
  drawInvoiceTag(ctx, PAD, 160);
  drawBusinessName(ctx, W - PAD, 210, 250, settings.businessName || 'Business');

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 18px Inter, system-ui, sans-serif';
  ctx.fillText('BILLED TO', PAD, infoY);
  ctx.font = '500 26px Inter, system-ui, sans-serif';
  ctx.fillText(customer.name || '', PAD, infoY + 42);
  ctx.fillStyle = '#64748b';
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText(customer.phone || '', PAD, infoY + 76);

  const dateX = W - PAD;
  const seq = bill.seq ? String(bill.seq).padStart(4, '0') : '0001';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 18px Inter, system-ui, sans-serif';
  ctx.fillText('Date', dateX - 150, infoY);
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText(fmtDate(bill.date), dateX, infoY);
  ctx.font = '700 18px Inter, system-ui, sans-serif';
  ctx.fillText('Invoice', dateX - 150, infoY + 34);
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText('#' + seq, dateX, infoY + 34);

  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, tableY, W, tableHeaderH);
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const headers = ['ITEM', 'PRICE', 'QTY.', 'AMOUNT'];
  for (let i = 0; i < 4; i++){
    ctx.fillText(headers[i], (xs[i] + xs[i + 1]) / 2, tableY + tableHeaderH / 2 + 1);
  }

  const bodyY = tableY + tableHeaderH;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, bodyY, W, bodyH);

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++){
    ctx.beginPath();
    ctx.moveTo(xs[i], bodyY);
    ctx.lineTo(xs[i], bodyY + bodyH + totalsH);
    ctx.stroke();
  }

  items.forEach((it, i) => {
    const ry = bodyY + i * itemRowH + itemRowH / 2;
    ctx.fillStyle = '#0f172a';
    ctx.font = '400 20px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(truncateText(ctx, it.name, xs[1] - 60), 30, ry);
    ctx.textAlign = 'right';
    ctx.fillText(fmtINR(it.price), xs[2] - 20, ry);
    ctx.textAlign = 'center';
    ctx.fillText(String(it.qty), (xs[2] + xs[3]) / 2, ry);
    ctx.textAlign = 'right';
    ctx.fillText(fmtINR(it.qty * it.price), W - 30, ry);
    if (i < items.length - 1){
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(0, bodyY + (i + 1) * itemRowH);
      ctx.lineTo(W, bodyY + (i + 1) * itemRowH);
      ctx.stroke();
    }
  });

  const totalsY = bodyY + bodyH;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, totalsY, W, totalsH);

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, totalsY);
  ctx.lineTo(W, totalsY);
  ctx.stroke();

  for (let r = 1; r < totalsRows; r++){
    ctx.beginPath();
    ctx.moveTo(0, totalsY + r * totalRowH);
    ctx.lineTo(W, totalsY + r * totalRowH);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(0, totalsY + totalsH);
  ctx.lineTo(W, totalsY + totalsH);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, tableY);
  ctx.lineTo(0, totalsY + totalsH);
  ctx.moveTo(W, tableY);
  ctx.lineTo(W, totalsY + totalsH);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'right';
  ctx.font = '400 20px Inter, system-ui, sans-serif';
  ctx.fillText('Outstanding', xs[3] - 20, totalsY + totalRowH / 2);
  ctx.fillText(fmtINR(bill.oldBalance || 0), W - 30, totalsY + totalRowH / 2);

  const gtIndex = paidRows > 0 ? 1 : 1;
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  ctx.fillText('Grand Total', xs[3] - 20, totalsY + gtIndex * totalRowH + totalRowH / 2);
  ctx.font = '700 22px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(fmtINR(bill.grandTotal || 0), W - 30, totalsY + gtIndex * totalRowH + totalRowH / 2);

  if (paidRows > 0){
    const py = totalsY + 2 * totalRowH + totalRowH / 2;
    ctx.font = '400 20px Inter, system-ui, sans-serif';
    ctx.fillText('Paid today', xs[3] - 20, py);
    ctx.fillText(fmtINR(bill.paid), W - 30, py);
    const ny = totalsY + 3 * totalRowH + totalRowH / 2;
    const nb = (Number(bill.grandTotal)||0) - (Number(bill.paid)||0);
    ctx.font = '700 20px Inter, system-ui, sans-serif';
    ctx.fillText('New balance', xs[3] - 20, ny);
    ctx.font = '700 22px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(fmtINR(nb), W - 30, ny);
  }

  if (hasNotes){
    ctx.fillStyle = '#fdf2ee';
    ctx.fillRect(PAD, notesY, W - PAD * 2, notesH);
    ctx.fillStyle = '#0f172a';
    ctx.font = '500 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Notes', PAD + 28, notesY + 24);
    ctx.fillStyle = '#475569';
    ctx.font = '400 16px Inter, system-ui, sans-serif';
    const maxTextW = W - PAD * 2 - 56;
    const lines = wrapText(ctx, bill.notes, maxTextW).slice(0, 5);
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD + 28, notesY + 62 + i * 22);
    });
    ctx.textBaseline = 'alphabetic';
  }

  return canvas;
}

function canvasToBlob(canvas){
  return new Promise(resolve => {
    if (canvas.toBlob) canvas.toBlob(resolve, 'image/png');
    else {
      const data = canvas.toDataURL('image/png');
      const bin = atob(data.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type:'image/png' }));
    }
  });
}

async function shareBillImage(bill, customer, settings){
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){}

  const canvas = renderBillCanvas(bill, customer, settings);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Could not render image');

  const filename = 'bill-' + (bill.seq ? String(bill.seq).padStart(4,'0') : 'draft') + '.png';
  const file = new File([blob], filename, { type: 'image/png' });

  const copied = await copyToClipboard(customer.phone || '');
  if (copied) toast('Number copied — pick contact in WhatsApp');
  else toast('Number: ' + (customer.phone || ''));

  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch(e){
      if (e && e.name === 'AbortError') return false;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Image downloaded — attach it in WhatsApp');
  return true;
}