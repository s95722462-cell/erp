// ── 전역 상태 및 변수 ──
let db;
let auth;
let manualLoginInProgress=false; // doLogin()/doRegister()이 진행 중일 때 onAuthStateChanged의 자동 복원 로직과 중복 실행되지 않도록 막는 플래그
let authInitialCheckDone=false; // 페이지 로드 시 최초 로그인 상태 확인이 끝났는지 여부 (끝나기 전까지는 로딩 화면만 표시)
let currentUser=null;
let companies=[];
let activeCoIdx=0;
let cache={customers:[],products:[],sales:[],purchases:[]};
let listeners=[];
let curCur='KRW',curSym='₩';
let itemRows=[];
let editState={col:'',id:'',data:{}};
let aiTarget='customer';
let aiResult={};
let sealImageBase64='';

// ── 테이블 컬럼 설정 ──
const tableCols = {
  daily: [
    { k: 'date', l: '날짜' },
    { k: 'type', l: '구분' },
    { k: 'party', l: '거래처/업체' },
    { k: 'item', l: '품목' },
    { k: 'spec', l: '규격' },
    { k: 'qty', l: '수량', align: 'right' },
    { k: 'unitPrice', l: '단가', align: 'right' },
    { k: 'subtotal', l: '공급가액', align: 'right' },
    { k: 'vat', l: '세액', align: 'right' },
    { k: 'total', l: '합계', align: 'right' },
    { k: 'memo', l: '비고' }
  ],
  sales: [
    { k: 'date', l: '날짜' },
    { k: 'buyer', l: '거래처' },
    { k: 'item', l: '품목명' },
    { k: 'spec', l: '규격/사양' },
    { k: 'qty', l: '수량', align: 'right' },
    { k: 'unitPrice', l: '단가', align: 'right' },
    { k: 'currency', l: '통화' },
    { k: 'subtotal', l: '공급가액', align: 'right' },
    { k: 'vat', l: '세액', align: 'right' },
    { k: 'total', l: '합계', align: 'right' },
    { k: 'invNo', l: '명세서No.' },
    { k: 'memo', l: '비고' }
  ],
  purchase: [
    { k: 'date', l: '날짜' },
    { k: 'vendor', l: '공급업체' },
    { k: 'item', l: '품목명' },
    { k: 'spec', l: '규격/사양' },
    { k: 'qty', l: '수량', align: 'right' },
    { k: 'unitPrice', l: '단가', align: 'right' },
    { k: 'currency', l: '통화' },
    { k: 'subtotal', l: '공급가액', align: 'right' },
    { k: 'vat', l: '세액', align: 'right' },
    { k: 'total', l: '합계', align: 'right' },
    { k: 'invNo', l: '인보이스번호' },
    { k: 'memo', l: '비고' }
  ]
};

let activeCols = {
  daily: ['date', 'type', 'party', 'item', 'spec', 'qty', 'unitPrice', 'subtotal', 'vat', 'total', 'memo'],
  sales: ['date', 'buyer', 'item', 'spec', 'qty', 'unitPrice', 'currency', 'subtotal', 'vat', 'total', 'invNo', 'memo'],
  purchase: ['date', 'vendor', 'item', 'spec', 'qty', 'unitPrice', 'currency', 'subtotal', 'vat', 'total', 'invNo', 'memo']
};

let colOrder = {
  daily: ['date', 'type', 'party', 'item', 'spec', 'qty', 'unitPrice', 'subtotal', 'vat', 'total', 'memo'],
  sales: ['date', 'buyer', 'item', 'spec', 'qty', 'unitPrice', 'currency', 'subtotal', 'vat', 'total', 'invNo', 'memo'],
  purchase: ['date', 'vendor', 'item', 'spec', 'qty', 'unitPrice', 'currency', 'subtotal', 'vat', 'total', 'invNo', 'memo']
};

let colWidths = {};

let currentSettingTable = '';

function loadActiveCols() {
  const savedActive = localStorage.getItem('ierp_active_cols');
  if (savedActive) activeCols = JSON.parse(savedActive);
  
  const savedOrder = localStorage.getItem('ierp_col_order');
  if (savedOrder) {
    const parsedOrder = JSON.parse(savedOrder);
    // 기존 순서에 없는 새로운 컬럼이 tableCols에 추가되었을 경우를 대비해 병합
    for (const tableId in tableCols) {
      if (parsedOrder[tableId]) {
        const allKeys = tableCols[tableId].map(c => c.k);
        const savedKeys = parsedOrder[tableId].filter(k => allKeys.includes(k));
        const missingKeys = allKeys.filter(k => !savedKeys.includes(k));
        colOrder[tableId] = [...savedKeys, ...missingKeys];
      }
    }
  }

  const savedWidths = localStorage.getItem('ierp_col_widths');
  if (savedWidths) colWidths = JSON.parse(savedWidths);
}

window.openColSettings = function(tableId) {
  currentSettingTable = tableId;
  renderColSettingsList();
  document.getElementById('col-modal').style.display = 'flex';

  // SortableJS 적용
  const list = document.getElementById('col-list');
  new Sortable(list, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: function() {
      // 드래그 종료 후 순서 업데이트
      const items = list.querySelectorAll('.col-setting-item');
      colOrder[currentSettingTable] = Array.from(items).map(el => el.getAttribute('data-key'));
    }
  });
};

function renderColSettingsList() {
  const list = document.getElementById('col-list');
  const tableId = currentSettingTable;
  const order = colOrder[tableId];
  const cols = tableCols[tableId];
  const active = activeCols[tableId];
  
  list.innerHTML = order.map((key, idx) => {
    const c = cols.find(item => item.k === key);
    if (!c) return '';
    return `
      <div class="col-setting-item" data-key="${c.k}">
        <span class="drag-handle" style="cursor:grab;color:var(--text3);margin-right:8px">☰</span>
        <label class="chk-item">
          <input type="checkbox" value="${c.k}" ${active.includes(c.k) ? 'checked' : ''}> ${c.l}
        </label>
      </div>
    `;
  }).join('');
}

window.saveColumnSettings = function() {
  const checkboxes = document.querySelectorAll('#col-list input[type="checkbox"]');
  // 체크박스 상태만 업데이트 (순서는 SortableJS의 onEnd에서 이미 업데이트됨)
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  
  if (selected.length === 0) {
    alert('최소 하나 이상의 항목을 선택해야 합니다.');
    return;
  }
  
  activeCols[currentSettingTable] = selected;
  localStorage.setItem('ierp_active_cols', JSON.stringify(activeCols));
  localStorage.setItem('ierp_col_order', JSON.stringify(colOrder));
  
  closeModal('col-modal');
  
  // 새로고침 없이 즉시 반영
  if (currentSettingTable === 'daily') renderDaily();
  if (currentSettingTable === 'sales') renderSales();
  if (currentSettingTable === 'purchase') renderPurchase();
};

// ── HTML 이스케이프 (사용자 입력값을 화면에 표시할 때 XSS 방지용) ──
function escapeHtml(s){
  if(s===null || s===undefined) return '';
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// ── 회사 고유 ID 생성 (배열 인덱스 대신 사용) ──
function genId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'co_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
}
function curCoId(){ return companies[activeCoIdx]?.id; }

// ── 기존(인덱스 기반) 회사 데이터를 고유 ID 기반 경로로 1회성 이전 ──
async function migrateCoIdsIfNeeded(){
  const needsMigration = companies.some(c=>!c.id);
  if(!needsMigration) return;

  const cols=['customers','products','sales','purchases'];
  for(let idx=0; idx<companies.length; idx++){
    if(companies[idx].id) continue; // 이미 ID가 있는 회사(가입 이후 추가분)는 건너뜀
    const newId=genId();
    for(const n of cols){
      const oldRef=db.collection(`users/${currentUser.safeId}/companies/${idx}/${n}`);
      const snap=await oldRef.get();
      if(snap.empty) continue;
      const docs=snap.docs;
      // 500건 제한을 고려해 400건씩 배치 처리
      for(let i=0;i<docs.length;i+=400){
        const chunk=docs.slice(i,i+400);
        const batch=db.batch();
        chunk.forEach(d=>{
          const newRef=db.collection(`users/${currentUser.safeId}/companies/${newId}/${n}`).doc(d.id);
          batch.set(newRef, d.data());
        });
        await batch.commit();
      }
      // 이전 완료 후 기존 인덱스 경로 문서 삭제
      for(let i=0;i<docs.length;i+=400){
        const chunk=docs.slice(i,i+400);
        const batch=db.batch();
        chunk.forEach(d=>{
          batch.delete(db.collection(`users/${currentUser.safeId}/companies/${idx}/${n}`).doc(d.id));
        });
        await batch.commit();
      }
    }
    companies[idx].id=newId;
  }
  await saveUserMeta();
}

// ── 다크 모드 ──
window.toggleDarkMode = function() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('ierp_theme', next);
};

// ── 다이나믹 테이블 렌더링 헬퍼 ──
function renderDynamicTable(tableId, data, tbodyId, extraCellFn) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const table = tbody.closest('table');
  const theadRow = table.querySelector('thead tr');
  const cols = tableCols[tableId];
  const active = activeCols[tableId];
  const order = colOrder[tableId];
  
  // 1. 순서와 활성화 여부에 따라 설정 생성
  const activeConfigs = order
    .filter(key => active.includes(key))
    .map(key => cols.find(c => c.k === key))
    .filter(Boolean);

  // 1. 헤더 생성
  const noWidth = colWidths[tableId + '-_no'];
  const noStyle = noWidth ? `width:${noWidth}px; min-width:${noWidth}px;` : '';
  let headHtml = `<th class="no-col" style="${noStyle}" data-key="_no">No.<div class="resizer no-print"></div></th>`;
  
  activeConfigs.forEach(c => {
    const align = c.align === 'right' ? 'text-align:right' : (c.align === 'center' ? 'text-align:center' : '');
    const savedWidth = colWidths[tableId + '-' + c.k];
    const widthStyle = savedWidth ? `width:${savedWidth}px; min-width:${savedWidth}px;` : '';
    headHtml += `<th style="${align}; ${widthStyle}" data-key="${c.k}">${c.l}<div class="resizer no-print"></div></th>`;
  });
  
  if (extraCellFn) {
    const label = tableId === 'daily' ? '거래명세서' : '관리';
    const actWidth = colWidths[tableId + '-_action'];
    const actStyle = actWidth ? `width:${actWidth}px; min-width:${actWidth}px;` : '';
    headHtml += `<th class="no-print" style="text-align:center; ${actStyle}" data-key="_action">${label}<div class="resizer no-print"></div></th>`;
  }
  theadRow.innerHTML = headHtml;

  // 2. 바디 생성
  if (data.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${activeConfigs.length + 2}">내역이 없습니다</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((r, i) => {
    const noW = colWidths[tableId + '-_no'];
    const noS = noW ? `width:${noW}px; min-width:${noW}px;` : '';
    let rowHtml = `<tr><td class="no-col" style="${noS}">${i + 1}</td>`;
    
    activeConfigs.forEach(c => {
      const align = c.align === 'right' ? 'text-align:right' : (c.align === 'center' ? 'text-align:center' : '');
      const savedWidth = colWidths[tableId + '-' + c.k];
      const widthStyle = savedWidth ? `width:${savedWidth}px; min-width:${savedWidth}px;` : '';
      let val = r[c.k] || '';
      
      // 데이터 필드 매핑 보정 (일별현황 등에서 사용)
      if (tableId === 'daily') {
        if (c.k === 'party') val = r.buyer || r.customer || r.vendor || '';
        if (c.k === 'item') val = r.item || r.summary || '';
      }

      // 사용자 입력 문자열은 화면에 넣기 전에 이스케이프 (XSS 방지)
      if (typeof val === 'string') val = escapeHtml(val);

      // 특수 처리
      if (c.k === 'type') {
        const tagClass = r._t === '매출' ? 'tag-sale' : 'tag-buy';
        val = `<span class="tag ${tagClass}">${r._t}</span>`;
      } else if (['unitPrice', 'subtotal', 'vat', 'total'].includes(c.k)) {
        val = fmt(val, r.currency);
      } else if (c.k === 'qty') {
        val = val ? Number(val).toLocaleString() : '—';
      } else if (['item', 'party', 'buyer', 'vendor', 'name'].includes(c.k)) {
        if ((tableId === 'sales' && c.k === 'buyer') || (tableId === 'purchase' && c.k === 'vendor')) {
          val = `<strong class="party-link" onclick="filterByParty('${tableId}', this)" title="클릭하면 이 거래처 내역만 보기" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${val}</strong>`;
        } else {
          val = `<strong>${val}</strong>`;
        }
      } else if (c.k === 'spec' || c.k === 'memo' || c.k === 'invNo') {
        val = `<span style="color:var(--text2)">${val}</span>`;
      }
      
      rowHtml += `<td style="${align}; ${widthStyle}">${val}</td>`;
    });
    
    if (extraCellFn) {
      const actW = colWidths[tableId + '-_action'];
      const actS = actW ? `width:${actW}px; min-width:${actW}px;` : '';
      rowHtml += `<td class="no-print" style="${actS} text-align:center;">${extraCellFn(r)}</td>`;
    }
    rowHtml += '</tr>';
    return rowHtml;
  }).join('');

  // 드래그 리사이즈 이벤트 바인딩
  initResizableTable(table, tableId);
}

function initResizableTable(table, tableId) {
  const cols = table.querySelectorAll('th');
  [].forEach.call(cols, (col) => {
    const resizer = col.querySelector('.resizer');
    if (!resizer) return;

    let x = 0;
    let w = 0;

    const mouseDownHandler = (e) => {
      x = e.clientX;
      const styles = window.getComputedStyle(col);
      w = parseInt(styles.width, 10);

      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
      resizer.classList.add('resizing');
    };

    const mouseMoveHandler = (e) => {
      const dx = e.clientX - x;
      const newWidth = w + dx;
      if (newWidth > 30) {
        col.style.width = `${newWidth}px`;
        col.style.minWidth = `${newWidth}px`;
        
        // 해당 열의 모든 td도 너비 맞춤
        const colIndex = Array.from(col.parentNode.children).indexOf(col);
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cell = row.children[colIndex];
          if (cell) {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
          }
        });
      }
    };

    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      resizer.classList.remove('resizing');
      
      // 너비 저장
      const key = col.getAttribute('data-key');
      if (key) {
        colWidths[tableId + '-' + key] = parseInt(col.style.width, 10);
        localStorage.setItem('ierp_col_widths', JSON.stringify(colWidths));
      }
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
  });
}

function initApp(){
  if(typeof firebase === 'undefined'){
    setTimeout(initApp, 50);
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey:"AIzaSyBDHcZU2eD1l36tBmaOg-4arzVJtSSwh2Y",
      authDomain:"erp-ai-796dc.firebaseapp.com",
      projectId:"erp-ai-796dc",
      storageBucket:"erp-ai-796dc.firebasestorage.app",
      messagingSenderId:"682023475434",
      appId:"1:682023475434:web:eb05b4797005622af15f93"
    });
  }
  db = firebase.firestore();
  auth = firebase.auth();

  // 초기화 후 실행할 작업들
  loadActiveCols();
  loadSavedLogin();
  
  // 테마 초기화
  const savedTheme = localStorage.getItem('ierp_theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);

  // 새로고침 시 Firebase Auth 세션이 남아있다면 비밀번호 재입력 없이 자동 로그인 복원
  // (기존처럼 localStorage에 평문 비밀번호를 저장해두는 방식은 사용하지 않음)
  auth.onAuthStateChanged(async (user) => {
    if (manualLoginInProgress) return; // doLogin()이 직접 처리 중이면 중복 실행 방지
    if (user && !currentUser) {
      try {
        const emailLower = (user.email || '').toLowerCase();
        if (!emailLower) return;
        // Firebase가 이메일을 소문자로 저장하므로, 원래(대소문자가 섞인) 안전문자열은
        // 로그인할 때마다 저장해둔 색인(emailIndex)에서 찾아야 정확합니다.
        let safeId;
        const idxSnap = await db.collection('emailIndex').doc(emailLower).get();
        if (idxSnap.exists) {
          safeId = idxSnap.data().safeId;
        } else {
          // 색인이 아직 없는 경우(이 코드 배포 전에 로그인한 세션) - 이메일 앞부분을 그대로 시도 (소문자 전용 아이디만 해당)
          safeId = emailLower.split('@')[0];
        }
        if (!safeId) return;
        const snap = await db.collection('users').doc(safeId).get();
        if (!snap.exists) { await auth.signOut(); return; }
        const data = snap.data();
        // 색인이 없어서 방금 새로 만든 경우를 대비해 갱신(다음 새로고침부터는 색인으로 바로 찾음)
        if (!idxSnap.exists) {
          db.collection('emailIndex').doc(emailLower).set({ safeId }).catch(() => {});
        }
        currentUser = { id: data.displayId || safeId, safeId, ...data };
        companies = data.companies || [{ company: data.company || '', bizno: data.bizno || '', ceo: data.ceo || '', biztype: data.biztype || '', bizitem: data.bizitem || '', tel: data.tel || '', fax: data.fax || '', email: data.email || '', addr: data.addr || '', bank: data.bank || '', account: data.account || '', accountname: data.accountname || '', terms: data.terms || '', footer: data.footer || '' }];
        activeCoIdx = data.activeCoIdx || 0;
        await migrateCoIdsIfNeeded();
        afterLogin();
      } catch (e) {
        console.error('자동 로그인 복원 실패:', e);
      }
    }
    // 최초 1회(페이지 로드 시 인증 상태 확인)만 로딩 화면을 내림 — 그 이후의 로그인/로그아웃 전환은
    // doLogin/doRegister/doLogout이 각자 화면 전환을 처리하므로 여기서 건드리지 않음
    if (!authInitialCheckDone) {
      authInitialCheckDone = true;
      const boot = document.getElementById('boot-loading');
      if (boot) boot.style.display = 'none';
      if (!currentUser) {
        document.getElementById('login-screen').style.display = 'flex';
      }
    }
  });

  // 네트워크가 느려 인증 상태 확인 자체가 지연되는 경우를 대비한 안전장치
  setTimeout(() => {
    if (!authInitialCheckDone) {
      authInitialCheckDone = true;
      const boot = document.getElementById('boot-loading');
      if (boot) boot.style.display = 'none';
      if (!currentUser) {
        document.getElementById('login-screen').style.display = 'flex';
      }
    }
  }, 6000);
}

// ── 상태 ──
function setSynced(){
  const dot=document.getElementById('sync-dot');
  const lbl=document.getElementById('sync-label');
  if(dot) dot.classList.remove('off');
  if(lbl) lbl.textContent='실시간 동기화 중';
}
function setOffline(){
  const dot=document.getElementById('sync-dot');
  const lbl=document.getElementById('sync-label');
  if(dot) dot.classList.add('off');
  if(lbl) lbl.textContent='오프라인';
}

// ── 숫자 포맷 헬퍼 ──
function rawNum(s){ return parseFloat(String(s).replace(/,/g,''))||0; }
function fmt(n){ return '₩'+Math.round(n||0).toLocaleString(); }
function today(){ return new Date().toISOString().slice(0,10); }
function simpleHash(s){ let h=0; for(let c of s){h=(h<<5)-h+c.charCodeAt(0);h|=0;} return h.toString(36); }

function getNextProductCode() {
  if (!cache.products || cache.products.length === 0) return 'P0001';
  let maxNum = 0;
  cache.products.forEach(p => {
    const code = p.code || '';
    const match = code.match(/^P(\d+)$/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  });
  return 'P' + String(maxNum + 1).padStart(4, '0');
}

// 1,000단위 포맷 입력
window.fmtInput=function(el){
  const raw=String(el.value).replace(/,/g,'');
  if(raw===''||isNaN(raw)) return;
  el.value=parseFloat(raw).toLocaleString();
};

// ── 매출/매입 품목 자동입력 ──
window.fillSaleProduct=function(sel){
  const opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value) return;
  document.getElementById('sale-item').value=opt.getAttribute('data-name')||'';
  document.getElementById('sale-spec').value=opt.getAttribute('data-spec')||'';
  document.getElementById('sale-price').value=Number(opt.getAttribute('data-price')||0).toLocaleString();
  calcSale();
};
window.fillBuyProduct=function(sel){
  const opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value) return;
  document.getElementById('buy-item').value=opt.getAttribute('data-name')||'';
  document.getElementById('buy-spec').value=opt.getAttribute('data-spec')||'';
  calcBuy();
};
window.calcSale=function(){
  const qty=rawNum(document.getElementById('sale-qty').value);
  const price=rawNum(document.getElementById('sale-price').value);
  const cur=document.getElementById('sale-cur').value;
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const total=sub+vat;
  document.getElementById('sale-subtotal').value=Math.round(sub).toLocaleString();
  document.getElementById('sale-vat').value=vat?Math.round(vat).toLocaleString():'0';
  document.getElementById('sale-total-disp').value=Math.round(total).toLocaleString();
};
window.calcBuy=function(){
  const qty=rawNum(document.getElementById('buy-qty').value);
  const price=rawNum(document.getElementById('buy-price').value);
  const cur=document.getElementById('buy-cur').value;
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const total=sub+vat;
  document.getElementById('buy-subtotal').value=Math.round(sub).toLocaleString();
  document.getElementById('buy-vat').value=vat?Math.round(vat).toLocaleString():'0';
  document.getElementById('buy-total-disp').value=Math.round(total).toLocaleString();
};

// ── 로그인/회원가입 ──
function loadSavedLogin(){
  const sid=localStorage.getItem('ierp_saved_id');
  const auto=localStorage.getItem('ierp_auto_login');
  if(sid){document.getElementById('l-id').value=sid;document.getElementById('save-id').checked=true;}
  if(auto==='1'){document.getElementById('auto-login').checked=true;}
  // 실제 자동 로그인 복원은 initApp()의 auth.onAuthStateChanged에서 Firebase Auth 세션으로 처리됩니다.
  // (예전처럼 비밀번호를 localStorage에 평문으로 저장해두지 않습니다.)
}
window.switchTab=function(t,btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.getElementById('form-login').style.display=t==='login'?'block':'none';
  document.getElementById('form-register').style.display=t==='register'?'block':'none';
};

function authEmailOf(safeId){ return safeId+'@ierp.local'; }

window.doLogin=async function(){
  if(!db||!auth){ alert("시스템 초기화 중입니다. 잠시만 기다려주세요."); return; }
  const id=document.getElementById('l-id').value;
  const pw=document.getElementById('l-pw').value;
  const err=document.getElementById('login-err');
  err.textContent='';
  if(!id||!pw){err.textContent='아이디와 비밀번호를 입력하세요';return;}
  const safeId=btoa(encodeURIComponent(id)).replace(/[^a-zA-Z0-9]/g,'_');
  const email=authEmailOf(safeId);
  const keepLoggedIn=document.getElementById('auto-login').checked;
  manualLoginInProgress=true;
  try{
    await auth.setPersistence(keepLoggedIn?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);

    let signedIn=false;
    try{
      await auth.signInWithEmailAndPassword(email,pw);
      signedIn=true;
    }catch(authErr){
      // Firebase 최신 버전은 보안상 "존재하지 않는 계정"과 "비밀번호 틀림"을 구분하지 않고
      // auth/invalid-credential(또는 auth/invalid-login-credentials) 하나로 묶어서 반환하기도 합니다.
      // 그래서 에러 코드만으로 판단하지 않고, 아래 Firestore 조회 결과로 실제 상태를 확인합니다.
      if(authErr.code==='auth/too-many-requests'){err.textContent='잠시 후 다시 시도해 주세요';return;}
      if(authErr.code==='auth/network-request-failed'){err.textContent='네트워크 연결을 확인해 주세요';return;}
    }

    let snap;
    try{
      snap=await db.collection('users').doc(safeId).get();
    }catch(readErr){
      if(readErr.code==='permission-denied'){
        // 이미 Firebase Authentication으로 전환된 계정인데 비밀번호가 틀린 경우
        // (전환 완료된 계정은 규칙상 인증 성공 전엔 문서를 읽을 수 없으므로 이 상황 자체가 곧 비밀번호 오류를 의미함)
        err.textContent='비밀번호가 틀렸습니다';return;
      }
      throw readErr;
    }
    if(!snap.exists){err.textContent='아이디가 존재하지 않습니다';return;}
    const data=snap.data();

    // 새로고침 시 자동 로그인 복원을 위한 색인 갱신 (Firebase가 이메일을 소문자로 바꿔버리기 때문에,
    // 복원 시점엔 "소문자 이메일 → 원래 대소문자가 섞인 안전문자열"을 이 색인에서 찾아야 함)
    try{ await db.collection('emailIndex').doc(email.toLowerCase()).set({safeId}); }
    catch(idxErr){ console.error('이메일 색인 저장 실패:', idxErr); }

    if(!signedIn){
      if(!data.pw){
        // 이미 전환된 계정인데 로그인에 실패한 경우 → 비밀번호가 틀린 것
        err.textContent='비밀번호가 틀렸습니다';return;
      }
      // 레거시(평문 비밀번호를 취약한 해시로만 비교하던 구 방식) 계정 검증
      if(data.pw!==simpleHash(pw)){err.textContent='비밀번호가 틀렸습니다';return;}
      // 검증 통과 → 이번 로그인을 계기로 Firebase Authentication 계정으로 자동 전환
      try{
        await auth.createUserWithEmailAndPassword(email,pw);
      }catch(createErr){
        if(createErr.code==='auth/email-already-in-use'){err.textContent='비밀번호가 틀렸습니다';return;}
        throw createErr;
      }
      // 더 이상 필요 없는 레거시 비밀번호 해시는 제거
      await db.collection('users').doc(safeId).update({pw:firebase.firestore.FieldValue.delete()});
    }

    if(document.getElementById('save-id').checked) localStorage.setItem('ierp_saved_id',id);
    else localStorage.removeItem('ierp_saved_id');
    if(keepLoggedIn) localStorage.setItem('ierp_auto_login','1');
    else localStorage.removeItem('ierp_auto_login');
    // 예전 버전에서 남아있을 수 있는 평문 비밀번호 흔적 정리
    localStorage.removeItem('ierp_pw');
    localStorage.removeItem('ierp_uid');

    currentUser={id,safeId,...data};
    companies=data.companies||[{company:data.company||'',bizno:data.bizno||'',ceo:data.ceo||'',biztype:data.biztype||'',bizitem:data.bizitem||'',tel:data.tel||'',fax:data.fax||'',email:data.email||'',addr:data.addr||'',bank:data.bank||'',account:data.account||'',accountname:data.accountname||'',terms:data.terms||'',footer:data.footer||''}];
    activeCoIdx=data.activeCoIdx||0;
    await migrateCoIdsIfNeeded();
    afterLogin();
  }catch(e){err.textContent='오류: '+e.message;}
  finally{ manualLoginInProgress=false; }
};

window.doRegister=async function(){
  if(!db||!auth){ alert("시스템 초기화 중입니다. 잠시만 기다려주세요."); return; }
  const id=document.getElementById('r-id').value;
  const pw=document.getElementById('r-pw').value;
  const pw2=document.getElementById('r-pw2').value;
  const company=document.getElementById('r-company').value.trim();
  const err=document.getElementById('reg-err');
  err.textContent='';
  if(!id||!pw||!company){err.textContent='아이디, 비밀번호, 상호명은 필수입니다';return;}
  if(pw.length<6){err.textContent='비밀번호는 6자 이상이어야 합니다';return;}
  if(pw!==pw2){err.textContent='비밀번호가 일치하지 않습니다';return;}
  const safeId=btoa(encodeURIComponent(id)).replace(/[^a-zA-Z0-9]/g,'_');
  const email=authEmailOf(safeId);
  manualLoginInProgress=true;
  try{
    const snap=await db.collection('users').doc(safeId).get();
    if(snap.exists){err.textContent='이미 사용 중인 아이디입니다';return;}
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    try{
      await auth.createUserWithEmailAndPassword(email,pw);
    }catch(createErr){
      if(createErr.code==='auth/email-already-in-use'){err.textContent='이미 사용 중인 아이디입니다';return;}
      throw createErr;
    }
    const co={
      company,
      bizno:document.getElementById('r-bizno').value,
      ceo:document.getElementById('r-ceo').value,
      biztype:document.getElementById('r-biztype')?.value||'',
      bizitem:document.getElementById('r-bizitem')?.value||'',
      tel:document.getElementById('r-tel').value,
      email:document.getElementById('r-email')?.value||'',
      addr:document.getElementById('r-addr').value,
      fax:'',bank:'',account:'',accountname:'',terms:'',footer:'',id:genId()
    };
    // 비밀번호는 Firebase Authentication이 관리하므로 Firestore 문서에는 저장하지 않음
    const ud={displayId:id,companies:[co],activeCoIdx:0,createdAt:new Date().toISOString()};
    await db.collection('users').doc(safeId).set(ud);
    // 새로고침 시 자동 로그인 복원을 위한 색인 저장
    try{ await db.collection('emailIndex').doc(email.toLowerCase()).set({safeId}); }
    catch(idxErr){ console.error('이메일 색인 저장 실패:', idxErr); }
    currentUser={id,safeId,...ud};
    companies=[co];activeCoIdx=0;
    afterLogin();
  }catch(e){err.textContent='오류: '+e.message;}
  finally{ manualLoginInProgress=false; }
};

window.doLogout=async function(){
  try{ await auth.signOut(); }catch(e){ /* 무시 */ }
  listeners.forEach(u=>u());listeners=[];
  cache={customers:[],products:[],sales:[],purchases:[]};currentUser=null;companies=[];
  document.getElementById('main-app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('l-pw').value='';document.getElementById('login-err').textContent='';
};

function afterLogin(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='flex';
  document.getElementById('user-badge').textContent=currentUser.displayId||currentUser.id;
  document.getElementById('inv-date').value=today();
  document.getElementById('buy-date').value=today();
  document.getElementById('sale-date').value=today();
  document.getElementById('s-uid').value=currentUser.displayId||currentUser.id;
  updateCompanySwitcher();
  renderCompanyCards();
  loadSettingsToForm();
  loadSealForActiveCo();
  initMobileUI(); // 모바일 UI 설정 초기화
  startListeners();

  // 드물게 로그인 직후 최초 연결이 지연되는 경우가 있어(원인 불명확),
  // 몇 초 뒤에도 계속 "연결 중..."이면 회사를 재선택한 것과 동일하게 리스너를 자동으로 다시 연결 시도
  [4000, 8000, 12000].forEach(delay=>{
    setTimeout(()=>{
      const lbl=document.getElementById('sync-label');
      if(lbl && lbl.textContent==='연결 중...' && currentUser){
        startListeners();
      }
    }, delay);
  });
}

// ── 회사 전환 ──
function updateCompanySwitcher(){
  const sel=document.getElementById('active-company-sel');
  sel.innerHTML=companies.map((c,i)=>`<option value="${i}"${i===activeCoIdx?' selected':''}>${escapeHtml(c.company||'회사'+(i+1))}</option>`).join('');
}
window.switchCompany=function(idx){
  activeCoIdx=parseInt(idx);
  saveUserMeta();
  loadSettingsToForm(); // 도장 포함 로드
  renderCompanyCards();
  updateCompanySwitcher();
  loadSealForActiveCo(); // 회사별 도장 전환
  startListeners();
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-dash').classList.add('active');
  document.querySelectorAll(`[onclick*="goto('dash'"]`).forEach(b=>b.classList.add('active'));
  alert(`✅ "${companies[activeCoIdx]?.company||'회사'}"로 전환되었습니다!\n해당 회사 데이터를 불러오는 중...`);
};
function getActiveCo(){ return companies[activeCoIdx]||{}; }

function renderCompanyCards(){
  const list=document.getElementById('company-cards-list');
  if(!list) return;
  let html=companies.map((c,i)=>`
    <div class="company-card${i===activeCoIdx?' active-co':''}" onclick="switchCompany(${i})">
      ${i===activeCoIdx?'<div class="co-badge">사용 중</div>':''}
      <div class="co-name">${c.company||'(이름 없음)'}</div>
      <div class="co-biz">사업자번호: ${c.bizno||'—'}</div>
      <div class="co-biz">대표자: ${c.ceo||'—'}</div>
      <div class="co-actions">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();editCoInSettings(${i})">편집</button>
        ${companies.length>1?`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCoByIdx(${i})">삭제</button>`:''}
      </div>
    </div>`).join('');
  if(companies.length<5){
    html+=`<div class="add-company-card" onclick="openAddCoModal()">＋ 회사 추가 (${companies.length}/5)</div>`;
  }
  list.innerHTML=html;

  // 편집 셀렉트 업데이트
  const sel=document.getElementById('s-co-sel');
  if(sel) sel.innerHTML='<option value="">— 선택 —</option>'+companies.map((c,i)=>`<option value="${i}">${escapeHtml(c.company||'회사'+(i+1))}</option>`).join('');
}

window.editCoInSettings=function(idx){
  document.getElementById('s-co-sel').value=idx;
  loadCoToForm(idx);
  document.getElementById('co-form-wrap').style.display='block';
  document.getElementById('panel-settings').scrollIntoView({behavior:'smooth'});
  document.querySelector('.nav-btn:last-child').click();
};

window.loadCoToForm=function(idx){
  if(idx===''){document.getElementById('co-form-wrap').style.display='none';return;}
  document.getElementById('co-form-wrap').style.display='block';
  const c=companies[parseInt(idx)]||{};
  const fields=['company','bizno','ceo','biztype','bizitem','tel','fax','email','addr','bank','account','accountname'];
  fields.forEach(f=>{const el=document.getElementById('s-'+f);if(el)el.value=c[f]||'';});
};

window.saveCoInfo=async function(){
  const idx=parseInt(document.getElementById('s-co-sel').value);
  if(isNaN(idx)){alert('편집할 회사를 선택하세요');return;}
  const fields=['company','bizno','ceo','biztype','bizitem','tel','fax','email','addr','bank','account','accountname'];
  const co={...companies[idx]};
  fields.forEach(f=>{const el=document.getElementById('s-'+f);if(el)co[f]=el.value;});
  companies[idx]=co;
  await saveUserMeta();
  updateCompanySwitcher();
  renderCompanyCards();
  alert('✅ 회사 정보가 저장되었습니다!');};

async function deleteCoData(coId){
  if(!coId) return; // ID가 없는(마이그레이션 전) 회사는 건드리지 않음
  const cols=['customers','products','sales','purchases'];
  for(const n of cols){
    const ref=db.collection(`users/${currentUser.safeId}/companies/${coId}/${n}`);
    const snap=await ref.get();
    for(let i=0;i<snap.docs.length;i+=400){
      const batch=db.batch();
      snap.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));
      await batch.commit();
    }
  }
}

window.deleteCoByIdx=async function(idx){
  if(!confirm(`"${companies[idx]?.company||'이 회사'}"를 삭제하시겠습니까? 등록된 매출/매입/거래처 데이터도 함께 삭제됩니다.`)) return;
  const removedId=companies[idx]?.id;
  companies.splice(idx,1);
  if(activeCoIdx>=companies.length) activeCoIdx=companies.length-1;
  await saveUserMeta();
  await deleteCoData(removedId);
  updateCompanySwitcher();
  renderCompanyCards();
};

window.deleteCoInfo=async function(){
  const idx=parseInt(document.getElementById('s-co-sel').value);
  if(isNaN(idx)){alert('삭제할 회사를 선택하세요');return;}
  await deleteCoByIdx(idx);
  document.getElementById('co-form-wrap').style.display='none';
  document.getElementById('s-co-sel').value='';
};

function openAddCoModal(){
  if(companies.length>=5){alert('회사는 최대 5개까지 등록할 수 있습니다');return;}
  ['nc-company','nc-bizno','nc-ceo','nc-biztype','nc-bizitem','nc-tel','nc-fax','nc-email','nc-addr','nc-bank'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('addco-modal').style.display='flex';
}
window.openAddCoModal=openAddCoModal;

window.saveNewCompany=async function(){
  const company=document.getElementById('nc-company').value.trim();
  if(!company){alert('상호명을 입력하세요');return;}
  const co={
    company,bizno:document.getElementById('nc-bizno').value,
    ceo:document.getElementById('nc-ceo').value,
    biztype:document.getElementById('nc-biztype').value,
    bizitem:document.getElementById('nc-bizitem').value,
    tel:document.getElementById('nc-tel').value,
    fax:document.getElementById('nc-fax').value,
    email:document.getElementById('nc-email').value,
    addr:document.getElementById('nc-addr').value,
    bank:document.getElementById('nc-bank').value,
    account:'',accountname:'',terms:'',footer:'',id:genId()
  };
  companies.push(co);
  await saveUserMeta();
  updateCompanySwitcher();
  renderCompanyCards();
  closeModal('addco-modal');
  alert(`✅ "${company}" 회사가 추가되었습니다!`);
};

async function saveUserMeta(){
  await db.collection('users').doc(currentUser.safeId).update({companies,activeCoIdx});
}

// ── Firebase 리스너 ──
// 회사별 데이터 경로: users/{uid}/companies/{coIdx}/{collection}
function colPath(n){return db.collection(`users/${currentUser.safeId}/companies/${curCoId()}/${n}`);}
async function addToCol(n,d){return await colPath(n).add({...d,createdAt:firebase.firestore.FieldValue.serverTimestamp()});}
async function delFromCol(n,id){await db.collection(`users/${currentUser.safeId}/companies/${curCoId()}/${n}`).doc(id).delete();}
async function updFromCol(n,id,d){await db.collection(`users/${currentUser.safeId}/companies/${curCoId()}/${n}`).doc(id).update(d);}

function startListeners(){
  // 기존 리스너 해제
  listeners.forEach(u=>u());
  listeners=[];
  cache={customers:[],products:[],sales:[],purchases:[]};

  const listen=(n,k,cb)=>{
    const u=db.collection(`users/${currentUser.safeId}/companies/${curCoId()}/${n}`)
      .orderBy('createdAt','desc').onSnapshot(snap=>{
        cache[k]=snap.docs.map(d=>({id:d.id,...d.data()}));setSynced();cb();
      },()=>setOffline());
    listeners.push(u);
  };
  listen('customers','customers',()=>{
    renderCustomers();
    populateSelects();
    renderDash();
    renderSidebar('sale');
    renderSidebar('buy');
    renderSidebar('inv');
    renderSidebar('cust');
  });
  listen('products','products',()=>{renderProducts();renderStock();renderDash();});
  listen('sales','sales',()=>{renderSales();renderStock();renderDash();});
  listen('purchases','purchases',()=>{renderPurchase();renderStock();renderDash();});
}

// ── 탭 ──
window.goto=function(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn,.bnav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  if(btn) btn.classList.add('active');
  // 상단/하단 네비 동시 active
  document.querySelectorAll(`[onclick*="goto('${id}'"]`).forEach(b=>b.classList.add('active'));

  // 모바일일 경우 등록 카드를 기본적으로 접음
  if (isMobile()) {
    const regCards = ['card-sale-reg', 'card-buy-reg', 'card-cust-reg', 'card-prod-reg'];
    regCards.forEach(cardId => {
      const card = document.getElementById(cardId);
      if (card) card.classList.add('collapsed');
    });
  }

  // FAB 표시
  const fabTabs=['sales','purchase','customers','products'];
  const fab=document.getElementById('fab-btn');
  if(fab) fab.classList[fabTabs.includes(id)?'add':'remove']('active-fab');
  
  // 하단 고정 버튼 제어
  document.querySelectorAll('.fixed-save-btn').forEach(b => b.classList.remove('active'));
  if (id === 'sales') document.getElementById('fixed-save-sale').classList.add('active');
  if (id === 'purchase') document.getElementById('fixed-save-buy').classList.add('active');

  if(id==='dash') renderDash();
  if(id==='sales'){
    renderSales();
    populateSelects();
    renderSidebar('sale');
    if(!document.getElementById('sale-date').value) document.getElementById('sale-date').value = today();
    const sTbody = document.getElementById('sale-items-tbody');
    if(sTbody && sTbody.rows.length === 0) addErpRow('sale');
  }
  if(id==='purchase'){
    renderPurchase();
    renderSidebar('buy');
    if(!document.getElementById('buy-date').value) document.getElementById('buy-date').value = today();
    const bTbody = document.getElementById('buy-items-tbody');
    if(bTbody && bTbody.rows.length === 0) addErpRow('buy');
  }
  if(id==='customers'){
    renderCustomers();
    renderSidebar('cust');
  }
  if(id==='products') {
    renderProducts();
    const pCodeEl = document.getElementById('p-code');
    if(pCodeEl && !pCodeEl.value) pCodeEl.value = getNextProductCode();
  }
  if(id==='stock') renderStock();
  if(id==='invoice') {
    populateSelects();
    renderSidebar('inv');
    if(!document.getElementById('inv-date').value) document.getElementById('inv-date').value = today();
    const iTbody = document.getElementById('inv-items-tbody');
    if(iTbody && iTbody.rows.length === 0) addErpRow('inv');
  }
  if(id==='daily'){populateSelects();initDaily();}
  if(id==='settings'){loadSettingsToForm();renderCompanyCards();}
};

window.toggleCard = function(id) {
  const card = document.getElementById(id);
  if (card) card.classList.toggle('collapsed');
};

// ── 대시보드 ──
let trendChart = null;
let ratioChart = null;

function renderDash(){
  const s=cache.sales,p=cache.purchases;
  // total 없을 경우 subtotal+vat 또는 subtotal로 보완
  const getTotal=r=>r.total||((r.subtotal||0)+(r.vat||0))||r.subtotal||0;
  const ts=s.filter(r=>r.currency==='KRW').reduce((a,r)=>a+getTotal(r),0);
  const tp=p.filter(r=>r.currency==='KRW').reduce((a,r)=>a+getTotal(r),0);
  const pr=ts-tp;
  const mo=new Date().toISOString().slice(0,7);
  document.getElementById('kpi-sales').textContent=fmt(ts);
  document.getElementById('kpi-purch').textContent=fmt(tp);
  const pe=document.getElementById('kpi-profit');
  pe.textContent=fmt(pr);
  // pe.className 삭제하여 index.html에 설정된 기본값(n) 유지
  document.getElementById('kpi-cust').textContent=cache.customers.length;
  document.getElementById('kpi-prod').textContent=cache.products.length;
  document.getElementById('kpi-month').textContent=s.filter(r=>(r.date||'').startsWith(mo)).length+'건';
  const stocks=calcStock();
  const lowStockItems=stocks.filter(s=>s.current<=s.safeStock&&s.safeStock>0||s.current<=0);
  const lowStock=lowStockItems.length;
  const lowEl=document.getElementById('kpi-lowstock');
  if(lowEl) lowEl.textContent=lowStock+'개';

  // 🔔 재고 부족 알림 배너
  const banner = document.getElementById('low-stock-alert-banner');
  if (banner) {
    if (lowStock > 0) {
      banner.style.display = 'block';
      banner.className = 'alert-banner';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">⚠️</span>
          <div>
            <strong>재고 부족 알림:</strong> ${lowStock}개의 품목이 안전 재고 미만입니다.
            <button class="btn btn-sm btn-danger" onclick="goto('stock')" style="margin-left:10px">재고 확인하기</button>
          </div>
        </div>
      `;
    } else {
      banner.style.display = 'none';
    }
  }

  const recent=[
    ...s.map(r=>({...r,_t:'매출',party:r.buyer||r.customer,desc:r.item||r.summary,_total:getTotal(r)})),
    ...p.map(r=>({...r,_t:'매입',party:r.vendor,desc:r.item,_total:getTotal(r)}))
  ].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1).slice(0,10);
  document.getElementById('recent-tbody').innerHTML=recent.length
    ?recent.map((r,i)=>`<tr>
      <td class="no-col">${i+1}</td>
      <td>${escapeHtml(r.date||'')}</td>
      <td><span class="tag ${r._t==='매출'?'tag-sale':'tag-buy'}">${r._t}</span></td>
      <td>${escapeHtml(r.party||'')}</td>
      <td style="font-weight:600">${escapeHtml(r.desc||'')}</td>
      <td style="color:var(--text2)">${escapeHtml(r.spec||'')}</td>
      <td style="font-weight:700;text-align:right">${fmt(r._total,r.currency)}</td>
    </tr>`).join('')
    :'<tr class="empty-row"><td colspan="7">거래 내역이 없습니다</td></tr>';

  // 차트 렌더링
  renderCharts(s, p);
}

function renderCharts(sales, purchases) {
  if (!window.Chart) return;

  // ── 1. 월별 추이 차트 ──
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const salesData = months.map(m => 
    sales.filter(r => (r.date || '').startsWith(m) && r.currency === 'KRW')
         .reduce((a, r) => a + (r.total || r.subtotal || 0), 0)
  );
  const purchaseData = months.map(m => 
    purchases.filter(r => (r.date || '').startsWith(m) && r.currency === 'KRW')
             .reduce((a, r) => a + (r.total || r.subtotal || 0), 0)
  );

  const ctxTrend = document.getElementById('trendChart')?.getContext('2d');
  if (ctxTrend) {
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctxTrend, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: '매출 (원)', data: salesData, backgroundColor: '#8b2020', borderRadius: 4 },
          { label: '매입 (원)', data: purchaseData, backgroundColor: '#1a3a6b', borderRadius: 4 }
        ]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        scales: { 
          y: { 
            beginAtZero: true,
            title: { display: true, text: '[단위: 원]', font: { size: 10 } }
          } 
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) label += context.parsed.y.toLocaleString() + '원';
                return label;
              }
            }
          }
        }
      }
    });
  }

  // ── 2. 거래처별 비중 차트 ──
  const custMap = {};
  sales.filter(r => r.currency === 'KRW').forEach(r => {
    const name = r.buyer || r.customer || '기타';
    custMap[name] = (custMap[name] || 0) + (r.total || r.subtotal || 0);
  });
  const sortedCust = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ctxRatio = document.getElementById('ratioChart')?.getContext('2d');
  if (ctxRatio) {
    if (ratioChart) ratioChart.destroy();
    ratioChart = new Chart(ctxRatio, {
      type: 'doughnut',
      data: {
        labels: sortedCust.map(c => c[0]),
        datasets: [{
          data: sortedCust.map(c => c[1]),
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
  }
}
// ── 셀렉트 채우기 ──
function populateSelects(){
  // 일별현황 거래처 필터
  const dc=document.getElementById('d-customer');
  if(dc){
    const v=dc.value;
    dc.innerHTML='<option value="">전체</option>'+cache.customers.map(c=>`<option value="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    dc.value=v;
  }

  // 품목 데이터리스트 (ERP용)
  const dl = document.getElementById('products-list');
  if(dl) {
    dl.innerHTML = cache.products.map(p => `<option value="${escapeHtml(p.name)}${p.spec ? ' (' + escapeHtml(p.spec) + ')' : ''}">`).join('');
  }
}

// ── ERP 스타일 등록 로직 ──
function renderSidebar(type) {
  let listEl, qId;
  if (type === 'sale') { listEl = document.getElementById('sale-cust-list'); qId = 'sale-cust-search'; }
  else if (type === 'buy') { listEl = document.getElementById('buy-cust-list'); qId = 'buy-cust-search'; }
  else if (type === 'cust') { listEl = document.getElementById('cust-list-sidebar'); qId = 'cust-list-search'; }
  else if (type === 'inv') { listEl = document.getElementById('inv-cust-list'); qId = 'inv-cust-search'; }

  if (!listEl) return;
  const q = (document.getElementById(qId)?.value || '').toLowerCase();
  const list = cache.customers.filter(c => c.name.toLowerCase().includes(q) || (c.bizno || '').includes(q));   

  listEl.innerHTML = list.map(c => `
    <div class="sidebar-item" onclick="selectSidebarItem('${type}', '${c.id}')" id="${type}-item-${c.id}">     
      <div class="item-title">${escapeHtml(c.name)}</div>
      <div class="item-sub">${escapeHtml(c.bizno || '')} ${c.contact ? '| ' + escapeHtml(c.contact) : ''}</div>
    </div>
  `).join('');
}

window.filterSidebar = function(type) { renderSidebar(type); };

window.selectSidebarItem = function(type, id) {
  const c = cache.customers.find(x => x.id === id);
  if (!c) return;

  const listId = type === 'sale' ? 'sale-cust-list' : (type === 'buy' ? 'buy-cust-list' : (type === 'inv' ? 'inv-cust-list' : 'cust-list-sidebar'));
  document.querySelectorAll(`#${listId} .sidebar-item`).forEach(el => el.classList.remove('active'));  
  const target = document.getElementById(`${type}-item-${id}`);
  if (target) target.classList.add('active');

  if (type === 'sale') {
    document.getElementById('sale-customer-name').value = c.name;
    document.getElementById('sale-customer-id').value = c.id;
    document.getElementById('sale-bizno').value = c.bizno || '';
    document.getElementById('sale-ceo').value = c.contact || '';
  } else if (type === 'buy') {
    document.getElementById('buy-vendor-name').value = c.name;
    document.getElementById('buy-vendor-id').value = c.id;
    document.getElementById('buy-bizno').value = c.bizno || '';
    document.getElementById('buy-ceo').value = c.contact || '';
  } else if (type === 'inv') {
    document.getElementById('inv-customer-name').value = c.name;
    document.getElementById('inv-customer-id').value = c.id;
    document.getElementById('inv-bizno').value = c.bizno || '';
  } else if (type === 'cust') {
    // 거래처 탭에서 선택 시 폼에 채우기
    document.getElementById('c-id').value = c.id;
    document.getElementById('c-name').value = c.name;
    document.getElementById('c-bizno').value = c.bizno || '';
    document.getElementById('c-country').value = c.country || '한국';
    document.getElementById('c-contact').value = c.contact || '';
    document.getElementById('c-tel').value = c.tel || '';
    document.getElementById('c-email').value = c.email || '';
    document.getElementById('c-addr').value = c.addr || '';
    document.getElementById('c-memo').value = c.memo || '';
    document.getElementById('btn-save-customer').textContent = '💾 정보 수정';
    document.getElementById('btn-del-customer').style.display = 'inline-flex';
  }
};

window.addErpRow = function(type, data = {}) {
  const tbody = document.getElementById(type + '-items-tbody');
  if (!tbody) return;
  const rowCount = tbody.rows.length;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="row-no">${rowCount + 1}</td>
    <td><input list="products-list" class="erp-item-name" placeholder="품목명" onchange="fillErpProduct(this, '${type}')" value="${escapeHtml(data.item || '')}"></td>
    <td><input class="erp-spec" placeholder="규격" value="${escapeHtml(data.spec || '')}"></td>
    <td><input type="number" class="erp-qty" value="${data.qty || ''}" oninput="calcErpRow('${type}', this)"></td>
    <td><input type="text" class="erp-price" placeholder="0" value="${(data.unitPrice > 0 ? data.unitPrice.toLocaleString() : '')}" oninput="fmtInput(this);calcErpRow('${type}', this)"></td>
    <td><input type="text" class="erp-subtotal" readonly value="${(data.subtotal > 0 ? data.subtotal.toLocaleString() : '')}"></td>
    <td><input type="text" class="erp-total" readonly value="${(data.total > 0 ? data.total.toLocaleString() : '')}"></td>
    <td><input type="text" class="erp-memo" placeholder="비고" value="${data.memo || ''}"></td>
    <td><button class="btn btn-sm btn-danger" onclick="removeErpRow('${type}', this)">✕</button></td>
  `;
  tbody.appendChild(tr);
  calcErpTotal(type);
};

window.removeErpRow = function(type, btn) {
  const tr = btn.closest('tr');
  tr.remove();
  const tbody = document.getElementById(type + '-items-tbody');
  Array.from(tbody.rows).forEach((r, i) => {
    const no = r.querySelector('.row-no');
    if (no) no.textContent = i + 1;
  });
  calcErpTotal(type);
};

window.fillErpProduct = function(input, type) {
  const name = input.value;
  // 1. 제품 기본 정보 찾기
  const p = cache.products.find(x => x.name === name);
  
  // 2. 매출/매입 내역에서 가장 최근 단가 찾기
  let lastPrice = p ? p.price : 0;
  
  // 최근 내역 검색 (매출이면 매출 내역, 매입이면 매입 내역에서 검색)
  const history = type === 'sale' ? cache.sales : cache.purchases;
  const itemHistory = history
    .filter(r => r.item === name)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
  if (itemHistory.length > 0) {
    lastPrice = itemHistory[0].unitPrice || lastPrice;
  }

  const tr = input.closest('tr');
  if (p) {
    tr.querySelector('.erp-item-name').value = p.name;
    tr.querySelector('.erp-spec').value = p.spec || '';
  }
  
  // 3. 단가 입력 필드 채우기
  tr.querySelector('.erp-price').value = (lastPrice || 0).toLocaleString();
  calcErpRow(type, tr.querySelector('.erp-price'));
};

window.calcErpRow = function(type, input) {
  const tr = input.closest('tr');
  const qtyInput = tr.querySelector('.erp-qty');
  const priceInput = tr.querySelector('.erp-price');
  if (!qtyInput || !priceInput) return;

  const qty = rawNum(qtyInput.value);
  const price = rawNum(priceInput.value);
  const cur = document.getElementById(type + '-cur').value;
  const sub = qty * price;
  const vat = cur === 'KRW' ? Math.round(sub * 0.1) : 0;
  
  const subInput = tr.querySelector('.erp-subtotal');
  const totalInput = tr.querySelector('.erp-total');
  if (subInput) subInput.value = Math.round(sub).toLocaleString();
  if (totalInput) totalInput.value = Math.round(sub + vat).toLocaleString();
  calcErpTotal(type);
};

window.calcErpTotal = function(type) {
  const tbody = document.getElementById(type + '-items-tbody');
  if (!tbody) return;
  let total = 0;
  Array.from(tbody.rows).forEach(r => {
    const tInput = r.querySelector('.erp-total');
    if (tInput) total += rawNum(tInput.value);
  });
  const cur = document.getElementById(type + '-cur').value;
  const totalEl = document.getElementById(type + '-final-total');
  const curEl = document.getElementById(type + '-final-cur');
  if (totalEl) totalEl.textContent = total.toLocaleString();
  if (curEl) curEl.textContent = cur;
};

window.saveErpData = async function(type) {
  const date = document.getElementById(type + '-date').value;
  const idField = type === 'sale' ? 'sale-customer-id' : (type === 'buy' ? 'buy-vendor-id' : 'inv-customer-id');
  const nameField = type === 'sale' ? 'sale-customer-name' : (type === 'buy' ? 'buy-vendor-name' : 'inv-customer-name');
  const invNoField = type === 'inv' ? 'inv-no' : type + '-invno';

  const custId = document.getElementById(idField).value;
  const custName = document.getElementById(nameField).value;
  const invNo = document.getElementById(invNoField).value;
  const cur = document.getElementById(type + '-cur').value;
  const tbody = document.getElementById(type + '-items-tbody');

  if (!custId) { alert('거래처를 선택하세요'); return; }
  if (!tbody || tbody.rows.length === 0) { alert('최소 하나 이상의 품목을 입력하세요'); return; }

  const items = [];
  for (let r of tbody.rows) {
    const item = r.querySelector('.erp-item-name').value;
    const spec = r.querySelector('.erp-spec').value;
    const qty = rawNum(r.querySelector('.erp-qty').value);
    const price = rawNum(r.querySelector('.erp-price').value);
    if (!item) continue;

    // 품목명+규격이 등록된 품목과 일치하면 productId로 연결 (재고 계산이 정확히 매칭되도록)
    const matchedProduct = cache.products.find(p => p.name === item && (p.spec || '') === (spec || ''));

    const sub = qty * price;
    const vat = cur === 'KRW' ? Math.round(sub * 0.1) : 0;

    const data = {
      date,
      currency: cur,
      qty,
      unitPrice: price,
      subtotal: sub,
      vat,
      total: sub + vat,
      invNo,
      spec,
      productId: matchedProduct ? matchedProduct.id : '',
      memo: r.querySelector('.erp-memo').value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (type === 'sale' || type === 'inv') {
      data.buyer = custName;
      data.customer = custName;
      data.customerId = custId;
      data.item = item;
    } else {
      data.vendor = custName;
      data.item = item;
    }
    items.push(data);
  }

  if (items.length === 0) { alert('유효한 품목 정보가 없습니다'); return; }

  const loading = document.createElement('div');
  loading.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700';
  loading.textContent = '저장 중...';
  document.body.appendChild(loading);

  try {
    const coll = (type === 'sale' || type === 'inv') ? 'sales' : 'purchases';
    for (let it of items) {
      await addToCol(coll, it);
    }
    alert(`✅ 총 ${items.length}건이 저장되었습니다!`);
    tbody.innerHTML = '';
    addErpRow(type);
    if (type === 'sale' || type === 'inv') renderSales(); else renderPurchase();
  } catch (err) {
    console.error(err);
    alert('❌ 저장 중 오류가 발생했습니다.');
  } finally {
    document.body.removeChild(loading);
  }
};

// ── 일별현황 ──
function initDaily(){
  const m=new Date().toISOString().slice(0,7);
  document.getElementById('d-from').value=m+'-01';
  document.getElementById('d-to').value=today();
  renderDaily();
}
window.renderDaily=function(){
  const from=document.getElementById('d-from').value;
  const to=document.getElementById('d-to').value;
  const type=document.getElementById('d-type').value;
  const custSel=document.getElementById('d-customer');
  const custId=custSel.value;
  const custName=custId?custSel.options[custSel.selectedIndex]?.getAttribute('data-name')||'':'';
  const getTotal=r=>r.total||((r.subtotal||0)+(r.vat||0))||r.subtotal||0;
  let rows=[];
  if(type!=='buy') rows.push(...cache.sales.filter(r=>{
    const dateOk=r.date>=from&&r.date<=to;
    const custOk=!custId||(r.buyer||r.customer||'').includes(custName)||r.customerId===custId;
    return dateOk&&custOk;
  }).map(r=>({...r,_t:'매출',party:r.buyer||r.customer,desc:r.item||r.summary,_total:getTotal(r)})));
  if(type!=='sale') rows.push(...cache.purchases.filter(r=>r.date>=from&&r.date<=to)
    .map(r=>({...r,_t:'매입',party:r.vendor,desc:r.item,subtotal:getTotal(r),vat:0,_total:getTotal(r)})));
  rows.sort((a,b)=>(a.date||'')>(b.date||'')?1:-1);
  const ts=rows.filter(r=>r._t==='매출'&&r.currency==='KRW').reduce((s,r)=>s+r._total,0);
  const tp=rows.filter(r=>r._t==='매입'&&r.currency==='KRW').reduce((s,r)=>s+r._total,0);
  document.getElementById('daily-summary').innerHTML=`
    <div class="dc"><div class="dc-label">매출(KRW)</div><div class="dc-val g">${fmt(ts,'KRW')}</div></div>
    <div class="dc"><div class="dc-label">매입(KRW)</div><div class="dc-val r">${fmt(tp,'KRW')}</div></div>
    <div class="dc"><div class="dc-label">손익(KRW)</div><div class="dc-val ${ts-tp>=0?'g':'r'}">${fmt(ts-tp,'KRW')}</div></div>
    <div class="dc"><div class="dc-label">거래건수</div><div class="dc-val">${rows.length}건</div></div>`;

  renderDynamicTable('daily', rows, 'daily-tbody', (r) => {
    return r._t === '매출' ? `<button class="btn btn-sm btn-inv" onclick="issueFromDailyRow('${r.id}')">📄 거래명세서</button>` : '—';
  });
};

window.issueFromDailyRow=function(saleId){
  const r=cache.sales.find(s=>s.id===saleId);
  if(!r){alert('데이터를 찾을 수 없습니다');return;}

  if(r.date) document.getElementById('inv-date').value=r.date;
  if(r.invNo) document.getElementById('inv-no').value=r.invNo;
  if(r.memo) document.getElementById('inv-note').value=r.memo;

  // 거래처 정보 채우기
  const customer = cache.customers.find(c => c.id === r.customerId || c.name === (r.buyer || r.customer));
  if (customer) {
    document.getElementById('inv-customer-id').value = customer.id;
    document.getElementById('inv-customer-name').value = customer.name;
    document.getElementById('inv-bizno').value = customer.bizno || '';
  } else {
    document.getElementById('inv-customer-name').value = r.buyer || r.customer || '';
    document.getElementById('inv-customer-id').value = '';
    document.getElementById('inv-bizno').value = '';
  }

  const cur=r.currency||'KRW'; curCur=cur;

  // 품목 데이터 직접 구성
  const items=[{
    name:r.item||r.summary||'(품목)',
    spec:r.spec||'',
    qty:r.qty||1,
    unitPrice:r.unitPrice||r.subtotal||0,
    amount:r.subtotal||r.total||0
  }];

  printInvoice(items, cur, r);
};

function buildInvoiceHTML(items, cur, extraData){
  const sub=items.reduce((s,i)=>s+i.amount,0);
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const total=sub+vat;
  const buyer=getBuyer();
  const buyerName=buyer.name||(extraData?.buyer||extraData?.customer||'—');
  const co=getActiveCo();
  const no=document.getElementById('inv-no')?.value || '';
  const date=document.getElementById('inv-date')?.value || '';
  const terms=document.getElementById('inv-terms')?.value||co.terms||'';
  const note=document.getElementById('inv-note')?.value || '';
  const manager=document.getElementById('inv-manager')?.value || '';
  const receiver=document.getElementById('inv-receiver')?.value || '';
  const footer=co.footer||'본 거래명세서는 발행일로부터 30일 이내 결제 바랍니다.';
  const empty=Math.max(0,7-items.length);

  function half(label){
    return `<div style="width:100%;margin-bottom:3mm;padding-bottom:3mm;border-bottom:1px dashed #666;font-size:9.5px;line-height:1.45;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;box-sizing:border-box">
      <div style="text-align:center;font-size:14px;font-weight:700;letter-spacing:2px;margin-bottom:2px">거 래 명 세 서</div>
      <div style="text-align:center;font-size:9px;color:#333;margin-bottom:5px;padding-bottom:3px;border-bottom:1.5px solid #000">${label}</div>
      <div style="display:flex;justify-content:flex-end;gap:12px;font-size:8.5px;margin-bottom:4px">
        <span><b>No.</b> ${escapeHtml(no)}</span>
        <span><b>발행일</b> ${escapeHtml(date)}</span>
        ${terms?`<span><b>결제조건</b> ${escapeHtml(terms)}</span>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:5px">
        <div style="border:1px solid #333;border-radius:2px;overflow:hidden">
          <div style="background:#e0e0e0;border-bottom:1px solid #333;padding:2px 6px;font-size:8.5px;font-weight:700;text-align:center;letter-spacing:1px">공 급 받 는 자</div>
          <div style="padding:3px 5px">
            ${[['상호',buyerName],['사업자번호',buyer.bizno||'—'],['대표자',buyer.ceo||'—'],['주소',buyer.addr||'—'],['전화',buyer.tel||'—'],['담당자',manager||'—']].map(([l,v])=>`<div style="display:flex;font-size:8.5px;padding:1px 0;border-bottom:1px solid #eee"><span style="width:50px;color:#555;flex-shrink:0;font-weight:600">${l}</span><span style="word-break:break-all">${escapeHtml(v)}</span></div>`).join('')}
          </div>
        </div>
        <div style="border:1px solid #333;border-radius:2px;overflow:hidden">
          <div style="background:#e0e0e0;border-bottom:1px solid #333;padding:2px 6px;font-size:8.5px;font-weight:700;text-align:center;letter-spacing:1px">공 급 자</div>
          <div style="padding:3px 5px;position:relative">
            ${[['상호',co.company||'—'],['사업자번호',co.bizno||'—'],['대표자',co.ceo||'—'],['업태/종목',(co.biztype||'')+(co.bizitem?' / '+co.bizitem:'')],['주소',co.addr||'—'],['전화',co.tel||'—']].map(([l,v])=>`<div style="display:flex;font-size:8.5px;padding:1px 0;border-bottom:1px solid #eee"><span style="width:50px;color:#555;flex-shrink:0;font-weight:600">${l}</span><span style="word-break:break-all">${escapeHtml(v)}</span></div>`).join('')}
            ${sealImageBase64?`<img src="${sealImageBase64}" alt="직인" style="position:absolute;bottom:4px;right:4px;width:64px;height:64px;object-fit:contain;opacity:0.85">`:'<div style="position:absolute;bottom:4px;right:4px;width:52px;height:52px;border:1px solid #333;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#333">(인)</div>'}
          </div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:4px;table-layout:fixed">
        <colgroup>
          <col style="width:16px">
          <col style="width:30%">
          <col style="width:15%">
          <col style="width:24px">
          <col style="width:52px">
          <col style="width:52px">
          <col style="width:44px">
          <col style="width:54px">
        </colgroup>
        <thead><tr>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 2px;text-align:center;text-transform:none;font-size:8px">No.</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 6px;text-align:center;font-size:8px">품명</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 4px;text-align:center;font-size:8px">규격</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 2px;text-align:center;font-size:8px">수량</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 4px;text-align:center;font-size:8px">단가</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 4px;text-align:center;font-size:8px">금액</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 4px;text-align:center;font-size:8px">세액</th>
          <th style="background:#e8e8e8;border:1px solid #333;padding:4px 4px;text-align:center;font-size:8px">합계</th>
        </tr></thead>
        <tbody>
          ${items.map((it,i)=>{
            const rowVat=cur==='KRW'?Math.round(it.amount*.1):0;
            const rowTotal=it.amount+rowVat;
            return `<tr style="height:20px">
              <td style="border:1px solid #333;padding:2px;text-align:center;font-size:8px">${i+1}</td>
              <td style="border:1px solid #333;padding:2px 5px;word-break:break-all">${escapeHtml(it.name)}</td>
              <td style="border:1px solid #333;padding:2px 4px;text-align:center;color:#333">${escapeHtml(it.spec||'')}</td>
              <td style="border:1px solid #333;padding:2px;text-align:center">${Number(it.qty).toLocaleString()}</td>
              <td style="border:1px solid #333;padding:2px 4px;text-align:right">${Number(it.unitPrice).toLocaleString()}</td>
              <td style="border:1px solid #333;padding:2px 4px;text-align:right">${Number(it.amount).toLocaleString()}</td>
              <td style="border:1px solid #333;padding:2px 4px;text-align:right">${cur==='KRW'?Number(rowVat).toLocaleString():'-'}</td>
              <td style="border:1px solid #333;padding:2px 4px;text-align:right;font-weight:700">${Number(rowTotal).toLocaleString()}</td>
            </tr>`;
          }).join('')}
          ${Array(empty).fill(`<tr style="height:20px">
            <td style="border:1px solid #333;padding:2px">&nbsp;</td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
            <td style="border:1px solid #333"></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="border:1px solid #333;border-radius:2px;overflow:hidden;margin-bottom:3px">
        <div style="display:flex;border-bottom:1px solid #333"><span style="width:68px;padding:2px 6px;font-size:8.5px;color:#333;border-right:1px solid #333;font-weight:600">공급가액</span><span style="flex:1;padding:2px 6px;font-size:8.5px;text-align:right">${Number(sub).toLocaleString()}</span></div>
        ${cur==='KRW'?`<div style="display:flex;border-bottom:1px solid #333"><span style="width:68px;padding:2px 6px;font-size:8.5px;color:#333;border-right:1px solid #333;font-weight:600">세액(10%)</span><span style="flex:1;padding:2px 6px;font-size:8.5px;text-align:right">${Number(vat).toLocaleString()}</span></div>`:''}
        <div style="display:flex;background:#e0e0e0;font-weight:700"><span style="width:68px;padding:2px 6px;font-size:8.5px;border-right:1px solid #333">합계${cur!=='KRW'?' ('+cur+')':''}</span><span style="flex:1;padding:2px 6px;font-size:8.5px;text-align:right">${Number(total).toLocaleString()}</span></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div style="flex:1">
          ${note?`<div style="font-size:8px;color:#555;margin-top:2px">비고: ${escapeHtml(note)}</div>`:''}
          <div style="font-size:8px;color:#666;margin-top:1px">${escapeHtml(footer)}</div>
        </div>
        <div style="width:120px;text-align:right;font-size:10px;font-weight:700;padding-bottom:2px">
          인수자: ${escapeHtml(receiver||'__________')} (인)
        </div>
      </div>
    </div>`;
  }

  return `<div style="width:100%;max-width:185mm;margin:0 auto;box-sizing:border-box">
    ${half('공급받는자 보관용')}
    ${half('공급자 보관용')}
  </div>`;
}

function printInvoice(items, cur, extraData){
  const html=buildInvoiceHTML(items, cur, extraData);
  const area=document.getElementById('print-area');
  area.innerHTML=`
    <div class="no-print-btn" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e0e0e0">
      <div style="font-size:13px;font-weight:600;color:#1a1917">📄 거래명세서 미리보기</div>
      <div style="display:flex;gap:8px">
        <button onclick="window.print()" style="padding:8px 20px;background:#1a1917;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600">🖨 인쇄 / PDF 저장</button>
        <button onclick="closePrintArea()" style="padding:8px 16px;background:#f0efe9;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;font-family:inherit">✕ 닫기</button>
      </div>
    </div>
    <div style="background:#f5f4f0;padding:12px;border-radius:8px;text-align:center;margin-bottom:12px;font-size:12px;color:#6b6960" class="no-print-btn">
      💡 인쇄 설정에서 <b>여백을 "최소"</b>로, <b>배율을 "맞춤"</b>으로 설정하면 A4 한 장에 깔끔하게 출력됩니다
    </div>
    ${html}`;
  area.style.display='block';
  window.scrollTo(0,0);
}

window.closePrintArea=function(){
  document.getElementById('print-area').style.display='none';
  document.getElementById('print-area').innerHTML='';
};

// ── 거래명세서 ──
window.setCur=function(c,s,btn){
  curCur=c;curSym=s;
  document.querySelectorAll('.cur-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
};
window.addItem=function(){
  const id='item'+Date.now();itemRows.push(id);
  const opts=cache.products.map(p=>`<option value="${escapeHtml(p.name)}" data-id="${p.id}" data-price="${rawNum(p.price)}" data-spec="${escapeHtml(p.spec||'')}">${p.code?escapeHtml(p.code)+' | ':''}${escapeHtml(p.name)}${p.spec?' ('+escapeHtml(p.spec)+')':''}</option>`).join('');
  const div=document.createElement('div');div.id=id;
  div.style.cssText='display:grid;grid-template-columns:1.6fr 1fr 60px 100px 100px 34px;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML=`
    <select onchange="fillIP('${id}',this)"><option value="">품목 선택 / 직접입력</option>${opts}</select>
    <input id="${id}-spec" placeholder="규격/사양" style="font-size:12px">
    <input id="${id}-q" placeholder="수량" value="1" oninput="fmtInput(this);calcI()">
    <input id="${id}-u" placeholder="단가" oninput="fmtInput(this);calcI()">
    <input id="${id}-a" placeholder="금액" readonly style="background:var(--surface2);font-weight:600">
    <button class="btn btn-sm btn-danger" onclick="removeItem('${id}')">✕</button>`;
  document.getElementById('items-container').appendChild(div);
};
window.fillIP=function(id,sel){
  const opt=sel.options[sel.selectedIndex];
  const p=opt?.getAttribute('data-price');
  const spec=opt?.getAttribute('data-spec');
  if(p){const el=document.getElementById(id+'-u');if(el)el.value=Number(p).toLocaleString();}
  if(spec){const el=document.getElementById(id+'-spec');if(el)el.value=spec;}
  calcI();
};
window.removeItem=function(id){
  document.getElementById(id)?.remove();itemRows=itemRows.filter(r=>r!==id);calcI();
};
function calcI(){
  itemRows.forEach(id=>{
    const q=rawNum(document.getElementById(id+'-q')?.value);
    const u=rawNum(document.getElementById(id+'-u')?.value);
    const el=document.getElementById(id+'-a');if(el)el.value=Math.round(q*u).toLocaleString();
  });
}
function getItems(){
  const erpTbody = document.getElementById('inv-items-tbody');
  if (erpTbody && erpTbody.rows.length > 0) {
    return Array.from(erpTbody.rows).map(r => {
      const name = r.querySelector('.erp-item-name').value;
      const qty = rawNum(r.querySelector('.erp-qty').value);
      const price = rawNum(r.querySelector('.erp-price').value);
      return { name, spec: '', qty, unitPrice: price, amount: qty * price, memo: r.querySelector('.erp-memo').value };
    }).filter(i => i.qty > 0 && i.name);
  }
  
  return itemRows.map(id=>{
    const sel=document.querySelector('#'+id+' select');
    const opt=sel?.options[sel.selectedIndex];
    const q=rawNum(document.getElementById(id+'-q')?.value);
    const u=rawNum(document.getElementById(id+'-u')?.value);
    const spec=document.getElementById(id+'-spec')?.value||'';
    return{
      name:sel?.value||'(품목)',
      productId:opt?.getAttribute('data-id')||'',
      spec,qty:q,unitPrice:u,amount:q*u
    };
  }).filter(i=>i.qty>0);
}
function getBuyer(){
  const name = document.getElementById('inv-customer-name')?.value;
  if (name) {
    return {
      id: document.getElementById('inv-customer-id').value,
      name: name,
      bizno: document.getElementById('inv-bizno').value,
      addr: '', // 상세 정보 필요 시 캐시 활용 가능
      ceo: '',
      tel: ''
    };
  }

  return { id: '', name: '', bizno: '', addr: '', ceo: '', tel: '' };
}

function makeOneCopy(items,label){
  const sub=items.reduce((s,i)=>s+i.amount,0);
  const vat=curCur==='KRW'?Math.round(sub*.1):0;
  const total=sub+vat;
  const buyer=getBuyer();const co=getActiveCo();
  const no=document.getElementById('inv-no').value;
  const date=document.getElementById('inv-date').value;
  const note=document.getElementById('inv-note').value;
  
  // 도장 이미지 (Base64)
  const sealHtml = sealImageBase64 ? `<img src="${sealImageBase64}">` : '직인';

  const rowsHtml = items.map((it, i) => `
    <tr>
      <td class="text-center">${date.slice(5).replace('-', '/')}</td>
      <td>${it.name} ${it.spec ? ' (' + it.spec + ')' : ''}</td>
      <td class="text-right">${it.qty.toLocaleString()}</td>
      <td class="text-right">${Math.round(it.unitPrice).toLocaleString()}</td>
      <td class="text-right">${Math.round(it.amount).toLocaleString()}</td>
      <td class="text-right">${Math.round(curCur === 'KRW' ? it.amount * 0.1 : 0).toLocaleString()}</td>
      <td>${it.memo || ''}</td>
    </tr>
  `).join('');

  // 빈 행 채우기 (최소 10줄)
  const emptyCount = Math.max(0, 10 - items.length);
  const emptyRows = Array(emptyCount).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  return `
    <div class="inv-trad">
      <div style="display:flex; justify-content:flex-end; font-size:11px; color:#555; margin-bottom:-20px">PAGE : 1 / 1</div>
      <div class="inv-trad-title">거 래 명 세 표</div>
      <div class="inv-trad-label">[${label}]</div>

      
      <div class="inv-trad-top">
        <div class="inv-trad-left">
          <div class="row"><span class="lbl">일 자 :</span><span class="val">${date}</span></div>
          <div class="row"><span class="lbl">거 래 처 :</span><span class="val">${buyer.name}</span></div>
          <div class="row"><span class="lbl">주 소 :</span><span class="val">${buyer.addr || ''}</span></div>
          <div class="row"><span class="lbl">전화번호 :</span><span class="val">${buyer.tel || ''}</span></div>
        </div>
        
        <div class="inv-trad-right">
          <div class="h-lbl">등록<br>번호</div><div class="h-val span-3">${co.bizno || ''}</div>
          <div class="h-lbl">상 호</div><div class="h-val">${co.company || ''}</div>
          <div class="h-lbl">성 명</div><div class="h-val">${co.ceo || ''}</div>
          <div class="h-lbl">주 소</div><div class="h-val span-3">${co.addr || ''}</div>
          <div class="h-lbl">업 태</div><div class="h-val">${co.biztype || ''}</div>
          <div class="h-lbl">종 목</div><div class="h-val">${co.bizitem || ''}</div>
          <div class="h-lbl">전화<br>번호</div><div class="h-val">${co.tel || ''}</div>
          <div class="h-lbl">팩스<br>번호</div><div class="h-val">${co.fax || ''}</div>
        </div>
        <div class="inv-trad-seal">${sealHtml}</div>
      </div>

      <div class="inv-trad-total-box">
        <div class="lbl">합계금액</div>
        <div class="val">￦ ${total.toLocaleString()}</div>
      </div>

      <table class="inv-trad-table">
        <thead>
          <tr>
            <th width="50">월/일</th>
            <th>품 목 명 / 규 격</th>
            <th width="50">수량</th>
            <th width="100">단 가</th>
            <th width="110">공급가액</th>
            <th width="100">세 액</th>
            <th width="120">비 고</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${emptyRows}
        </tbody>
      </table>

      <div class="inv-trad-footer">
        <div class="f-lbl" style="width:100px; text-align:center">합 계</div>
        <div class="f-val">${sub.toLocaleString()}</div>
        <div class="f-val" style="border-left:1px solid #d32f2f">${vat.toLocaleString()}</div>
      </div>

      <div style="margin-top:15px; font-size:11px; color:#555">
        ${note ? `<div>※ 비고: ${note}</div>` : ''}
      </div>
    </div>
  `;
}

window.showInvoice=function(){
  const items=getItems();
  if(!items.length){alert('품목을 하나 이상 추가하세요');return;}
  printInvoice(items, curCur, null);
  // 인쇄 영역으로 스크롤
  document.getElementById('print-area').scrollIntoView({behavior:'smooth'});
};
window.saveInvoiceToSales=async function(){
  const items=getItems();
  if(!items.length){alert('품목을 추가하세요');return;}
  const buyer=getBuyer();
  const date=document.getElementById('inv-date').value;
  const invNo=document.getElementById('inv-no').value;
  const memo=document.getElementById('inv-note').value;

  for(const it of items){
    const vat=curCur==='KRW'?Math.round(it.amount*.1):0;
    await addToCol('sales',{
      date,
      invNo,
      buyer:buyer.name,
      customer:buyer.name,
      customerId:buyer.id,
      productId:it.productId,
      item:it.name,
      spec:it.spec,
      summary:it.name,
      qty:it.qty,
      unitPrice:it.unitPrice,
      currency:curCur,
      subtotal:it.amount,
      vat,
      total:it.amount+vat,
      memo:memo
    });
  }
  
  alert(`✅ 총 ${items.length}건의 품목이 매출 장부에 각각 저장되었습니다!`);
  const no=document.getElementById('inv-no');
  const m=no.value.match(/(\d+)$/);
  if(m) no.value=no.value.replace(/\d+$/,String(parseInt(m[1])+1).padStart(m[1].length,'0'));
};

// ── 매출 직접 등록 ──
window.saveSale=async function(){
  const qty=rawNum(document.getElementById('sale-qty').value);
  const price=rawNum(document.getElementById('sale-price').value);
  const item=document.getElementById('sale-item').value;
  const spec=document.getElementById('sale-spec').value;
  const cur=document.getElementById('sale-cur').value;
  const prodSel=document.getElementById('sale-product-sel');
  const productId=prodSel?.value||'';
  if(!item||!price){alert('품목명과 단가를 입력하세요');return;}
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const custSel=document.getElementById('sale-customer');
  const custName=custSel.options[custSel.selectedIndex]?.text||'';
  await addToCol('sales',{
    date:document.getElementById('sale-date').value,
    buyer:custName,customer:custName,customerId:custSel.value,
    productId,item,spec,summary:item,
    qty,unitPrice:price,currency:cur,
    subtotal:sub,vat,total:sub+vat,
    invNo:document.getElementById('sale-invno').value,
    memo:document.getElementById('sale-memo').value
  });
  ['sale-item','sale-spec','sale-price','sale-invno','sale-memo'].forEach(id=>document.getElementById(id).value='');
  if(prodSel) prodSel.value='';
  document.getElementById('sale-qty').value='1';
  document.getElementById('sale-subtotal').value='';
  document.getElementById('sale-vat').value='';
  document.getElementById('sale-total-disp').value='';
  alert('✅ 매출이 등록되었습니다!');
};
function renderSales(){
  const q=(document.getElementById('sales-q')?.value||'').toLowerCase();
  const fc=document.getElementById('sales-cur-f')?.value||'';
  const rows=cache.sales.filter(r=>(!q||(r.buyer||r.customer||'').toLowerCase().includes(q)||(r.item||r.summary||'').toLowerCase().includes(q))&&(!fc||r.currency===fc));

  renderDynamicTable('sales', rows, 'sales-tbody', (r) => {
    return `<button class="btn btn-sm btn-edit" onclick="openEdit('sales','${r.id}')">수정</button>
            <button class="btn btn-sm btn-danger" onclick="delSale('${r.id}')">삭제</button>`;
  });

  const kt=rows.filter(r=>r.currency==='KRW').reduce((s,r)=>s+(r.total||0),0);
  document.getElementById('sales-sum').textContent=rows.length?`KRW 합계: ${fmt(kt,'KRW')} (전체 ${rows.length}건)`:'';
  // 모바일 카드
  renderMobileCards('sales',rows,mSalesCard);
}
window.delSale=async function(id){if(confirm('삭제하시겠습니까?'))await delFromCol('sales',id);};

// ── 매입 ──
window.savePurchase=async function(){
  const qty=rawNum(document.getElementById('buy-qty').value);
  const price=rawNum(document.getElementById('buy-price').value);
  const prodSel=document.getElementById('buy-product-sel');
  const productId=prodSel?.value||'';
  const cur=document.getElementById('buy-cur').value;
  if(!price){alert('단가를 입력하세요');return;}
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  await addToCol('purchases',{
    date:document.getElementById('buy-date').value,
    vendor:document.getElementById('buy-vendor').value,
    item:document.getElementById('buy-item').value,
    spec:document.getElementById('buy-spec').value,
    productId,qty,unitPrice:price,currency:cur,
    subtotal:sub,vat,total:sub+vat,
    invNo:document.getElementById('buy-invno').value,
    memo:document.getElementById('buy-memo').value
  });
  ['buy-vendor','buy-item','buy-spec','buy-price','buy-invno','buy-memo'].forEach(id=>document.getElementById(id).value='');
  if(prodSel) prodSel.value='';
  document.getElementById('buy-qty').value='1';
  document.getElementById('buy-subtotal').value='';
  document.getElementById('buy-vat').value='';
  document.getElementById('buy-total-disp').value='';
  alert('✅ 매입이 저장되었습니다!');
};
function renderPurchase(){
  const q=(document.getElementById('purchase-q')?.value||'').toLowerCase();
  const fc=document.getElementById('purchase-cur-f')?.value||'';
  const rows=cache.purchases.filter(r=>(!q||(r.vendor||'').toLowerCase().includes(q)||(r.item||'').toLowerCase().includes(q))&&(!fc||r.currency===fc));

  renderDynamicTable('purchase', rows, 'purchase-tbody', (r) => {
    return `<button class="btn btn-sm btn-edit" onclick="openEdit('purchases','${r.id}')">수정</button>
            <button class="btn btn-sm btn-danger" onclick="delPurch('${r.id}')">삭제</button>`;
  });
  const kt=rows.filter(r=>r.currency==='KRW').reduce((s,r)=>s+(r.total||0),0);
  document.getElementById('purchase-sum').textContent=rows.length?`KRW 합계: ${fmt(kt,'KRW')} (전체 ${rows.length}건)`:'';
  // 모바일 카드
  renderMobileCards('purchase',rows,mPurchaseCard);
}
window.delPurch=async function(id){if(confirm('삭제하시겠습니까?'))await delFromCol('purchases',id);};

// 매출/매입 내역 표에서 거래처명을 클릭하면 그 거래처 내역만 걸러서 보여줌
window.filterByParty=function(tableId,el){
  const name=el.textContent;
  const inputId = tableId==='sales' ? 'sales-q' : (tableId==='purchase' ? 'purchase-q' : null);
  if(!inputId) return;
  const input=document.getElementById(inputId);
  if(!input) return;
  input.value=name;
  if(tableId==='sales') renderSales(); else renderPurchase();
  input.scrollIntoView({behavior:'smooth',block:'center'});
};

// ══════════════════════════════════════════
// ⚡ 빠른 입력 (한 줄로 매입+매출 동시 등록)
// 어순에 의존하지 않고, 이미 등록된 거래처/품목명과 매칭해서 인식합니다.
// ══════════════════════════════════════════
const QUICK_BUY_KEYWORDS=['매입단가','매입가','입고단가','입고'];
const QUICK_SELL_KEYWORDS=['판매단가','매출단가','출고단가','매출','판매'];
let quickEntryDraft=null;

function qeFindKeywordPositions(text,keywords){
  const found=[];
  keywords.forEach(kw=>{
    let idx=text.indexOf(kw);
    while(idx!==-1){ found.push({kw,idx,end:idx+kw.length}); idx=text.indexOf(kw,idx+kw.length); }
  });
  return found;
}
function qeExtractNumberNear(text,fromIdx){
  const rest=text.slice(fromIdx,fromIdx+30); // 키워드 바로 뒤 30자 이내에서만 탐색
  const m=rest.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*원?/);
  if(!m) return null;
  return {value:rawNum(m[1]), idx:fromIdx+m.index};
}
function qeFindNearestCustomer(text,keywordIdx,customers,excludeName){
  let best=null,bestDist=Infinity;
  (customers||[]).forEach(c=>{
    if(!c.name || c.name===excludeName) return;
    let idx=text.indexOf(c.name);
    while(idx!==-1){
      const dist=Math.abs(idx-keywordIdx);
      if(dist<bestDist){bestDist=dist;best=c;}
      idx=text.indexOf(c.name,idx+c.name.length);
    }
  });
  return best;
}
function parseQuickEntryText(text){
  const missing=[];
  const qtyMatch=text.match(/(\d+(?:\.\d+)?)\s*(개|EA|ea|대)\b/);
  const qty=qtyMatch?parseFloat(qtyMatch[1]):null;
  if(!qty) missing.push('수량 (예: 2개, 2EA, 2대)');

  let product=null,productMatchLen=0;
  (cache.products||[]).forEach(p=>{
    if(p.name && text.includes(p.name) && p.name.length>productMatchLen){ product=p; productMatchLen=p.name.length; }
  });
  let productUnregistered=false;
  const modelCodePattern=/^[A-Za-z]+[A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/; // 예: MR-J4-40B, MR-J4W2-22B 같은 영문+숫자+하이픈 모델번호
  if(!product && qtyMatch){
    // 등록된 품목이 아니면, 수량 표기 앞부분을 살펴봄
    const guess=text.slice(0,qtyMatch.index).trim();
    if(guess){
      const words=guess.split(/\s+/);
      const lastWord=words[words.length-1]||'';
      if(modelCodePattern.test(lastWord)){
        // 마지막 단어가 모델번호처럼 생겼으면 → 규격으로, 그 앞쪽 텍스트를 품목명으로 분리
        const itemName=words.slice(0,-1).join(' ').trim();
        if(itemName){
          product={name:itemName, spec:lastWord, id:''}; productUnregistered=true;
        }
        // itemName이 없으면(모델번호만 딸랑 있으면) product는 null로 남겨서 "품목명 필요" 안내가 뜨게 함
      } else {
        // 모델번호 패턴이 아니면 통째로 품목명으로 (지금까지 방식)
        product={name:guess,spec:'',id:''}; productUnregistered=true;
      }
    }
  }
  if(!product) missing.push('품목명 (예: "SERVO AMP MR-J4-40B 2EA..."처럼 품목명 뒤에 모델번호를 붙여 적어주세요)');

  const buyKwPositions=qeFindKeywordPositions(text,QUICK_BUY_KEYWORDS);
  let buyPrice=null,buyKwIdx=null;
  for(const pos of buyKwPositions){
    const num=qeExtractNumberNear(text,pos.end);
    if(num){ buyPrice=num.value; buyKwIdx=pos.idx; break; }
  }
  if(buyPrice===null) missing.push('매입단가 (예: 매입단가 400,000원)');

  const sellKwPositions=qeFindKeywordPositions(text,QUICK_SELL_KEYWORDS);
  let sellPrice=null,sellKwIdx=null;
  for(const pos of sellKwPositions){
    const num=qeExtractNumberNear(text,pos.end);
    if(num){ sellPrice=num.value; sellKwIdx=pos.idx; break; }
  }
  if(sellPrice===null) missing.push('판매단가 (예: 판매단가 540,000원)');

  let buyCustomer=null,sellCustomer=null;
  if(buyKwIdx!==null) buyCustomer=qeFindNearestCustomer(text,buyKwIdx,cache.customers);
  if(sellKwIdx!==null) sellCustomer=qeFindNearestCustomer(text,sellKwIdx,cache.customers,buyCustomer?.name);
  if(!buyCustomer) missing.push('등록된 매입 거래처');
  if(!sellCustomer) missing.push('등록된 매출 거래처');

  return {ok:missing.length===0, missing, qty, product, productUnregistered, buyPrice, buyCustomer, sellPrice, sellCustomer};
}

window.parseQuickEntry=function(){
  const text=document.getElementById('quick-entry-input').value.trim();
  if(!text){alert('내용을 입력하세요');return;}
  const r=parseQuickEntryText(text);
  if(!r.ok){
    alert('다음 항목을 인식하지 못했습니다:\n\n- '+r.missing.join('\n- ')+'\n\n품목명·거래처명은 등록된 것과 정확히 같아야 하고, 수량/단가 앞에는 정해진 키워드가 있어야 합니다.');
    return;
  }
  quickEntryDraft=r;
  const buySub=r.qty*r.buyPrice, buyVat=Math.round(buySub*.1), buyTotal=buySub+buyVat;
  const sellSub=r.qty*r.sellPrice, sellVat=Math.round(sellSub*.1), sellTotal=sellSub+sellVat;
  document.getElementById('quick-entry-body').innerHTML=`
    <div style="font-size:13px;line-height:1.9">
      <div><b>품목</b>: ${escapeHtml(r.product.name)}${r.product.spec?' ('+escapeHtml(r.product.spec)+')':''}${r.productUnregistered?' <span style="color:var(--amber);font-size:11px">(미등록 품목 — 텍스트로만 저장됩니다)</span>':''}</div>
      <div><b>수량</b>: ${r.qty}</div>
      <div style="margin-top:6px"><label><b>거래일자</b> <input type="date" id="qe-date" value="${new Date().toISOString().slice(0,10)}"></label></div>
      <hr style="margin:10px 0;border-color:var(--border)">
      <div style="color:var(--blue)"><b>매입</b> — ${escapeHtml(r.buyCustomer.name)} · 단가 <input id="qe-buy-price" type="text" value="${r.buyPrice}" style="width:110px" oninput="updateQuickEntryTotals()"> 원</div>
      <div style="margin:2px 0 0 16px;font-size:12px;color:var(--text2)">공급가액 <span id="qe-buy-sub">${fmt(buySub,'KRW')}</span> + 세액(10%) <span id="qe-buy-vat">${fmt(buyVat,'KRW')}</span> = <b id="qe-buy-total">${fmt(buyTotal,'KRW')}</b></div>
      <div style="color:var(--red);margin-top:8px"><b>매출</b> — ${escapeHtml(r.sellCustomer.name)} · 단가 <input id="qe-sell-price" type="text" value="${r.sellPrice}" style="width:110px" oninput="updateQuickEntryTotals()"> 원</div>
      <div style="margin:2px 0 0 16px;font-size:12px;color:var(--text2)">공급가액 <span id="qe-sell-sub">${fmt(sellSub,'KRW')}</span> + 세액(10%) <span id="qe-sell-vat">${fmt(sellVat,'KRW')}</span> = <b id="qe-sell-total">${fmt(sellTotal,'KRW')}</b></div>
      <hr style="margin:10px 0;border-color:var(--border)">
      <div><b>예상 손익</b>: <span id="qe-profit" style="font-weight:700;color:var(--green)">${fmt(sellTotal-buyTotal,'KRW')}</span></div>
    </div>`;
  document.getElementById('quick-entry-modal').style.display='flex';
};

window.updateQuickEntryTotals=function(){
  if(!quickEntryDraft) return;
  const buyPrice=rawNum(document.getElementById('qe-buy-price').value);
  const sellPrice=rawNum(document.getElementById('qe-sell-price').value);
  const qty=quickEntryDraft.qty;
  const buySub=qty*buyPrice, buyVat=Math.round(buySub*.1), buyTotal=buySub+buyVat;
  const sellSub=qty*sellPrice, sellVat=Math.round(sellSub*.1), sellTotal=sellSub+sellVat;
  document.getElementById('qe-buy-sub').textContent=fmt(buySub,'KRW');
  document.getElementById('qe-buy-vat').textContent=fmt(buyVat,'KRW');
  document.getElementById('qe-buy-total').textContent=fmt(buyTotal,'KRW');
  document.getElementById('qe-sell-sub').textContent=fmt(sellSub,'KRW');
  document.getElementById('qe-sell-vat').textContent=fmt(sellVat,'KRW');
  document.getElementById('qe-sell-total').textContent=fmt(sellTotal,'KRW');
  document.getElementById('qe-profit').textContent=fmt(sellTotal-buyTotal,'KRW');
};

window.confirmQuickEntry=async function(){
  if(!quickEntryDraft) return;
  const r=quickEntryDraft;
  const buyPrice=rawNum(document.getElementById('qe-buy-price').value);
  const sellPrice=rawNum(document.getElementById('qe-sell-price').value);
  const date=document.getElementById('qe-date').value;
  const qty=r.qty;
  const linkId=genId();
  const buySub=qty*buyPrice, buyVat=Math.round(buySub*.1);
  const sellSub=qty*sellPrice, sellVat=Math.round(sellSub*.1);

  try{
    await addToCol('purchases',{
      date, vendor:r.buyCustomer.name, customerId:r.buyCustomer.id,
      productId:r.product.id||'', item:r.product.name, spec:r.product.spec||'',
      qty, unitPrice:buyPrice, currency:'KRW',
      subtotal:buySub, vat:buyVat, total:buySub+buyVat,
      memo:'빠른입력', linkId
    });
    await addToCol('sales',{
      date, buyer:r.sellCustomer.name, customer:r.sellCustomer.name, customerId:r.sellCustomer.id,
      productId:r.product.id||'', item:r.product.name, spec:r.product.spec||'', summary:r.product.name,
      qty, unitPrice:sellPrice, currency:'KRW',
      subtotal:sellSub, vat:sellVat, total:sellSub+sellVat,
      memo:'빠른입력', linkId
    });
    document.getElementById('quick-entry-input').value='';
    quickEntryDraft=null;
    closeModal('quick-entry-modal');
    alert('✅ 매입/매출이 각각 등록되었습니다!');
  }catch(e){
    alert('저장 중 오류가 발생했습니다: '+e.message);
  }
};

// ── 거래처 ──
window.saveCustomer=async function(){
  const name=document.getElementById('c-name').value.trim();
  if(!name){alert('회사명을 입력하세요');return;}
  const id = document.getElementById('c-id').value;
  const data = {
    name,
    bizno:document.getElementById('c-bizno').value,
    country:document.getElementById('c-country').value,
    contact:document.getElementById('c-contact').value,
    tel:document.getElementById('c-tel').value,
    email:document.getElementById('c-email').value,
    addr:document.getElementById('c-addr').value,
    memo:document.getElementById('c-memo').value
  };

  if (id) {
    await updFromCol('customers', id, data);
    alert('✅ 거래처 정보가 수정되었습니다!');
  } else {
    await addToCol('customers', data);
    alert('✅ 새 거래처가 저장되었습니다!');
  }
  resetCustomerForm();
  renderCustomers();
  renderSidebar('cust');
};

window.resetCustomerForm = function() {
  ['c-name','c-bizno','c-contact','c-tel','c-email','c-addr','c-memo','c-id'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value='';
  });
  document.getElementById('btn-save-customer').textContent = '💾 거래처 저장';
  document.getElementById('btn-del-customer').style.display = 'none';
  document.querySelectorAll('#cust-list-sidebar .sidebar-item').forEach(el => el.classList.remove('active'));
};

window.delCustFromForm = async function() {
  const id = document.getElementById('c-id').value;
  if (!id) return;
  if (confirm('정말로 삭제하시겠습니까?')) {
    await delFromCol('customers', id);
    resetCustomerForm();
  }
};

function renderCustomers(){
  const tbody = document.getElementById('customers-tbody');
  if(!tbody) return;
  
  tbody.innerHTML=cache.customers.length
    ?cache.customers.map((r,i)=>`<tr>
      <td class="no-col">${i+1}</td><td style="font-weight:600">${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.country||'')}</td><td style="color:var(--text2)">${escapeHtml(r.bizno||'')}</td>
      <td>${escapeHtml(r.contact||'')}</td><td>${escapeHtml(r.tel||'')}</td>
      <td style="color:var(--blue)">${escapeHtml(r.email||'')}</td>
      <td style="color:var(--text2)">${escapeHtml(r.memo||'')}</td>
      <td class="no-print" style="white-space:nowrap">
        <button class="btn btn-sm btn-edit" onclick="openEdit('customers','${r.id}')">수정</button>
        <button class="btn btn-sm btn-danger" onclick="delCust('${r.id}')">삭제</button>
      </td></tr>`).join('')
    :'<tr class="empty-row"><td colspan="9">거래처를 추가해 주세요</td></tr>';
  // 모바일 카드
  renderMobileCards('customers',cache.customers,mCustomerCard);
  // 사이드바 업데이트
  renderSidebar('cust');
}

window.delCust=async function(id){if(confirm('삭제하시겠습니까?'))await delFromCol('customers',id);};

// ── 품목 ──
window.saveProduct=async function(){
  const name=document.getElementById('p-name').value.trim();
  if(!name){alert('품목명을 입력하세요');return;}
  await addToCol('products',{
    code:document.getElementById('p-code').value,
    name,spec:document.getElementById('p-spec').value,
    maker:document.getElementById('p-maker').value,
    price:rawNum(document.getElementById('p-price').value),
    currency:document.getElementById('p-cur').value,
    unit:document.getElementById('p-unit').value,
    stock:parseFloat(document.getElementById('p-stock').value)||0,
    safeStock:parseFloat(document.getElementById('p-safestock').value)||0,
    memo:document.getElementById('p-memo').value
  });
  ['p-code','p-name','p-spec','p-maker','p-price','p-unit','p-memo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('p-code').value = getNextProductCode();
  document.getElementById('p-stock').value='0';
  document.getElementById('p-safestock').value='0';
  alert('✅ 품목이 저장되었습니다!');
};
function renderProducts(){
  document.getElementById('products-tbody').innerHTML=cache.products.length
    ?cache.products.map((r,i)=>`<tr>
      <td class="no-col">${i+1}</td><td style="color:var(--text2)">${escapeHtml(r.code||'')}</td>
      <td style="font-weight:600">${escapeHtml(r.name)}</td><td style="color:var(--text2)">${escapeHtml(r.spec||'')}</td>
      <td>${escapeHtml(r.maker||'')}</td>
      <td style="font-weight:500;text-align:right">${fmt(r.price,r.currency)}</td>
      <td><span class="tag tag-${(r.currency||'krw').toLowerCase()}">${r.currency}</span></td>
      <td>${escapeHtml(r.unit||'')}</td><td style="color:var(--text2)">${escapeHtml(r.memo||'')}</td>
      <td class="no-print" style="white-space:nowrap">
        <button class="btn btn-sm btn-edit" onclick="openEdit('products','${r.id}')">수정</button>
        <button class="btn btn-sm btn-danger" onclick="delProd('${r.id}')">삭제</button>
      </td></tr>`).join('')
    :'<tr class="empty-row"><td colspan="10">품목을 추가해 주세요</td></tr>';
  // 모바일 카드
  renderMobileCards('products',cache.products,mProductCard);
}
window.delProd=async function(id){if(confirm('삭제하시겠습니까?'))await delFromCol('products',id);};

// ── 수정 모달 ──
const editFields={
  sales:[{k:'date',l:'날짜',t:'date'},{k:'buyer',l:'거래처',t:'text'},{k:'item',l:'품목명',t:'text'},{k:'spec',l:'규격',t:'text'},{k:'qty',l:'수량',t:'number'},{k:'unitPrice',l:'단가',t:'number'},{k:'subtotal',l:'공급가액',t:'number'},{k:'vat',l:'세액',t:'number'},{k:'total',l:'합계',t:'number'},{k:'invNo',l:'명세서No.',t:'text'},{k:'memo',l:'비고',t:'text'}],
  purchases:[{k:'date',l:'날짜',t:'date'},{k:'vendor',l:'공급업체',t:'text'},{k:'item',l:'품목명',t:'text'},{k:'spec',l:'규격',t:'text'},{k:'qty',l:'수량',t:'number'},{k:'unitPrice',l:'단가',t:'number'},{k:'subtotal',l:'공급가액',t:'number'},{k:'vat',l:'세액',t:'number'},{k:'total',l:'합계',t:'number'},{k:'invNo',l:'인보이스번호',t:'text'},{k:'memo',l:'비고',t:'text'}],
  customers:[{k:'name',l:'회사명',t:'text'},{k:'bizno',l:'사업자번호',t:'text'},{k:'country',l:'국가',t:'text'},{k:'contact',l:'담당자',t:'text'},{k:'tel',l:'연락처',t:'text'},{k:'email',l:'이메일',t:'text'},{k:'addr',l:'주소',t:'text'},{k:'memo',l:'메모',t:'text'}],
  products:[{k:'code',l:'품목코드',t:'text'},{k:'name',l:'품목명',t:'text'},{k:'spec',l:'규격',t:'text'},{k:'maker',l:'제조사',t:'text'},{k:'price',l:'기준단가',t:'number'},{k:'unit',l:'단위',t:'text'},{k:'stock',l:'초기재고',t:'number'},{k:'safeStock',l:'안전재고',t:'number'},{k:'memo',l:'메모',t:'text'}]
};
const colLabels={sales:'매출',purchases:'매입',customers:'거래처',products:'품목'};

window.openEdit=function(col,id){
  const item=cache[col]?.find(r=>r.id===id);
  if(!item){alert('데이터를 찾을 수 없습니다');return;}
  editState={col,id,data:{...item}};
  document.getElementById('modal-title-text').textContent=colLabels[col]+' 수정';
  const fields=editFields[col]||[];
  document.getElementById('modal-body').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
      ${fields.map(f=>`<div class="fg"><label>${f.l}</label>
        ${f.t==='select'
          ?`<select id="ef-${f.k}">${(f.opts||[]).map(o=>`<option${item[f.k]===o?' selected':''}>${o}</option>`).join('')}</select>`
          :`<input type="${f.t==='number'?'text':'text'}" id="ef-${f.k}" value="${escapeHtml(item[f.k]||'')}" ${f.t==='number'?'oninput="fmtInput(this)"':''}>`}
      </div>`).join('')}
    </div>`;
  document.getElementById('edit-modal').style.display='flex';
};
window.closeModal=function(id){document.getElementById(id).style.display='none';};
window.submitEdit=async function(){
  const fields=editFields[editState.col]||[];
  const updates={};
  fields.forEach(f=>{
    const el=document.getElementById('ef-'+f.k);
    if(el) updates[f.k]=f.t==='number'?rawNum(el.value):el.value;
  });
  if(editState.col==='sales'&&updates.qty&&updates.unitPrice){
    const cur=editState.data.currency; // 수정 화면엔 통화 입력칸이 없으므로, 원래 저장된 통화를 그대로 사용
    updates.subtotal=updates.qty*updates.unitPrice;
    updates.vat=cur==='KRW'?Math.round(updates.subtotal*.1):0;
    updates.total=updates.subtotal+updates.vat;
  }
  if(editState.col==='purchases'&&updates.qty&&updates.unitPrice){
    const cur=editState.data.currency;
    updates.subtotal=updates.qty*updates.unitPrice;
    updates.vat=cur==='KRW'?Math.round(updates.subtotal*.1):0;
    updates.total=updates.subtotal+updates.vat;
  }
  await updFromCol(editState.col,editState.id,updates);
  closeModal('edit-modal');alert('✅ 수정되었습니다!');
};

// ── 재고 현황 ──
function calcStock(){
  return cache.products.map(p=>{
    const initStock=p.stock||0;
    const safeStock=p.safeStock||0;
    // productId가 있으면 ID로만 매칭, 없으면 품목명+규격 둘 다 일치해야 매칭
    const matchBuy=r=>{
      if(r.productId) return r.productId===p.id;
      return (r.item||'')===(p.name||'')&&(r.spec||'')===(p.spec||'');
    };
    const matchSale=r=>{
      if(r.productId) return r.productId===p.id;
      return ((r.item||r.summary||'')===(p.name||''))&&(r.spec||'')===(p.spec||'');
    };
    const buyRows=cache.purchases.filter(matchBuy);
    const inQty=buyRows.reduce((s,r)=>s+(parseFloat(r.qty)||0),0);
    const lastBuy=[...buyRows].sort((a,b)=>(b.date||'')>(a.date||'')?1:-1)[0];
    const inPrice=lastBuy?.unitPrice||p.price||0;
    const inCurrency=lastBuy?.currency||p.currency||'KRW';
    const outQty=cache.sales.filter(matchSale).reduce((s,r)=>s+(parseFloat(r.qty)||0),0);
    const current=initStock+inQty-outQty;
    return{...p,initStock,inQty,inPrice,inCurrency,outQty,current,safeStock};
  });
}

function renderStock(){
  const stocks=calcStock();
  const adjSel=document.getElementById('adj-product');
  if(adjSel){
    adjSel.innerHTML='<option value="">— 품목 선택 —</option>'+
      cache.products.map(p=>`<option value="${p.id}">${p.name}${p.spec?' ('+p.spec+')':''}</option>`).join('');
  }

  // 재고금액 계산
  const stocksWithVal=stocks.map(s=>{
    const unitPrice=s.inPrice||s.price||0;
    const currency=s.inCurrency||s.currency||'KRW';
    const stockValue=s.current>0?Math.round(s.current*unitPrice):0;
    return{...s,unitPrice,stockValueCur:currency,stockValue};
  });

  const lowCount=stocksWithVal.filter(s=>s.current>0&&s.safeStock>0&&s.current<=s.safeStock).length;
  const zeroCount=stocksWithVal.filter(s=>s.current<=0).length;
  const totalValue=stocksWithVal.filter(s=>s.stockValueCur==='KRW').reduce((sum,s)=>sum+s.stockValue,0);

  const el=(id)=>document.getElementById(id);
  if(el('stock-total-items')) el('stock-total-items').textContent=stocks.length+'개';
  if(el('stock-low-count')) el('stock-low-count').textContent=lowCount+'개';
  if(el('stock-zero-count')) el('stock-zero-count').textContent=zeroCount+'개';
  if(el('stock-total-value')) el('stock-total-value').textContent=fmt(totalValue,'KRW');

  // 품목별 재고금액 테이블
  const valueBody=el('stock-value-tbody');
  if(valueBody){
    const sorted=[...stocksWithVal].sort((a,b)=>b.stockValue-a.stockValue);
    valueBody.innerHTML=sorted.length
      ?sorted.map((s,i)=>{
        const ratio=totalValue>0?Math.round(s.stockValue/totalValue*100):0;
        return `<tr>
          <td class="no-col">${i+1}</td>
          <td style="font-weight:600">${s.name}</td>
          <td style="color:var(--text2)">${s.spec||''}</td>
          <td style="text-align:right">${s.current>0?Number(s.current).toLocaleString():'0'}</td>
          <td style="text-align:right">${s.unitPrice?fmt(s.unitPrice,s.stockValueCur):'—'}</td>
          <td style="text-align:right;font-weight:700;color:#1a6b3c">${fmt(s.stockValue,s.stockValueCur)}</td>
          <td style="text-align:right">
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
              <div style="width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="width:${Math.max(ratio,1)}%;height:100%;background:#1a6b3c;border-radius:3px"></div>
              </div>
              <span style="font-size:11px;color:var(--text2);min-width:28px;text-align:right">${ratio}%</span>
            </div>
          </td>
        </tr>`;
      }).join('')
      :'<tr class="empty-row"><td colspan="7">품목을 등록해주세요</td></tr>';
    if(el('stock-value-total')) el('stock-value-total').textContent=fmt(totalValue,'KRW');
  }

  // 전체 재고 목록
  const tbody=el('stock-tbody');
  if(!tbody) return;
  tbody.innerHTML=stocksWithVal.length
    ?stocksWithVal.map((s,i)=>{
      let status,statusStyle,rowBg='';
      if(s.current<=0){status='⛔ 재고없음';statusStyle='color:#8b2020;font-weight:700';rowBg='background:#fff5f5';}
      else if(s.safeStock>0&&s.current<=s.safeStock){status='⚠️ 부족';statusStyle='color:#7a4a00;font-weight:700';rowBg='background:#fffbf0';}
      else{status='✅ 정상';statusStyle='color:#1a6b3c';rowBg='';}
      return `<tr style="${rowBg}">
        <td class="no-col">${i+1}</td>
        <td style="color:var(--text2);font-size:11px">${s.code||''}</td>
        <td style="font-weight:600">${s.name}</td>
        <td style="color:var(--text2)">${s.spec||''}</td>
        <td style="text-align:center">${s.unit||'EA'}</td>
        <td style="text-align:right">${Number(s.initStock).toLocaleString()}</td>
        <td style="text-align:right;color:#1a3a6b">${s.inQty?'+'+Number(s.inQty).toLocaleString():'0'}</td>
        <td style="text-align:right;color:#1a3a6b">${s.unitPrice?fmt(s.unitPrice,s.stockValueCur):'—'}</td>
        <td style="text-align:right;color:#8b2020">${s.outQty?'-'+Number(s.outQty).toLocaleString():'0'}</td>
        <td style="text-align:right;font-weight:700;font-size:15px">${Number(s.current).toLocaleString()}</td>
        <td style="text-align:right;font-weight:600;color:#1a6b3c">${s.stockValue?fmt(s.stockValue,s.stockValueCur):'—'}</td>
        <td style="text-align:right;color:var(--text2)">${s.safeStock||'—'}</td>
        <td style="${statusStyle}">${status}</td>
      </tr>`;
    }).join('')
    :'<tr class="empty-row"><td colspan="13">품목을 등록하면 재고가 표시됩니다</td></tr>';

  // 모바일 카드
  renderMobileCards('stock', stocksWithVal, mStockCard);
}

window.adjustStock=async function(){
  const id=document.getElementById('adj-product').value;
  const qty=parseFloat(document.getElementById('adj-qty').value);
  const reason=document.getElementById('adj-reason').value||'수동조정';
  if(!id){alert('품목을 선택하세요');return;}
  if(!qty||isNaN(qty)){alert('조정 수량을 입력하세요\n(입고: 양수 예) 10 / 출고: 음수 예) -5)');return;}
  const p=cache.products.find(r=>r.id===id);
  if(!p){alert('품목을 찾을 수 없습니다');return;}
  const before=p.stock||0;
  const after=before+qty;
  await updFromCol('products',id,{stock:after});
  document.getElementById('adj-qty').value='';
  document.getElementById('adj-reason').value='';
  alert(`✅ 재고 조정 완료!\n${p.name}: ${before} → ${after} (${qty>0?'+':''}${qty})`);
};

function loadSettingsToForm(){
  if(!currentUser) return;
  document.getElementById('s-uid').value=currentUser.displayId||currentUser.id;
  const co=getActiveCo();
  ['terms','footer'].forEach(f=>{const el=document.getElementById('s-'+f);if(el)el.value=co[f]||'';});
  // 회사별 도장 로드
  loadSealForActiveCo();
  // 도장 카드에 현재 회사명 표시
  const sealCoName=document.getElementById('seal-co-name');
  if(sealCoName) sealCoName.textContent=co.company?`(${co.company})`:'';
}
window.saveInvoiceSettings=async function(){
  const co=getActiveCo();
  co.terms=document.getElementById('s-terms').value;
  co.footer=document.getElementById('s-footer').value;
  companies[activeCoIdx]=co;
  await saveUserMeta();
  alert('✅ 저장되었습니다!');
};
window.saveAccountSettings=async function(){
  const newpw=document.getElementById('s-newpw').value;
  if(!newpw){alert('변경할 비밀번호를 입력하세요');return;}
  if(newpw.length<6){alert('비밀번호는 6자 이상이어야 합니다');return;}
  try{
    await auth.currentUser.updatePassword(newpw);
    // 레거시 해시가 아직 남아있다면 함께 정리
    await db.collection('users').doc(currentUser.safeId).update({pw:firebase.firestore.FieldValue.delete()}).catch(()=>{});
    document.getElementById('s-newpw').value='';
    alert('✅ 비밀번호가 변경되었습니다!');
  }catch(e){
    if(e.code==='auth/requires-recent-login'){
      alert('보안을 위해 비밀번호 변경 전 다시 로그인해 주세요. 로그아웃 후 다시 로그인한 뒤 시도해 주세요.');
    }else{
      alert('비밀번호 변경 중 오류가 발생했습니다: '+e.message);
    }
  }
};

window.changeLoginId = async function(btn) {
  const newId = document.getElementById('s-uid').value.trim();
  if (!newId) { alert('새 아이디를 입력하세요'); return; }
  if (newId === currentUser.id) { alert('현재 아이디와 동일합니다'); return; }
  
  if (!confirm(`아이디를 "${newId}"(으)로 변경하시겠습니까?\n\n변경 후에는 새로운 아이디로 다시 로그인해야 하며,\n모든 데이터가 안전하게 이동됩니다.`)) return;
  
  const oldSafeId = currentUser.safeId;
  const newSafeId = btoa(encodeURIComponent(newId)).replace(/[^a-zA-Z0-9]/g,'_');
  
  const oldText = btn ? btn.textContent : '변경';
  
  try {
    // 1. 중복 확인
    const checkSnap = await db.collection('users').doc(newSafeId).get();
    if (checkSnap.exists) { alert('이미 사용 중인 아이디입니다'); return; }

    // 2. Firebase Authentication 계정의 이메일(내부적으로 아이디 기반)을 먼저 변경
    //    (최근 로그인 필요 오류가 나면 데이터 이동 전에 여기서 중단됨)
    try {
      await auth.currentUser.updateEmail(authEmailOf(newSafeId));
    } catch (authErr) {
      if (authErr.code === 'auth/requires-recent-login') {
        alert('보안을 위해 아이디 변경 전 다시 로그인해 주세요. 로그아웃 후 다시 로그인한 뒤 시도해 주세요.');
        return;
      }
      throw authErr;
    }
    
    // 3. 마이그레이션 시작 (UI 알림)
    if (btn) {
      btn.disabled = true;
      btn.textContent = '변경 중...';
    }
    
    // 4. 사용자 문서 복사
    const userDoc = await db.collection('users').doc(oldSafeId).get();
    const userData = userDoc.data();
    userData.displayId = newId;
    await db.collection('users').doc(newSafeId).set(userData);
    
    // 5. 데이터 이동 (회사별 — 배열 인덱스가 아닌 회사 고유 ID 기준 경로 사용)
    const subCols = ['customers', 'products', 'sales', 'purchases'];
    for (let i = 0; i < companies.length; i++) {
      const coId = companies[i].id;
      if (!coId) continue; // 아직 고유 ID로 이전되지 않은 회사(정상적으론 발생하지 않음)
      for (const colName of subCols) {
        const subSnap = await db.collection(`users/${oldSafeId}/companies/${coId}/${colName}`).get();
        for (const doc of subSnap.docs) {
          await db.collection(`users/${newSafeId}/companies/${coId}/${colName}`).doc(doc.id).set(doc.data());
          await doc.ref.delete(); // 데이터 이동이므로 기존 데이터 삭제
        }
      }
      // 로컬스토리지 도장 이동
      const oldSealKey = `ierp_seal_img_${oldSafeId}_${i}`;
      const newSealKey = `ierp_seal_img_${newSafeId}_${i}`;
      const sealData = localStorage.getItem(oldSealKey);
      if (sealData) {
        localStorage.setItem(newSealKey, sealData);
        localStorage.removeItem(oldSealKey);
      }
    }
    
    // 6. 기존 사용자 문서 삭제
    await db.collection('users').doc(oldSafeId).delete();
    
    // 7. 로컬스토리지 정보 업데이트
    if (localStorage.getItem('ierp_saved_id')) localStorage.setItem('ierp_saved_id', newId);
    
    alert('✅ 아이디 변경이 완료되었습니다!\n새로운 아이디로 다시 로그인해 주세요.');
    location.reload(); 
    
  } catch (e) {
    alert('오류 발생: ' + e.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
};
window.exportData=function(){
  const a=document.createElement('a');
  a.href='data:application/json,'+encodeURIComponent(JSON.stringify({sales:cache.sales,purchases:cache.purchases,customers:cache.customers,products:cache.products,companies,exportedAt:new Date().toISOString()},null,2));
  a.download='ierp-export-'+today()+'.json';a.click();
};

window.importData=function(e){
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      const co=getActiveCo();
      if(!confirm(`데이터를 가져오시겠습니까?\n현재 선택된 회사 "${co.company || '현재 회사'}"에 데이터가 추가됩니다.\n\n⚠️ 주의: 기존 데이터와 중복될 수 있습니다.`)) return;
      
      let count=0;
      const collections=['customers','products','sales','purchases'];
      for(const col of collections){
        if(Array.isArray(data[col])){
          for(const item of data[col]){
            const {id, createdAt, ...cleanItem}=item; // 기존 ID와 생성일은 제외
            await addToCol(col, cleanItem);
            count++;
          }
        }
      }
      alert(`✅ 마이그레이션 완료!\n총 ${count}건의 데이터를 "${co.company}" 회사로 가져왔습니다.`);
      e.target.value='';
    }catch(err){
      alert('❌ 오류: 파일이 유효한 JSON이 아니거나 처리 중 문제가 발생했습니다.\n'+err.message);
    }
  };
  reader.readAsText(file);
};

window.exportExcel=async function(){
  // SheetJS 동적 로드
  if(!window.XLSX){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  const co=getActiveCo();
  const wb=XLSX.utils.book_new();

  // ── 헬퍼: 활성 컬럼 기반 데이터 생성 ──
  const getSheetData = (tableId, dataList) => {
    const order = colOrder[tableId];
    const active = activeCols[tableId];
    const cols = tableCols[tableId];
    const activeConfigs = order.filter(k => active.includes(k)).map(k => cols.find(c => c.k === k)).filter(Boolean);
    
    const header = [['No.', ...activeConfigs.map(c => c.l)]];
    const rows = dataList.map((r, i) => {
      const row = [i + 1];
      activeConfigs.forEach(c => {
        let val = r[c.k] || '';
        if (['unitPrice', 'subtotal', 'vat', 'total'].includes(c.k)) val = Math.round(val);
        row.push(val);
      });
      return row;
    });
    return { header, rows, configs: activeConfigs };
  };

  // ── 매출 시트 (커스텀 반영) ──
  const salesSheetData = getSheetData('sales', cache.sales);
  const salesSheet=XLSX.utils.aoa_to_sheet([...salesSheetData.header, ...salesSheetData.rows]);
  XLSX.utils.book_append_sheet(wb,salesSheet,'매출장부');

  // ── 매입 시트 (커스텀 반영) ──
  const purchSheetData = getSheetData('purchase', cache.purchases);
  const purchSheet=XLSX.utils.aoa_to_sheet([...purchSheetData.header, ...purchSheetData.rows]);
  XLSX.utils.book_append_sheet(wb,purchSheet,'매입장부');

  // ── 거래처 시트 ──
  const custHeader=[['No.','회사명','국가','사업자번호','담당자','연락처','이메일','주소','메모']];
  const custRows=cache.customers.map((r,i)=>[
    i+1, r.name||'', r.country||'', r.bizno||'',
    r.contact||'', r.tel||'', r.email||'', r.addr||'', r.memo||''
  ]);
  const custSheet=XLSX.utils.aoa_to_sheet([...custHeader,...custRows]);
  XLSX.utils.book_append_sheet(wb,custSheet,'거래처');

  // ── 품목 시트 ──
  const prodHeader=[['No.','품목코드','품목명','규격','제조사','기준단가','통화','단위','메모']];
  const prodRows=cache.products.map((r,i)=>[
    i+1, r.code||'', r.name||'', r.spec||'',
    r.maker||'', r.price||0, r.currency||'KRW', r.unit||'', r.memo||''
  ]);
  const prodSheet=XLSX.utils.aoa_to_sheet([...prodHeader,...prodRows]);
  XLSX.utils.book_append_sheet(wb,prodSheet,'품목');

  // ── 요약 시트 ──
  const totalSales=cache.sales.filter(r=>r.currency==='KRW').reduce((s,r)=>s+(r.total||0),0);
  const totalPurch=cache.purchases.filter(r=>r.currency==='KRW').reduce((s,r)=>s+(r.total||0),0);
  const summaryData=[
    ['iERP 데이터 내보내기'],
    [''],
    ['회사명', co.company||''],
    ['사업자번호', co.bizno||''],
    ['대표자', co.ceo||''],
    ['내보낸 날짜', today()],
    [''],
    ['항목','건수','KRW 합계'],
    ['매출', cache.sales.length, totalSales],
    ['매입', cache.purchases.length, totalPurch],
    ['손익(KRW)', '', totalSales-totalPurch],
    ['거래처', cache.customers.length, ''],
    ['품목', cache.products.length, ''],
  ];
  const summSheet=XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb,summSheet,'요약');

  // 파일 저장
  const filename=`iERP_${co.company||'데이터'}_${today()}.xlsx`;
  XLSX.writeFile(wb,filename);
  alert(`✅ 엑셀 파일이 다운로드되었습니다!\n파일명: ${filename}\n\n매출/매입 시트는 현재 설정된 항목 순서와 표시 여부가 반영되었습니다.`);
};

// ── 도장 이미지 관리 (회사별 분리) ──

function getSealKey(){ return `ierp_seal_img_${currentUser?.safeId||'x'}_${activeCoIdx}`; }

function loadSealForActiveCo(){
  sealImageBase64=localStorage.getItem(getSealKey())||'';
  renderSealPreview();
}

window.handleSealUpload=function(e){
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    sealImageBase64=ev.target.result;
    localStorage.setItem(getSealKey(),sealImageBase64);
    renderSealPreview();
    alert(`✅ "${getActiveCo().company||'현재 회사'}" 도장이 저장되었습니다!`);
  };
  reader.readAsDataURL(file);
};

window.removeSeal=function(){
  if(!confirm('이 회사의 도장 이미지를 삭제하시겠습니까?')) return;
  sealImageBase64='';
  localStorage.removeItem(getSealKey());
  renderSealPreview();
  alert('✅ 도장 이미지가 삭제되었습니다.');
};

function renderSealPreview(){
  const img=document.getElementById('seal-preview-img');
  const ph=document.getElementById('seal-preview-placeholder');
  if(!img||!ph) return;
  if(sealImageBase64){img.src=sealImageBase64;img.style.display='block';ph.style.display='none';}
  else{img.src='';img.style.display='none';ph.style.display='block';}
}

// ── 통합 검색 (Global Search) ──

window.openGlobalSearch = function() {
  document.getElementById('search-modal').style.display = 'flex';
  const input = document.getElementById('global-search-input');
  input.value = '';
  input.focus();
  document.getElementById('search-results').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">검색어를 입력해 주세요.</div>';
};

window.doGlobalSearch = function() {
  const q = document.getElementById('global-search-input').value.trim().toLowerCase();
  const resWrap = document.getElementById('search-results');
  if (!q) {
    resWrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">검색어를 입력해 주세요.</div>';
    return;
  }

  const results = [];
  
  // 1. 매출 검색
  cache.sales.forEach(r => {
    if ((r.buyer||'').toLowerCase().includes(q) || (r.item||'').toLowerCase().includes(q) || (r.invNo||'').toLowerCase().includes(q)) {
      results.push({ type: '매출', title: r.item || '매출 내역', sub: `${r.date} | ${r.buyer} | ${fmt(r.total, r.currency)}`, tab: 'sales' });
    }
  });

  // 2. 매입 검색
  cache.purchases.forEach(r => {
    if ((r.vendor||'').toLowerCase().includes(q) || (r.item||'').toLowerCase().includes(q) || (r.invNo||'').toLowerCase().includes(q)) {
      results.push({ type: '매입', title: r.item || '매입 내역', sub: `${r.date} | ${r.vendor} | ${fmt(r.total, r.currency)}`, tab: 'purchase' });
    }
  });

  // 3. 거래처 검색
  cache.customers.forEach(r => {
    if ((r.name||'').toLowerCase().includes(q) || (r.contact||'').toLowerCase().includes(q) || (r.bizno||'').toLowerCase().includes(q)) {
      results.push({ type: '거래처', title: r.name, sub: `${r.contact||'담당자 없음'} | ${r.tel||''} | ${r.addr||''}`, tab: 'customers' });
    }
  });

  // 4. 품목 검색
  cache.products.forEach(r => {
    if ((r.name||'').toLowerCase().includes(q) || (r.code||'').toLowerCase().includes(q) || (r.spec||'').toLowerCase().includes(q)) {
      results.push({ type: '품목', title: r.name, sub: `${r.code} | ${r.spec||''} | ${fmt(r.price, r.currency)}`, tab: 'products' });
    }
  });

  if (results.length === 0) {
    resWrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">검색 결과가 없습니다.</div>';
    return;
  }

  resWrap.innerHTML = results.map(r => `
    <div class="search-item" onclick="closeModal('search-modal');goto('${r.tab}')" 
         style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.2s">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span class="tag ${r.type==='매출'?'tag-sale':(r.type==='매입'?'tag-buy':'tag-usd')}" style="font-size:9px">${r.type}</span>
        <strong style="font-size:14px">${escapeHtml(r.title)}</strong>
      </div>
      <div style="font-size:12px;color:var(--text2)">${escapeHtml(r.sub)}</div>
    </div>
  `).join('');
};

// 단축키 리스너
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openGlobalSearch();
  }
});

// ── PDF 다운로드 (PDF Export) ──

window.downloadPdf = async function() {
  console.log('downloadPdf called');
  const preview = document.getElementById('inv-preview-area');
  if (!preview || !preview.innerHTML.trim()) {
    alert('먼저 "명세서 생성" 버튼을 눌러 미리보기를 확인해 주세요.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const loading = document.createElement('div');
  loading.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700';
  loading.innerHTML = 'PDF 생성 중... 잠시만 기다려 주세요.';
  document.body.appendChild(loading);

  try {
    const invA4s = preview.querySelectorAll('.inv-a4');
    const doc = new jsPDF('p', 'mm', 'a4');
    
    for (let i = 0; i < invA4s.length; i++) {
      if (i > 0) doc.addPage();
      const canvas = await html2canvas(invA4s[i], {
        scale: 2,
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      doc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    }

    const filename = `거래명세서_${document.getElementById('inv-no').value || today()}.pdf`;
    doc.save(filename);
    alert('✅ PDF 파일이 저장되었습니다.');
  } catch (err) {
    console.error(err);
    alert('❌ PDF 생성 중 오류가 발생했습니다.');
  } finally {
    document.body.removeChild(loading);
  }
};

// ── 샘플 데이터 생성 (Tester Tool) ──

window.generateSampleData = async function() {
  if (!confirm('테스트용 샘플 데이터를 생성하시겠습니까?\n기존 데이터와 섞여서 생성되며, 6개월치 거래 내역이 추가됩니다.')) return;

  const loading = document.createElement('div');
  loading.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;text-align:center';
  loading.innerHTML = '샘플 데이터 생성 중...<br>잠시만 기다려 주세요.';
  document.body.appendChild(loading);

  try {
    // 1. 샘플 거래처
    const sampleCusts = [
      { name: '(주)테크솔루션', contact: '김철수 팀장', bizno: '123-45-67890', addr: '서울시 강남구 테헤란로 123', isSample: true },
      { name: '대성자동화', contact: '이영희 대표', bizno: '234-56-78901', addr: '경기도 안산시 단원구 산업로 45', isSample: true },
      { name: '글로벌파츠', contact: '박민준 과장', bizno: '345-67-89012', addr: '인천시 남동구 남동대로 78', isSample: true }
    ];
    const custIds = [];
    for (const c of sampleCusts) {
      const doc = await addToCol('customers', c);
      custIds.push({ id: doc.id, name: c.name });
    }

    // 2. 샘플 품목
    const sampleProds = [
      { name: '서보 모터 S-200', code: 'SM-200', spec: '200W, 3000rpm', price: 450000, currency: 'KRW', unit: 'EA', isSample: true },
      { name: '센서 모듈 M18', code: 'SN-M18', spec: '근접센서 NPN', price: 35000, currency: 'KRW', unit: 'EA', isSample: true },
      { name: '리니어 가이드 15', code: 'LG-15', spec: 'L=1000mm', price: 120000, currency: 'KRW', unit: 'EA', isSample: true }
    ];
    const prodIds = [];
    for (const p of sampleProds) {
      const doc = await addToCol('products', p);
      prodIds.push({ id: doc.id, ...p });
    }

    // 3. 6개월치 거래 (매출/매입 약 40건)
    const now = new Date();
    for (let i = 0; i < 40; i++) {
      const isSale = Math.random() > 0.4;
      const d = new Date();
      d.setDate(now.getDate() - Math.floor(Math.random() * 180)); // 최근 180일
      const dateStr = d.toISOString().slice(0, 10);
      
      const cust = custIds[Math.floor(Math.random() * custIds.length)];
      const prod = prodIds[Math.floor(Math.random() * prodIds.length)];
      const qty = Math.floor(Math.random() * 10) + 1;
      const subtotal = qty * prod.price;
      const vat = isSale ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + vat;

      if (isSale) {
        await addToCol('sales', {
          date: dateStr,
          buyer: cust.name,
          customer: cust.name,
          customerId: cust.id,
          productId: prod.id,
          item: prod.name,
          spec: prod.spec,
          qty,
          unitPrice: prod.price,
          currency: 'KRW',
          subtotal,
          vat,
          total,
          invNo: `INV-TEST-${1000 + i}`,
          memo: '샘플 데이터',
          isSample: true
        });
      } else {
        await addToCol('purchases', {
          date: dateStr,
          vendor: cust.name, // 편의상 같은 거래처 사용
          item: prod.name,
          spec: prod.spec,
          qty,
          unitPrice: prod.price * 0.8, // 매입가는 80%
          currency: 'KRW',
          subtotal: qty * prod.price * 0.8,
          vat: 0,
          total: qty * prod.price * 0.8,
          invNo: `PUR-${2000 + i}`,
          memo: '샘플 매입',
          isSample: true
        });
      }
    }

    alert('✅ 샘플 데이터 생성이 완료되었습니다!\n이제 대시보드와 장부에서 풍성한 데이터를 확인해 보세요.');
    goto('dash');
  } catch (err) {
    console.error(err);
    alert('❌ 데이터 생성 중 오류가 발생했습니다.');
  } finally {
    document.body.removeChild(loading);
  }
};

window.resetCurrentCompanyData = async function() {
  const co = getActiveCo();
  if (!confirm(`⚠️ "${co.company || '현재 회사'}"의 샘플 데이터만 삭제하시겠습니까?\n수동으로 입력하신 실제 데이터는 유지됩니다.\n삭제 후에는 복구할 수 없습니다.`)) return;
  
  const loading = document.createElement('div');
  loading.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;text-align:center';
  loading.innerHTML = '샘플 데이터 삭제 중...<br>잠시만 기다려 주세요.';
  document.body.appendChild(loading);

  try {
    const collections = ['sales', 'purchases', 'customers', 'products'];
    let totalDeleted = 0;
    for (const coll of collections) {
      // isSample이 true인 것만 쿼리
      const snap = await colPath(coll).where('isSample', '==', true).get();
      if (snap.empty) continue;

      const batch = db.batch();
      snap.docs.forEach(doc => {
        batch.delete(doc.ref);
        totalDeleted++;
      });
      await batch.commit();
    }
    
    if (totalDeleted === 0) {
      alert('삭제할 샘플 데이터가 없습니다.');
    } else {
      alert(`✅ 총 ${totalDeleted}건의 샘플 데이터가 삭제되었습니다.\n수동 입력 데이터는 안전하게 보존되었습니다.`);
      location.reload(); 
    }
  } catch (err) {
    console.error(err);
    alert('❌ 초기화 중 오류가 발생했습니다.');
  } finally {
    document.body.removeChild(loading);
  }
};
function isMobile(){ return window.innerWidth<=768; }

window.openMobileMenu = function() {
  const body = document.getElementById('sheet-body');
  document.getElementById('sheet-title-text').textContent = '메뉴';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:20px">
      <button class="btn" onclick="closeSheet();goto('dash')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">📊<br>대시보드</button>
      <button class="btn" onclick="closeSheet();goto('daily')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">📅<br>일별현황</button>
      <button class="btn" onclick="closeSheet();goto('sales')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">📈<br>매출장부</button>
      <button class="btn" onclick="closeSheet();goto('purchase')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">📥<br>매입장부</button>
      <button class="btn" onclick="closeSheet();goto('stock')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">📦<br>재고현황</button>
      <button class="btn" onclick="closeSheet();goto('customers')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">🏢<br>거래처</button>
      <button class="btn" onclick="closeSheet();goto('products')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">🔧<br>품목</button>
      <button class="btn" onclick="closeSheet();goto('settings')" style="flex-direction:column;padding:12px 5px;height:auto;font-size:11px">⚙️<br>설정</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn" onclick="closeSheet();openGlobalSearch()" style="justify-content:flex-start;padding:12px">🔍 통합 검색 (Ctrl+K)</button>
      <button class="btn" onclick="closeSheet();toggleDarkMode()" style="justify-content:flex-start;padding:12px">🌓 테마 전환</button>
      <button class="btn btn-danger" onclick="closeSheet();doLogout()" style="justify-content:flex-start;padding:12px">🚪 로그아웃</button>
    </div>
  `;
  openSheet();
};

window.openFab=function(){
  const activePanel=document.querySelector('.panel.active');
  if(!activePanel) return;
  const id=activePanel.id.replace('panel-','');

  // PC 환경에서 등록 카드가 접혀있다면 펼쳐줌
  const regCardIds = {sales: 'card-sale-reg', purchase: 'card-buy-reg', customers: 'card-cust-reg', products: 'card-prod-reg'};
  const targetCardId = regCardIds[id];
  if (targetCardId) {
    const card = document.getElementById(targetCardId);
    if (card && card.classList.contains('collapsed')) {
      card.classList.remove('collapsed');
      if (!isMobile()) return; // PC라면 펼치기만 하고 종료 (모바일은 시트도 열어줌)
    }
  }

  const titles={sales:'매출 등록',purchase:'매입 등록',customers:'거래처 등록',products:'품목 등록'};
  if(!titles[id]) return;

  // 모바일/PC 상관없이 시트 열기
  document.getElementById('sheet-title-text').textContent=titles[id];
  const body=document.getElementById('sheet-body');

  if(id==='sales'){
    populateSelects();
    body.innerHTML=`
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="fg"><label>날짜</label><input type="date" id="ms-sale-date" value="${today()}"></div>
        <div class="fg"><label>거래처</label><select id="ms-sale-customer">${document.getElementById('sale-customer').innerHTML}</select></div>
        <div class="fg"><label>품목 선택</label><select id="ms-sale-product-sel" onchange="mFillSaleProduct(this)">${document.getElementById('sale-product-sel').innerHTML}</select></div>
        <div class="fg"><label>품목명</label><input id="ms-sale-item" placeholder="품목명"></div>
        <div class="fg"><label>규격</label><input id="ms-sale-spec" placeholder="규격"></div>
        <div class="fg"><label>수량</label><input id="ms-sale-qty" value="1" oninput="fmtInput(this);mCalcSale()"></div>
        <div class="fg"><label>단가</label><input id="ms-sale-price" placeholder="0" oninput="fmtInput(this);mCalcSale()"></div>
        <div class="fg"><label>통화</label><select id="ms-sale-cur" onchange="mCalcSale()"><option>KRW</option><option>USD</option><option>JPY</option><option>EUR</option></select></div>
        <div class="fg"><label>공급가액</label><input id="ms-sale-subtotal" readonly style="background:var(--surface2);font-weight:600"></div>
        <div class="fg"><label>세액</label><input id="ms-sale-vat" readonly style="background:var(--surface2)"></div>
        <div class="fg"><label>합계</label><input id="ms-sale-total" readonly style="background:var(--surface2);font-weight:700"></div>
        <div class="fg"><label>비고</label><input id="ms-sale-memo" placeholder="비고"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:14px;font-size:15px" onclick="mSaveSale()">💾 매출 저장</button>`;
  } else if(id==='purchase'){
    populateSelects();
    body.innerHTML=`
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="fg"><label>날짜</label><input type="date" id="ms-buy-date" value="${today()}"></div>
        <div class="fg"><label>공급업체</label><input id="ms-buy-vendor" placeholder="공급업체명"></div>
        <div class="fg"><label>품목 선택</label><select id="ms-buy-product-sel" onchange="mFillBuyProduct(this)">${document.getElementById('buy-product-sel').innerHTML}</select></div>
        <div class="fg"><label>품목명</label><input id="ms-buy-item" placeholder="품목명"></div>
        <div class="fg"><label>규격</label><input id="ms-buy-spec" placeholder="규격"></div>
        <div class="fg"><label>수량</label><input id="ms-buy-qty" value="1" oninput="fmtInput(this);mCalcBuy()"></div>
        <div class="fg"><label>단가</label><input id="ms-buy-price" placeholder="0" oninput="fmtInput(this);mCalcBuy()"></div>
        <div class="fg"><label>통화</label><select id="ms-buy-cur" onchange="mCalcBuy()"><option>KRW</option><option>USD</option><option>JPY</option><option>EUR</option></select></div>
        <div class="fg"><label>합계</label><input id="ms-buy-total" readonly style="background:var(--surface2);font-weight:700"></div>
        <div class="fg"><label>인보이스번호</label><input id="ms-buy-invno" placeholder="INV-00000"></div>
        <div class="fg"><label>비고</label><input id="ms-buy-memo" placeholder="비고"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:14px;font-size:15px" onclick="mSavePurchase()">💾 매입 저장</button>`;
  } else if(id==='customers'){
    body.innerHTML=`
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="fg"><label>회사명 *</label><input id="ms-c-name" placeholder="회사명"></div>
        <div class="fg"><label>사업자번호</label><input id="ms-c-bizno" placeholder="000-00-00000"></div>
        <div class="fg"><label>국가</label><select id="ms-c-country"><option>한국</option><option>일본</option><option>미국</option><option>중국</option><option>독일</option><option>대만</option><option>기타</option></select></div>
        <div class="fg"><label>담당자</label><input id="ms-c-contact" placeholder="담당자명"></div>
        <div class="fg"><label>연락처</label><input id="ms-c-tel" placeholder="010-0000-0000"></div>
        <div class="fg"><label>이메일</label><input id="ms-c-email" placeholder="이메일"></div>
        <div class="fg"><label>주소</label><input id="ms-c-addr" placeholder="주소"></div>
        <div class="fg"><label>메모</label><input id="ms-c-memo" placeholder="메모"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:14px;font-size:15px" onclick="mSaveCustomer()">💾 거래처 저장</button>`;
  } else if(id==='products'){
    const nextCode = getNextProductCode();
    body.innerHTML=`
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="fg"><label>품목코드</label><input id="ms-p-code" value="${nextCode}"></div>
        <div class="fg"><label>품목명 *</label><input id="ms-p-name" placeholder="품목명"></div>
        <div class="fg"><label>규격</label><input id="ms-p-spec" placeholder="규격"></div>
        <div class="fg"><label>제조사</label><input id="ms-p-maker" placeholder="제조사"></div>
        <div class="fg"><label>기준단가</label><input id="ms-p-price" placeholder="0" oninput="fmtInput(this)"></div>
        <div class="fg"><label>통화</label><select id="ms-p-cur"><option>KRW</option><option>USD</option><option>JPY</option><option>EUR</option></select></div>
        <div class="fg"><label>단가</label><input id="ms-p-unit" placeholder="EA/SET/BOX"></div>
        <div class="fg"><label>초기재고</label><input type="number" id="ms-p-stock" value="0"></div>
        <div class="fg"><label>안전재고</label><input type="number" id="ms-p-safestock" value="0"></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:14px;font-size:15px" onclick="mSaveProduct()">💾 품목 저장</button>`;
  }
  openSheet();
};

window.openSheet=function(){
  document.getElementById('mobile-sheet').classList.add('open');
  document.getElementById('sheet-overlay').classList.add('open');
  document.body.style.overflow = 'hidden'; // 시트 열릴 때 배경 스크롤 방지
};
window.closeSheet=function(){
  document.getElementById('mobile-sheet').classList.remove('open');
  document.getElementById('sheet-overlay').classList.remove('open');
  document.body.style.overflow = ''; // 시트 닫힐 때 복구
};

// 모바일 자동계산
window.mCalcSale=function(){
  const qty=rawNum(document.getElementById('ms-sale-qty')?.value);
  const price=rawNum(document.getElementById('ms-sale-price')?.value);
  const cur=document.getElementById('ms-sale-cur')?.value||'KRW';
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const el=(id)=>document.getElementById(id);
  if(el('ms-sale-subtotal')) el('ms-sale-subtotal').value=Math.round(sub).toLocaleString();
  if(el('ms-sale-vat')) el('ms-sale-vat').value=vat.toLocaleString();
  if(el('ms-sale-total')) el('ms-sale-total').value=Math.round(sub+vat).toLocaleString();
};
window.mCalcBuy=function(){
  const qty=rawNum(document.getElementById('ms-buy-qty')?.value);
  const price=rawNum(document.getElementById('ms-buy-price')?.value);
  const el=document.getElementById('ms-buy-total');
  if(el) el.value=Math.round(qty*price).toLocaleString();
};
window.mFillSaleProduct=function(sel){
  const opt=sel.options[sel.selectedIndex];
  if(!opt?.value) return;
  const n=(id)=>document.getElementById(id);
  if(n('ms-sale-item')) n('ms-sale-item').value=opt.getAttribute('data-name')||'';
  if(n('ms-sale-spec')) n('ms-sale-spec').value=opt.getAttribute('data-spec')||'';
  if(n('ms-sale-price')) n('ms-sale-price').value=Number(opt.getAttribute('data-price')||0).toLocaleString();
  mCalcSale();
};
window.mFillBuyProduct=function(sel){
  const opt=sel.options[sel.selectedIndex];
  if(!opt?.value) return;
  const n=(id)=>document.getElementById(id);
  if(n('ms-buy-item')) n('ms-buy-item').value=opt.getAttribute('data-name')||'';
  if(n('ms-buy-spec')) n('ms-buy-spec').value=opt.getAttribute('data-spec')||'';
};

// 모바일 저장 함수
window.mSaveSale=async function(){
  const qty=rawNum(document.getElementById('ms-sale-qty').value);
  const price=rawNum(document.getElementById('ms-sale-price').value);
  const item=document.getElementById('ms-sale-item').value;
  const cur=document.getElementById('ms-sale-cur').value;
  if(!item||!price){alert('품목명과 단가를 입력하세요');return;}
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const custSel=document.getElementById('ms-sale-customer');
  const custName=custSel?.options[custSel.selectedIndex]?.text||'';
  const prodSel=document.getElementById('ms-sale-product-sel');
  try {
    await addToCol('sales',{
      date:document.getElementById('ms-sale-date').value,
      buyer:custName,customer:custName,
      productId:prodSel?.value||'',
      item,spec:document.getElementById('ms-sale-spec').value,
      summary:item,qty,unitPrice:price,currency:cur,
      subtotal:sub,vat,total:sub+vat,
      memo:document.getElementById('ms-sale-memo').value
    });
    closeSheet();
    alert('✅ 매출이 등록되었습니다!');
  } catch (e) {
    alert('❌ 저장 실패: ' + e.message);
    console.error(e);
  }
};
window.mSavePurchase=async function(){
  const qty=rawNum(document.getElementById('ms-buy-qty').value);
  const price=rawNum(document.getElementById('ms-buy-price').value);
  const cur=document.getElementById('ms-buy-cur').value;
  if(!price){alert('단가를 입력하세요');return;}
  const sub=qty*price;
  const vat=cur==='KRW'?Math.round(sub*.1):0;
  const prodSel=document.getElementById('ms-buy-product-sel');
  try {
    await addToCol('purchases',{
      date:document.getElementById('ms-buy-date').value,
      vendor:document.getElementById('ms-buy-vendor').value,
      item:document.getElementById('ms-buy-item').value,
      spec:document.getElementById('ms-buy-spec').value,
      productId:prodSel?.value||'',
      qty,unitPrice:price,currency:cur,
      subtotal:sub,vat,total:sub+vat,
      invNo:document.getElementById('ms-buy-invno').value,
      memo:document.getElementById('ms-buy-memo').value
    });
    closeSheet();
    alert('✅ 매입이 저장되었습니다!');
  } catch (e) {
    alert('❌ 저장 실패: ' + e.message);
    console.error(e);
  }
};
window.mSaveCustomer=async function(){
  const name=document.getElementById('ms-c-name').value.trim();
  if(!name){alert('회사명을 입력하세요');return;}
  await addToCol('customers',{
    name,bizno:document.getElementById('ms-c-bizno').value,
    country:document.getElementById('ms-c-country').value,
    contact:document.getElementById('ms-c-contact').value,
    tel:document.getElementById('ms-c-tel').value,
    email:document.getElementById('ms-c-email').value,
    addr:document.getElementById('ms-c-addr').value,
    memo:document.getElementById('ms-c-memo').value
  });
  closeSheet();
  alert('✅ 거래처가 저장되었습니다!');
};
window.mSaveProduct=async function(){
  const name=document.getElementById('ms-p-name').value.trim();
  if(!name){alert('품목명을 입력하세요');return;}
  await addToCol('products',{
    code:document.getElementById('ms-p-code').value,
    name,spec:document.getElementById('ms-p-spec').value,
    maker:document.getElementById('ms-p-maker').value,
    price:rawNum(document.getElementById('ms-p-price').value),
    currency:document.getElementById('ms-p-cur').value,
    unit:document.getElementById('ms-p-unit').value,
    stock:parseFloat(document.getElementById('ms-p-stock').value)||0,
    safeStock:parseFloat(document.getElementById('ms-p-safestock').value)||0
  });
  closeSheet();
  alert('✅ 품목이 저장되었습니다!');
};
const GCV_KEY='AIzaSyBYVd_Q4tjVnTzdCN8si9wpEReSh9Tzl7k';

async function fileToBase64(file){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=()=>res(reader.result.split(',')[1]);
    reader.onerror=rej;
    reader.readAsDataURL(file);
  });
}

async function callVisionOcr(file){
  const base64=await fileToBase64(file);
  const res=await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GCV_KEY}`,{
    method:'POST',
    referrerPolicy:'no-referrer-when-downgrade',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      requests:[{
        image:{content:base64},
        features:[{type:'DOCUMENT_TEXT_DETECTION',maxResults:1}],
        imageContext:{languageHints:['ko','en']}
      }]
    })
  });
  if(!res.ok){
    const err=await res.json().catch(()=>({}));
    throw new Error(err?.error?.message||`HTTP ${res.status}`);
  }
  const data=await res.json();
  if(data.error) throw new Error(data.error.message||'Vision API 오류');
  const text=data.responses?.[0]?.fullTextAnnotation?.text||
             data.responses?.[0]?.textAnnotations?.[0]?.description||'';
  if(!text.trim()) throw new Error('텍스트를 인식하지 못했습니다. 더 선명한 사진을 사용해주세요.');
  return text;
}

// ── 메인 OCR 모달용 ──
window.openAiScan=function(target){
  aiTarget=target;aiResult={};
  const titles={
    customer:'📸 명함 / 거래처 서류 자동입력 (Google Vision OCR)',
    company:'📸 사업자등록증 자동입력 (Google Vision OCR)',
    newco:'📸 사업자등록증 자동입력 (Google Vision OCR)'
  };
  document.getElementById('ai-modal-title').textContent=titles[target]||'자동입력';
  document.getElementById('ai-status').innerHTML='';
  document.getElementById('ai-preview').style.display='none';
  document.getElementById('file-input').value='';
  document.getElementById('ai-modal').style.display='flex';
};

window.handleDrop=function(e){
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  const file=e.dataTransfer.files[0];
  if(file) processOcrFile(file);
};
window.handleFileSelect=function(e){
  const file=e.target.files[0];
  if(file) processOcrFile(file);
};

async function processOcrFile(file){
  document.getElementById('ai-status').innerHTML=`<div class="ai-loading"><div class="spinner"></div>Google Vision이 이미지를 분석 중입니다...</div>`;
  document.getElementById('ai-preview').style.display='none';
  try{
    const text=await callVisionOcr(file);
    const isCompany=(aiTarget==='company'||aiTarget==='newco');
    aiResult=isCompany?parseBizDoc(text):parseCardDoc(text);
    aiResult._rawText=text;
    showOcrPreview(text);
  }catch(e){
    document.getElementById('ai-status').innerHTML=`<div style="color:var(--red);font-size:13px;padding:10px">❌ 인식 실패: ${e.message}<br>더 선명한 사진으로 다시 시도하거나 직접 입력해주세요.</div>`;
  }
}

function showOcrPreview(rawText){
  document.getElementById('ai-status').innerHTML='';
  const isCompany=(aiTarget==='company'||aiTarget==='newco');
  const fieldDefs=isCompany
    ?[{k:'company',l:'상호명'},{k:'bizno',l:'사업자번호'},{k:'ceo',l:'대표자명'},{k:'biztype',l:'업태'},{k:'bizitem',l:'종목'},{k:'addr',l:'주소'},{k:'tel',l:'전화번호'},{k:'email',l:'이메일'}]
    :[{k:'name',l:'회사명'},{k:'bizno',l:'사업자번호'},{k:'contact',l:'담당자'},{k:'tel',l:'전화번호'},{k:'email',l:'이메일'},{k:'addr',l:'주소'},{k:'memo',l:'메모'}];

  document.getElementById('ai-fields').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px">
      ${fieldDefs.map(f=>`<div class="fg"><label>${f.l}</label><input id="ai-f-${f.k}" value="${(aiResult[f.k]||'').replace(/"/g,'&quot;')}"></div>`).join('')}
    </div>
    <details style="font-size:11px;color:var(--text2);margin-top:4px">
      <summary style="cursor:pointer;font-weight:600">📄 인식된 원문 보기 (수동 확인용)</summary>
      <pre style="margin-top:8px;padding:10px;background:var(--surface2);border-radius:6px;white-space:pre-wrap;font-size:11px;max-height:150px;overflow-y:auto">${rawText.replace(/</g,'&lt;')}</pre>
    </details>`;
  document.getElementById('ai-preview').style.display='block';
}

window.applyAiResult=function(){
  const isCompany=(aiTarget==='company'||aiTarget==='newco');
  const fieldDefs=isCompany
    ?[{k:'company',l:'상호명'},{k:'bizno',l:'사업자번호'},{k:'ceo',l:'대표자명'},{k:'biztype',l:'업태'},{k:'bizitem',l:'종목'},{k:'addr',l:'주소'},{k:'tel',l:'전화번호'},{k:'email',l:'이메일'}]
    :[{k:'name',l:'회사명'},{k:'bizno',l:'사업자번호'},{k:'contact',l:'담당자'},{k:'tel',l:'전화번호'},{k:'email',l:'이메일'},{k:'addr',l:'주소'},{k:'memo',l:'메모'}];

  const map={
    customer: {name:'c-name',bizno:'c-bizno',contact:'c-contact',tel:'c-tel',email:'c-email',addr:'c-addr',memo:'c-memo'},
    company: {company:'s-company',bizno:'s-bizno',ceo:'s-ceo',biztype:'s-biztype',bizitem:'s-bizitem',addr:'s-addr',tel:'s-tel',email:'s-email'},
    newco: {company:'nc-company',bizno:'nc-bizno',ceo:'nc-ceo',biztype:'nc-biztype',bizitem:'nc-bizitem',addr:'nc-addr',tel:'nc-tel',email:'nc-email'}
  };
  const targetMap=map[aiTarget];
  if(targetMap){
    fieldDefs.forEach(f=>{
      const val=document.getElementById('ai-f-'+f.k)?.value;
      if(val && targetMap[f.k]){
        const el=document.getElementById(targetMap[f.k]);
        if(el) el.value=val;
      }
    });
  }
  closeModal('ai-modal');
  alert('✅ 정보가 성공적으로 적용되었습니다!');
};

// ── 새 회사 추가 모달 전용 OCR ──
window.handleAddcoDrop=function(e){
  e.preventDefault();
  const file=e.dataTransfer.files[0];
  if(file) processAddcoOcr(file);
};
window.handleAddcoFileSelect=function(e){
  const file=e.target.files[0];
  if(file) processAddcoOcr(file);
};

async function processAddcoOcr(file){
  const status=document.getElementById('addco-ocr-status');
  const zone=document.getElementById('addco-upload-zone');
  if(zone){zone.style.borderColor='#1a6b3c';zone.style.background='#e8f5ee';}
  status.innerHTML=`<div style="display:flex;align-items:center;gap:8px;color:#6b6960;font-size:13px;padding:8px 0"><div class="spinner"></div>Google Vision 인식 중...</div>`;
  try{
    const text=await callVisionOcr(file);
    const parsed=parseBizDoc(text);
    const map={company:'nc-company',bizno:'nc-bizno',ceo:'nc-ceo',biztype:'nc-biztype',bizitem:'nc-bizitem',tel:'nc-tel',addr:'nc-addr',email:'nc-email'};
    Object.entries(map).forEach(([k,id])=>{
      const el=document.getElementById(id);
      if(el&&parsed[k]) el.value=parsed[k];
    });
    if(zone){
      zone.innerHTML=`<div style="font-size:20px">✅</div><div style="font-size:13px;font-weight:600;color:#1a6b3c;margin-top:4px">자동입력 완료!</div><div style="font-size:11px;color:#1a6b3c;margin-top:2px">${parsed.company||'인식 완료'} — 내용을 확인 후 수정하세요</div>`;
    }
    status.innerHTML=`<div style="background:#e8f5ee;border:1px solid #a0d4b0;border-radius:6px;padding:8px 12px;font-size:12px;color:#1a6b3c;margin-bottom:8px">✅ 인식 완료! 아래 내용을 확인하고 필요시 수정 후 저장하세요.</div>`;
  }catch(e){
    if(zone){
      zone.style.borderColor='#a0d4b0';zone.style.background='#f0faf4';
      zone.innerHTML=`<div style="font-size:22px">📸</div><div style="font-size:13px;font-weight:600;color:#1a6b3c;margin-top:4px">사업자등록증 사진으로 자동입력</div><div style="font-size:11px;color:#6b6960;margin-top:2px">클릭하거나 파일을 드래그하세요</div>`;
    }
    status.innerHTML=`<div style="color:#8b2020;font-size:12px;padding:6px 0">❌ 인식 실패: ${e.message}</div>`;
  }
}

// ── 회원가입 사업자등록증 OCR ──
window.handleRegDrop=function(e){
  e.preventDefault();
  const file=e.dataTransfer.files[0];
  if(file) processRegOcr(file);
};
window.handleRegFileSelect=function(e){
  const file=e.target.files[0];
  if(file) processRegOcr(file);
};

async function processRegOcr(file){
  const status=document.getElementById('reg-ai-status');
  const zone=document.getElementById('reg-upload-zone');
  if(zone){zone.style.borderColor='#1a6b3c';zone.style.background='#e8f5ee';}
  status.innerHTML=`<div style="display:flex;align-items:center;gap:8px;color:#6b6960;font-size:13px;padding:10px 0"><div class="spinner"></div>Google Vision 인식 중...</div>`;
  try{
    const text=await callVisionOcr(file);
    const parsed=parseBizDoc(text);
    const map={company:'r-company',bizno:'r-bizno',ceo:'r-ceo',biztype:'r-biztype',bizitem:'r-bizitem',addr:'r-addr',tel:'r-tel',email:'r-email'};
    Object.entries(map).forEach(([k,id])=>{
      const el=document.getElementById(id);
      if(el&&parsed[k]) el.value=parsed[k];
    });
    if(zone){
      zone.style.borderColor='#1a6b3c';zone.style.background='#e8f5ee';
      zone.innerHTML=`<div style="font-size:20px">✅</div><div style="font-size:13px;font-weight:600;color:#1a6b3c;margin-top:4px">자동입력 완료!</div><div style="font-size:11px;color:#1a6b3c;margin-top:2px">${parsed.company||'인식 완료'} — 내용을 확인 후 수정하세요</div>`;
    }
    status.innerHTML=`<div style="background:#e8f5ee;border:1px solid #a0d4b0;border-radius:8px;padding:10px 12px;font-size:12px;color:#1a6b3c;margin-top:4px">✅ 인식 완료! 내용을 확인하고 필요시 수정 후 회원가입 버튼을 누르세요.</div>`;
  }catch(e){
    if(zone){
      zone.style.borderColor='#cccab8';zone.style.background='#f5f4f0';
      zone.innerHTML=`<div style="font-size:24px">📸</div><div style="font-size:13px;font-weight:600;color:#1a1917;margin-top:4px">사업자등록증 사진으로 자동입력</div><div style="font-size:11px;color:#6b6960;margin-top:2px">클릭하거나 파일을 드래그하세요</div>`;
    }
    status.innerHTML=`<div style="color:#8b2020;font-size:12px;padding:8px 0">❌ 인식 실패: ${e.message} — 직접 입력해주세요.</div>`;
  }
}

// OCR 텍스트에서 사업자등록증 정보 파싱
function parseBizDoc(text){
  const r={company:'',bizno:'',ceo:'',biztype:'',bizitem:'',addr:'',tel:''};
  const lines=text.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  const full=text.replace(/\s+/g,' ');

  // ── 사업자번호: 000-00-00000 패턴 ──
  const biznoMatch=full.match(/등록번호\s*[:：]?\s*(\d{3}-\d{2}-\d{5})/)||full.match(/(\d{3}-\d{2}-\d{5})/);
  if(biznoMatch) r.bizno=biznoMatch[1];

  // ── 전화번호 / 핸드폰 ──
  const telMatch=full.match(/C\.?P\.?\s*([\d\-]+)/i)||full.match(/(01[0-9]-\d{3,4}-\d{4})/)||full.match(/(0\d{1,2}-\d{3,4}-\d{4})/);
  if(telMatch) r.tel=telMatch[1];

  // ── 이메일 ──
  const emailMatch=full.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if(emailMatch) r.email=emailMatch[1];

  // ── 상호명 파싱 ──
  // 법인사업자: "법인명(단체명) : 주식회사 겐시스템" 또는 "법인명 : ..."
  const corpMatch=full.match(/법인명\s*[\(（단체명\)）]*\s*[:：]\s*([^\n대표법인개사업]+)/);
  if(corpMatch){
    r.company=corpMatch[1].trim().replace(/\s{2,}/g,' ');
  }
  // 일반과세자: "상 호 : 겐시스템" 또는 "상호 : ..."
  if(!r.company){
    const bizNameMatch=full.match(/상\s*호\s*[:：]\s*([^\n성명대표개사업]+)/);
    if(bizNameMatch) r.company=bizNameMatch[1].trim().replace(/\s{2,}/g,' ');
  }
  // 하단 괄호 표기 "(주)겐시스템" 형태도 탐색
  if(!r.company){
    const shortMatch=full.match(/[\(（(]?주[\)）)]\s*([가-힣a-zA-Z0-9]+)/);
    if(shortMatch) r.company='(주)'+shortMatch[1];
  }

  // ── 대표자 파싱 ──
  // 법인: "대 표 자 : 서광덕"
  const ceoMatch=full.match(/대\s*표\s*자\s*[:：]\s*([가-힣a-zA-Z]{2,6})/);
  if(ceoMatch) r.ceo=ceoMatch[1].trim();
  // 일반: "성 명 : 서광덕"
  if(!r.ceo){
    const nameMatch=full.match(/성\s*명\s*[:：]\s*([가-힣a-zA-Z]{2,6})/);
    if(nameMatch) r.ceo=nameMatch[1].trim();
  }

  // ── 주소 파싱 ──
  // "사업장 소재지 : ..." 또는 "사업장소재지 : ..."
  const addrMatch=full.match(/사업장\s*소\s*재\s*지\s*[:：]\s*([^\n본점법인발급]+)/)||
                  full.match(/사\s*업\s*장\s*소\s*재\s*지\s*[:：]\s*([^\n]+)/);
  if(addrMatch) r.addr=addrMatch[1].trim().replace(/\s{2,}/g,' ').slice(0,60);

  // ── 업태/종목 파싱 ──
  // "업태 도매 및 소매업  종목 그 외 기타..."
  const bizMatch=full.match(/업\s*태\s*([가-힣a-zA-Z\s,·및]+?)(?:종\s*목|$)/);
  if(bizMatch) r.biztype=bizMatch[1].trim().replace(/\s{2,}/g,' ').slice(0,20);

  const itemMatch=full.match(/종\s*목\s*([가-힣a-zA-Z\s,·\.\,]+?)(?:제조업|부동산|발급|$)/);
  if(itemMatch) r.bizitem=itemMatch[1].trim().replace(/\s{2,}/g,' ').slice(0,30);

  // 공백 정리
  Object.keys(r).forEach(k=>{ if(typeof r[k]==='string') r[k]=r[k].trim(); });
  return r;
}

// 명함/거래처 서류 파싱
function parseCardDoc(text){
  const r={name:'',bizno:'',contact:'',tel:'',email:'',addr:'',memo:''};
  const lines=text.split('\n').map(l=>l.trim()).filter(l=>l.length>0);

  // 이메일
  const emailMatch=text.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  if(emailMatch) r.email=emailMatch[0];

  // 전화번호
  const telMatch=text.match(/(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4})/);
  if(telMatch) r.tel=telMatch[1];

  // 사업자번호
  const biznoMatch=text.match(/(\d{3}[-\s]?\d{2}[-\s]?\d{5})/);
  if(biznoMatch) r.bizno=biznoMatch[1];

  // 첫 줄이 회사명일 가능성 높음
  if(lines[0]) r.name=lines[0];

  // 이름(담당자): 한글 2~4자
  const nameCandidate=lines.find(l=>/^[가-힣]{2,4}$/.test(l));
  if(nameCandidate) r.contact=nameCandidate;

  // 주소: 시/도로 시작
  const addrLine=lines.find(l=>/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/.test(l));
  if(addrLine) r.addr=addrLine;

  return r;
}

// ── 모바일 카드형 목록 렌더링 ──
function renderMobileCards(panelId, items, buildCard){
  if(!isMobile()) return;
  const panel=document.getElementById('panel-'+panelId);
  if(!panel) return;
  // 기존 모바일 카드 제거
  const old=panel.querySelector('.m-list');
  if(old) old.remove();
  const wrap=document.createElement('div');
  wrap.className='m-list';
  if(!items.length){
    wrap.innerHTML=`<div style="text-align:center;padding:32px;color:var(--text3);font-size:14px">등록된 내역이 없습니다</div>`;
  } else {
    wrap.innerHTML=items.map((r,i)=>buildCard(r,i)).join('');
  }
  panel.appendChild(wrap);
}

function mSalesCard(r,i){
  const getTotal=r=>r.total||((r.subtotal||0)+(r.vat||0))||0;
  return `<div class="m-card">
    <div class="m-card-top">
      <div>
        <div class="m-card-name party-link" onclick="filterByParty('sales', this)" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${escapeHtml(r.buyer||r.customer||'—')}</div>
        <div class="m-card-sub">${escapeHtml(r.date||'')} · ${escapeHtml(r.item||r.summary||'')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:700;color:var(--green)">${fmt(getTotal(r),r.currency)}</div>
        <span class="tag tag-${(r.currency||'krw').toLowerCase()}">${r.currency}</span>
      </div>
    </div>
    <div class="m-card-rows">
      ${r.spec?`<div class="m-card-row"><span class="m-card-lbl">규격</span><span class="m-card-val">${escapeHtml(r.spec)}</span></div>`:''}
      <div class="m-card-row"><span class="m-card-lbl">수량/단가</span><span class="m-card-val">${r.qty||'—'} × ${r.unitPrice?fmt(r.unitPrice,r.currency):'—'}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">공급가액</span><span class="m-card-val">${fmt(r.subtotal||r.total,r.currency)}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">세액</span><span class="m-card-val">${r.currency==='KRW'?fmt(r.vat||0,'KRW'):'-'}</span></div>
      ${r.memo?`<div class="m-card-row"><span class="m-card-lbl">비고</span><span class="m-card-val">${escapeHtml(r.memo)}</span></div>`:''}
    </div>
    <div class="m-card-actions">
      <button class="btn btn-edit btn-sm" onclick="openEdit('sales','${r.id}')">✏️ 수정</button>
      <button class="btn btn-danger btn-sm" onclick="delSale('${r.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

function mPurchaseCard(r,i){
  return `<div class="m-card">
    <div class="m-card-top">
      <div>
        <div class="m-card-name party-link" onclick="filterByParty('purchase', this)" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${escapeHtml(r.vendor||'—')}</div>
        <div class="m-card-sub">${escapeHtml(r.date||'')} · ${escapeHtml(r.item||'')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:700;color:var(--blue)">${fmt(r.total,r.currency)}</div>
        <span class="tag tag-${(r.currency||'krw').toLowerCase()}">${r.currency}</span>
      </div>
    </div>
    <div class="m-card-rows">
      ${r.spec?`<div class="m-card-row"><span class="m-card-lbl">규격</span><span class="m-card-val">${escapeHtml(r.spec)}</span></div>`:''}
      <div class="m-card-row"><span class="m-card-lbl">수량/단가</span><span class="m-card-val">${r.qty||'—'} × ${r.unitPrice?fmt(r.unitPrice,r.currency):'—'}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">공급가액</span><span class="m-card-val">${fmt(r.subtotal||r.total,r.currency)}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">세액</span><span class="m-card-val">${r.currency==='KRW'?fmt(r.vat||0,'KRW'):'-'}</span></div>
      ${r.invNo?`<div class="m-card-row"><span class="m-card-lbl">인보이스</span><span class="m-card-val">${escapeHtml(r.invNo)}</span></div>`:''}
      ${r.memo?`<div class="m-card-row"><span class="m-card-lbl">비고</span><span class="m-card-val">${escapeHtml(r.memo)}</span></div>`:''}
    </div>
    <div class="m-card-actions">
      <button class="btn btn-edit btn-sm" onclick="openEdit('purchases','${r.id}')">✏️ 수정</button>
      <button class="btn btn-danger btn-sm" onclick="delPurch('${r.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

function mCustomerCard(r,i){
  return `<div class="m-card">
    <div class="m-card-top">
      <div>
        <div class="m-card-name">${escapeHtml(r.name)}</div>
        <div class="m-card-sub">${escapeHtml(r.country||'')} ${r.bizno?'· '+escapeHtml(r.bizno):''}</div>
      </div>
    </div>
    <div class="m-card-rows">
      ${r.contact?`<div class="m-card-row"><span class="m-card-lbl">담당자</span><span class="m-card-val">${escapeHtml(r.contact)}</span></div>`:''}
      ${r.tel?`<div class="m-card-row"><span class="m-card-lbl">연락처</span><span class="m-card-val"><a href="tel:${escapeHtml(r.tel)}" style="color:var(--blue)">${escapeHtml(r.tel)}</a></span></div>`:''}
      ${r.email?`<div class="m-card-row"><span class="m-card-lbl">이메일</span><span class="m-card-val" style="word-break:break-all">${escapeHtml(r.email)}</span></div>`:''}
      ${r.addr?`<div class="m-card-row"><span class="m-card-lbl">주소</span><span class="m-card-val" style="word-break:break-all">${escapeHtml(r.addr)}</span></div>`:''}
      ${r.memo?`<div class="m-card-row"><span class="m-card-lbl">메모</span><span class="m-card-val">${escapeHtml(r.memo)}</span></div>`:''}
    </div>
    <div class="m-card-actions">
      <button class="btn btn-edit btn-sm" onclick="openEdit('customers','${r.id}')">✏️ 수정</button>
      <button class="btn btn-danger btn-sm" onclick="delCust('${r.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

function mProductCard(r,i){
  return `<div class="m-card">
    <div class="m-card-top">
      <div>
        <div class="m-card-name">${escapeHtml(r.name)}</div>
        <div class="m-card-sub">${r.code?escapeHtml(r.code)+' · ':''}${escapeHtml(r.spec||'')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700">${fmt(r.price,r.currency)}</div>
        <div style="font-size:11px;color:var(--text2)">${escapeHtml(r.unit||'EA')}</div>
      </div>
    </div>
    <div class="m-card-rows">
      ${r.maker?`<div class="m-card-row"><span class="m-card-lbl">제조사</span><span class="m-card-val">${escapeHtml(r.maker)}</span></div>`:''}
      <div class="m-card-row"><span class="m-card-lbl">재고</span><span class="m-card-val" style="${(r.stock||0)<=0?'color:var(--red)':'color:var(--green)'}">${(r.stock||0).toLocaleString()} ${escapeHtml(r.unit||'EA')}</span></div>
      ${r.safeStock?`<div class="m-card-row"><span class="m-card-lbl">안전재고</span><span class="m-card-val">${escapeHtml(String(r.safeStock))}</span></div>`:''}
    </div>
    <div class="m-card-actions">
      <button class="btn btn-edit btn-sm" onclick="openEdit('products','${r.id}')">✏️ 수정</button>
      <button class="btn btn-danger btn-sm" onclick="delProd('${r.id}')">🗑 삭제</button>
    </div>
  </div>`;
}

function mStockCard(s,i){
  let status, statusColor;
  if(s.current<=0){ status='⛔ 재고없음'; statusColor='var(--red)'; }
  else if(s.safeStock>0 && s.current<=s.safeStock){ status='⚠️ 재고부족'; statusColor='var(--amber)'; }
  else { status='✅ 정상'; statusColor='var(--green)'; }

  return `<div class="m-card">
    <div class="m-card-top">
      <div>
        <div class="m-card-name">${escapeHtml(s.name)}</div>
        <div class="m-card-sub">${s.code?escapeHtml(s.code)+' · ':''}${escapeHtml(s.spec||'')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:700;color:${statusColor}">${Number(s.current).toLocaleString()} ${escapeHtml(s.unit||'EA')}</div>
        <div style="font-size:11px;font-weight:600;color:${statusColor}">${status}</div>
      </div>
    </div>
    <div class="m-card-rows">
      <div class="m-card-row"><span class="m-card-lbl">재고금액</span><span class="m-card-val" style="font-weight:700;color:var(--green)">${fmt(s.stockValue,s.stockValueCur)}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">매입(입고)</span><span class="m-card-val" style="color:var(--blue)">+${Number(s.inQty).toLocaleString()}</span></div>
      <div class="m-card-row"><span class="m-card-lbl">매출(출고)</span><span class="m-card-val" style="color:var(--red)">-${Number(s.outQty).toLocaleString()}</span></div>
      ${s.safeStock?`<div class="m-card-row"><span class="m-card-lbl">안전재고</span><span class="m-card-val">${escapeHtml(String(s.safeStock))}</span></div>`:''}
    </div>
    <div class="m-card-actions">
      <button class="btn btn-edit btn-sm" onclick="openEdit('products','${s.id}')">✏️ 수정 / 재고조정</button>
    </div>
  </div>`;
}

// ── 초기화 ──
initApp();