(function(){
const KEY='taskapp.v1', SKEY='taskapp.settings', VERSION='0.6';
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const $=id=>document.getElementById(id);
const dstr=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const todayStr=()=>dstr(new Date());
const PALETTE=['#f6b5d3','#b7c3f3','#f6d96b','#a9ddc9','#d4c2f2','#f7c9a0','#c7d98a'];
const TITLES={today:'Сегодня',board:'Доска',calendar:'Календарь',inbox:'Входящие',upcoming:'Предстоящие',all:'Все задачи',done:'Выполнено',habits:'Привычки',stats:'Итоги',settings:'Настройки'};
const QUICK_VIEWS=['today','board','calendar','inbox','upcoming','all','project'];

let state=load();
let settings=loadSettings();
let view={type:'today'}; // today | calendar | inbox | upcoming | all | done | habits | stats | settings | project
let editingId=null, lastPop=null;
let boardProj='';
let boardOpen={todo:true,doing:true,done:false};
let calMode='week',calAnchor=todayStr(),calSel=todayStr();

function load(){
  try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.tasks){s.deleted=s.deleted||{};s.habits=s.habits||[];return s}}catch(e){}
  return {projects:[],tasks:[],deleted:{},habits:[]};
}
function loadSettings(){
  try{return Object.assign({theme:'auto'},JSON.parse(localStorage.getItem(SKEY))||{})}catch(e){return {theme:'auto'}}
}
function saveSettings(){try{localStorage.setItem(SKEY,JSON.stringify(settings))}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){alert('Не удалось сохранить данные')}scheduleSync()}
const touch=o=>{o.u=Date.now();return o};
const taskById=id=>state.tasks.find(x=>x.id===id);

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmtDate(t){
  if(!t.date)return '';
  const td=todayStr();
  const d=new Date(t.date+'T00:00');
  const tm=new Date();tm.setDate(tm.getDate()+1);
  let s=t.date===td?'Сегодня':t.date===dstr(tm)?'Завтра':d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  if(t.time)s+=', '+t.time;
  return s;
}

// ---------- тема ----------
function applyTheme(){
  const r=document.documentElement;
  if(settings.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',settings.theme);
  const dark=settings.theme==='dark'||(settings.theme==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
  $('metaTheme').setAttribute('content',dark?'#111113':'#f7f2e8');
}
if(window.matchMedia){try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme)}catch(e){}}

// ---------- проекты ----------
const projColor=p=>p.color||PALETTE[Math.max(0,state.projects.indexOf(p))%PALETTE.length];
function newProject(name){
  const p=touch({id:uid(),name,color:PALETTE[state.projects.length%PALETTE.length]});
  state.projects.push(p);return p;
}

// ---------- списки и подсчёты ----------
function filtered(){
  const td=todayStr();
  let l=state.tasks.slice();
  switch(view.type){
    case 'today': l=l.filter(t=>!t.done&&t.date&&t.date<=td);break;
    case 'upcoming': l=l.filter(t=>!t.done&&t.date&&t.date>td);break;
    case 'inbox': l=l.filter(t=>!t.done&&!t.projectId);break;
    case 'all': l=l.filter(t=>!t.done);break;
    case 'done': l=l.filter(t=>t.done);break;
    case 'project': l=l.filter(t=>t.projectId===view.id&&!t.done);break;
  }
  l.sort((a,b)=>{
    if(view.type==='done')return (b.doneAt||0)-(a.doneAt||0);
    const da=a.date?a.date+(a.time||'99:99'):'9999';
    const db=b.date?b.date+(b.time||'99:99'):'9999';
    return da<db?-1:da>db?1:(a.prio-b.prio);
  });
  return l;
}

function stats(){
  const td=todayStr();
  const open=state.tasks.filter(t=>!t.done);
  const doneToday=state.tasks.filter(t=>t.done&&t.doneAt&&dstr(new Date(t.doneAt))===td).length+state.tasks.filter(t=>(t.hist||[]).includes(td)).length;
  const overdue=open.filter(t=>t.date&&t.date<td).length;
  const todayOpen=open.filter(t=>t.date&&t.date<=td).length;
  const upcoming=open.filter(t=>t.date&&t.date>td).length;
  return {open,doneToday,overdue,todayOpen,upcoming};
}

function dashHtml(){
  const s=stats();
  const total=s.doneToday+s.todayOpen;
  const frac=total?s.doneToday/total:0;
  const R=54,C=2*Math.PI*R;
  const arc=frac>0?`<circle cx="70" cy="70" r="${R}" fill="none" stroke="#f6b5d3" stroke-width="18" stroke-linecap="round"
      stroke-dasharray="${(C*frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"/>`:'';
  return `<div class="dash">
    <div class="ring">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="#f6d96b" stroke-width="18"/>
        ${arc}
      </svg>
      <div class="mid"><div class="num">${s.todayOpen}</div><div class="lbl">осталось</div></div>
    </div>
    <div class="stats">
      <button class="stat pink click" data-go="today"><span class="s-l">Просрочено</span><span class="s-n">${s.overdue}</span></button>
      <button class="stat blue click" data-go="upcoming"><span class="s-l">Впереди</span><span class="s-n">${s.upcoming}</span></button>
      <button class="stat yellow click" data-go="done"><span class="s-l">Сделано сегодня</span><span class="s-n">${s.doneToday}</span></button>
    </div>
  </div>`;
}

// ---------- навигация ----------
function navBtn(k,name,c,active,color){
  return `<button class="nav-item${active?' active':''}" data-k="${k}">${color?`<i class="pdot" style="background:${color}"></i>`:''}<span class="nm">${name}</span><span class="cnt">${c||''}</span></button>`;
}
function renderNav(counts){
  const on=k=>view.type===k;
  const grp=(title,items)=>(title?`<div class="nav-title">${title}</div>`:'')+items.map(k=>navBtn(k,TITLES[k],counts[k],on(k))).join('');
  $('nav').innerHTML=grp('',['today','board','calendar','inbox','upcoming','all'])+grp('Отслеживание',['habits','stats']);
  $('nav2').innerHTML=grp('Ещё',['done','settings']);
  $('projects').innerHTML=state.projects.map(p=>{
    const c=state.tasks.filter(t=>!t.done&&t.projectId===p.id).length;
    return navBtn('p:'+p.id,esc(p.name),c,view.type==='project'&&view.id===p.id,projColor(p));
  }).join('');
  document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;
    go(k.startsWith('p:')?{type:'project',id:k.slice(2)}:{type:k});
  });
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>{
    const k=b.dataset.tab;
    const main=['today','calendar','habits','stats'];
    b.classList.toggle('on',k==='more'?!main.includes(view.type):view.type===k);
  });
}
function go(v){view=v;closeMenu();render();const L=$('list');if(L)L.scrollTop=0}
function openMenu(){$('side').classList.add('open');$('scrim').classList.add('show')}
function closeMenu(){$('side').classList.remove('open');$('scrim').classList.remove('show')}
$('scrim').onclick=closeMenu;
document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.onclick=()=>{
  const k=b.dataset.tab;
  if(k==='more')openMenu();else go({type:k});
});

// ---------- главный вывод ----------
function render(){
  const td=todayStr();
  const open=state.tasks.filter(t=>!t.done);
  const counts={
    today:open.filter(t=>t.date&&t.date<=td).length,
    upcoming:open.filter(t=>t.date&&t.date>td).length,
    inbox:open.filter(t=>!t.projectId).length,
    all:open.length,
    done:state.tasks.length-open.length,
    habits:(state.habits||[]).filter(h=>sched(h,td)&&!checked(h,td)).length
  };
  renderNav(counts);

  let title=TITLES[view.type];
  const proj=view.type==='project'?state.projects.find(p=>p.id===view.id):null;
  if(view.type==='project')title=proj?proj.name:'Проект';
  $('title').textContent=title;
  const ds=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
  $('sub').textContent=ds.charAt(0).toUpperCase()+ds.slice(1);
  $('delProject').hidden=view.type!=='project';
  $('renProject').hidden=view.type!=='project';
  $('fab').style.display=(view.type==='stats'||view.type==='settings')?'none':'';
  $('quickwrap').style.display=QUICK_VIEWS.includes(view.type)?'':'none';
  document.title=title+' · Задачи';

  if(view.type==='board'){
    $('sub').textContent=window.innerWidth>760?'Перетаскивайте карточки или двигайте стрелками':'Двигайте карточки стрелками';
    $('list').innerHTML=boardHtml();bindBoard();return;
  }
  if(view.type==='calendar'){
    const m=new Date(calAnchor+'T00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    $('sub').textContent=m.charAt(0).toUpperCase()+m.slice(1);
    $('list').innerHTML=calHtml();
    bindList();bindCal();return;
  }
  if(view.type==='habits'){
    $('sub').textContent='Повторяющиеся действия';
    $('list').innerHTML=habitsHtml();bindHabits();return;
  }
  if(view.type==='stats'){
    $('sub').textContent=statPeriod===7?'Последние 7 дней':'Последние 30 дней';
    $('list').innerHTML=statsHtml();bindStats();return;
  }
  if(view.type==='settings'){
    $('sub').textContent='Версия '+VERSION;
    $('list').innerHTML=settingsHtml();bindSettings();renderAcct();return;
  }

  const items=filtered();
  let html='';
  if(view.type==='today'){
    html=dashHtml();
    const late=items.filter(t=>t.date<td),now=items.filter(t=>t.date===td);
    if(late.length)html+=`<div class="group-title late">Просрочено · ${late.length} <button class="link-btn" id="moveOverdue">Перенести на сегодня</button></div>`+late.map(taskHtml).join('');
    if(now.length)html+=`<div class="group-title">На сегодня · ${now.length}</div>`+now.map(taskHtml).join('');
    if(!items.length){
      html+=state.tasks.length===0
        ?`<div class="hint"><b>Начните с первой задачи</b>Впишите её одной фразой в строке выше: срок, время, проект и приоритет распознаются сами.<br><button class="try" data-try="Позвонить клиенту завтра в 15:00 !1 #работа">Попробовать пример</button></div>`
        :'<div class="empty">На сегодня всё сделано.<br>Можно добавить новую задачу или отдохнуть.</div>';
    }
  }else if(view.type==='done'){
    html=items.length?`<div class="group-title">Выполнено: ${items.length} <button class="link-btn" id="clearDone">Очистить</button></div>`+items.map(taskHtml).join(''):'<div class="empty">Выполненных задач пока нет.</div>';
  }else if(!items.length){
    html='<div class="empty">Здесь пока пусто.<br>Добавьте задачу в строке выше.</div>';
  }else html=items.map(taskHtml).join('');
  $('list').innerHTML=html;
  bindList();
}

function taskHtml(t){
  const td=todayStr();
  const late=!t.done&&t.date&&t.date<td;
  const proj=t.projectId?state.projects.find(p=>p.id===t.projectId):null;
  const subs=(t.subs||[]).map(s=>`<div class="sub"><button class="chk${s.done?' done':''}" data-sub="${s.id}" data-t="${t.id}" aria-label="Подзадача">${s.done?'✓':''}</button>
    <span class="${s.done?'done-t':''}" style="flex:1">${esc(s.title)}</span>
    <button class="icon-btn" data-subdel="${s.id}" data-t="${t.id}" aria-label="Удалить подзадачу">×</button></div>`).join('');
  const sd=(t.subs||[]).filter(s=>s.done).length;
  return `<div class="task" data-id="${t.id}">
    <div class="t-row">
      <button class="chk p${t.prio}${t.done?' done':''}${t.id===lastPop?' pop':''}" data-chk="${t.id}" aria-label="Выполнить">${t.done?'✓':''}</button>
      <div class="t-body" data-edit="${t.id}">
        <div class="t-title${t.done?' done-t':''}">${esc(t.title)}</div>
        <div class="meta">
          ${t.date?`<span class="pill ${late?'late':'date'}">${fmtDate(t)}</span>`:''}
          ${proj?`<span class="pill proj" style="--pc:${projColor(proj)}">${esc(proj.name)}</span>`:''}
          ${(t.subs||[]).length?`<span class="pill">${sd}/${t.subs.length}</span>`:''}
          ${t.repeat?`<span class="pill">↻ ${REPEAT_LABEL[t.repeat]||''}</span>`:''}
          ${t.note?`<span class="note-t">${esc(t.note.slice(0,60))}</span>`:''}
        </div>
      </div>
      ${t.done?'':`<button class="icon-btn" data-postpone="${t.id}" title="Перенести на завтра" aria-label="Перенести на завтра">↷</button>`}
    </div>
    ${subs?`<div class="subs">${subs}</div>`:''}
    ${t.done?'':`<div class="sub-add"><input data-subadd="${t.id}" placeholder="+ Подзадача" enterkeyhint="done" aria-label="Добавить подзадачу"></div>`}
  </div>`;
}

// ---------- действия с задачами и отмена ----------
let toastTimer=null,undoFn=null;
function toast(msg,undo){
  $('toastMsg').textContent=msg;undoFn=undo||null;
  $('toastUndo').style.display=undo?'':'none';
  $('toast').hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{$('toast').hidden=true;undoFn=null},5500);
}
$('toastUndo').onclick=()=>{const f=undoFn;undoFn=null;$('toast').hidden=true;if(f)f()};

function buzz(){try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}}

function completeTask(id){
  const t=taskById(id);if(!t)return;
  const snap={done:!!t.done,doneAt:t.doneAt||null,date:t.date||'',hist:(t.hist||[]).slice()};
  let msg;
  if(t.repeat&&!t.done){
    (t.hist=t.hist||[]).push(todayStr());t.date=nextOccurrence(t);
    msg='Готово. Следующий раз: '+fmtDate({date:t.date,time:''}).toLowerCase();
  }else{
    t.done=!t.done;t.doneAt=t.done?Date.now():null;
    msg=t.done?'Задача выполнена':'Вернул в список';
  }
  touch(t);lastPop=t.done||t.repeat?id:null;buzz();save();render();
  toast(msg,()=>{const c=taskById(id);if(!c)return;Object.assign(c,snap);touch(c);save();render()});
}
function postponeTask(id){
  const t=taskById(id);if(!t)return;
  const prev=t.date||'';
  t.date=addDays(todayStr(),1);touch(t);save();render();
  toast('Перенёс на завтра',()=>{const c=taskById(id);if(!c)return;c.date=prev;touch(c);save();render()});
}
function deleteTask(id){
  const t=taskById(id);if(!t)return;
  const copy=JSON.parse(JSON.stringify(t));
  state.deleted[id]=Date.now();
  state.tasks=state.tasks.filter(x=>x.id!==id);
  save();render();
  toast('Задача удалена',()=>{delete state.deleted[id];state.tasks.push(touch(copy));save();render()});
}
function moveOverdue(){
  const td=todayStr();
  const prev={};
  state.tasks.forEach(t=>{if(!t.done&&t.date&&t.date<td){prev[t.id]=t.date;t.date=td;touch(t)}});
  const n=Object.keys(prev).length;if(!n)return;
  save();render();
  toast('Перенёс на сегодня: '+n,()=>{for(const id in prev){const c=taskById(id);if(c){c.date=prev[id];touch(c)}}save();render()});
}
function clearDone(){
  const done=state.tasks.filter(t=>t.done);
  if(!done.length)return;
  if(!confirm('Удалить выполненные задачи ('+done.length+')?'))return;
  const copies=JSON.parse(JSON.stringify(done));
  done.forEach(t=>{state.deleted[t.id]=Date.now()});
  state.tasks=state.tasks.filter(t=>!t.done);
  save();render();
  toast('Очищено: '+copies.length,()=>{copies.forEach(c=>{delete state.deleted[c.id];state.tasks.push(touch(c))});save();render()});
}

function bindList(){
  const L=$('list');
  L.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go({type:b.dataset.go}));
  L.querySelectorAll('[data-chk]').forEach(b=>b.onclick=()=>completeTask(b.dataset.chk));
  L.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openDialog(b.dataset.edit));
  L.querySelectorAll('[data-postpone]').forEach(b=>b.onclick=()=>postponeTask(b.dataset.postpone));
  L.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{
    const t=taskById(b.dataset.t);
    const s=t.subs.find(x=>x.id===b.dataset.sub);s.done=!s.done;touch(t);save();render();
  });
  L.querySelectorAll('[data-subdel]').forEach(b=>b.onclick=()=>{
    const t=taskById(b.dataset.t);
    t.subs=t.subs.filter(x=>x.id!==b.dataset.subdel);touch(t);save();render();
  });
  L.querySelectorAll('[data-subadd]').forEach(inp=>inp.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    const v=inp.value.trim();if(!v)return;
    const t=taskById(inp.dataset.subadd);
    (t.subs=t.subs||[]).push({id:uid(),title:v,done:false});touch(t);
    save();render();
    const again=L.querySelector(`[data-subadd="${t.id}"]`);if(again)again.focus();
  }));
  const mo=$('moveOverdue');if(mo)mo.onclick=moveOverdue;
  const cd=$('clearDone');if(cd)cd.onclick=clearDone;
  L.querySelectorAll('[data-try]').forEach(b=>b.onclick=()=>{
    $('qInput').value=b.dataset.try;qPreview();$('qInput').focus();
  });
  lastPop=null;
}

// ---------- быстрый ввод ----------
const parseQuick=v=>window.QuickParse?QuickParse.parse(v,{today:todayStr(),projects:state.projects}):{title:v,date:'',time:'',prio:3,repeat:'',projectName:'',projectId:null};
function qPreview(){
  const v=$('qInput').value.trim();
  if(!v){$('qPrev').innerHTML='';return}
  const r=parseQuick(v);
  const pills=[];
  if(r.date)pills.push(`<span class="pill date">${fmtDate(r)}</span>`);
  if(r.projectName){
    const p=r.projectId?state.projects.find(x=>x.id===r.projectId):null;
    pills.push(`<span class="pill proj" style="--pc:${p?projColor(p):PALETTE[state.projects.length%PALETTE.length]}">#${esc(r.projectName)}${p?'':' (новый)'}</span>`);
  }
  if(r.prio<3)pills.push(`<span class="pill prio">приоритет ${r.prio}</span>`);
  if(r.repeat)pills.push(`<span class="pill">↻ ${REPEAT_LABEL[r.repeat]}</span>`);
  $('qPrev').innerHTML=pills.join('');
}
$('qInput').addEventListener('input',qPreview);
$('quick').addEventListener('submit',e=>{
  e.preventDefault();
  const v=$('qInput').value.trim();if(!v)return;
  const r=parseQuick(v);
  let projectId=r.projectId;
  if(!projectId&&r.projectName)projectId=newProject(r.projectName).id;
  if(!projectId&&view.type==='project')projectId=view.id;
  if(!projectId&&view.type==='board'&&boardProj)projectId=boardProj;
  let date=r.date;
  if(!date){
    if(view.type==='today')date=todayStr();
    else if(view.type==='calendar')date=calSel;
    else if(view.type==='upcoming')date=addDays(todayStr(),1);
  }
  const task=touch({id:uid(),title:r.title,note:'',date,time:r.time,prio:r.prio,projectId:projectId||null,repeat:r.repeat,done:false,subs:[],created:Date.now()});
  state.tasks.push(task);
  $('qInput').value='';$('qPrev').innerHTML='';
  save();render();
  toast('Добавлено: '+r.title,()=>{
    state.deleted[task.id]=Date.now();state.tasks=state.tasks.filter(x=>x.id!==task.id);save();render();
  });
});

// ---------- доска (канбан) ----------
const COLS=[['todo','К выполнению'],['doing','В работе'],['done','Готово']];
const colOf=t=>t.done?'done':(t.status==='doing'?'doing':'todo');
function boardHtml(){
  const td=todayStr(),weekAgo=Date.now()-14*864e5;
  let l=state.tasks.filter(t=>!boardProj||t.projectId===boardProj);
  l=l.filter(t=>!t.done||(t.doneAt||0)>weekAgo||!t.doneAt);
  l.sort((a,b)=>(a.prio-b.prio)||((a.date||'9999')<(b.date||'9999')?-1:1));
  const chip=(id,name)=>`<button data-bp="${id}" class="${boardProj===id?'on':''}">${esc(name)}</button>`;
  const filter=`<div class="chips boardf">${chip('','Все проекты')}${state.projects.map(p=>chip(p.id,p.name)).join('')}</div>`;
  const cols=COLS.map(([k,name],ci)=>{
    const items=l.filter(t=>colOf(t)===k);
    const cards=items.map(t=>{
      const proj=t.projectId?state.projects.find(p=>p.id===t.projectId):null;
      const late=!t.done&&t.date&&t.date<td;
      return `<div class="kcard p${t.prio}${t.done?' kdone':''}" draggable="true" data-kid="${t.id}">
        <div class="t-title${t.done?' done-t':''}" data-edit="${t.id}">${esc(t.title)}</div>
        <div class="meta">${t.date?`<span class="pill ${late?'late':'date'}">${fmtDate(t)}</span>`:''}${proj?`<span class="pill proj" style="--pc:${projColor(proj)}">${esc(proj.name)}</span>`:''}${(t.subs||[]).length?`<span class="pill">${t.subs.filter(s=>s.done).length}/${t.subs.length}</span>`:''}</div>
        <div class="kmove">${ci>0?`<button data-kmove="${t.id}|${COLS[ci-1][0]}" aria-label="В колонку ${COLS[ci-1][1]}"><b class="ar-l">‹</b><b class="ar-u">↑</b></button>`:'<span></span>'}${ci<2?`<button data-kmove="${t.id}|${COLS[ci+1][0]}" aria-label="В колонку ${COLS[ci+1][1]}"><b class="ar-l">›</b><b class="ar-u">↓</b></button>`:'<span></span>'}</div>
      </div>`;
    }).join('');
    return `<section class="kcol${boardOpen[k]?'':' closed'}" data-col="${k}"><h3 data-ktoggle="${k}">${name}<span>${items.length}<i class="chev"></i></span></h3><div class="kbody">${cards||'<div class="kempty">Пусто</div>'}</div></section>`;
  }).join('');
  return filter+`<div class="board">${cols}</div>`;
}
function moveTask(id,col){
  const t=taskById(id);if(!t||colOf(t)===col)return;
  if(col==='done'){completeTask(id);return}
  const snap={done:!!t.done,doneAt:t.doneAt||null,status:t.status||'todo'};
  t.done=false;t.doneAt=null;t.status=col;touch(t);save();render();
  toast('Перенёс в «'+COLS.find(c=>c[0]===col)[1]+'»',()=>{const c=taskById(id);if(!c)return;Object.assign(c,snap);touch(c);save();render()});
}
function bindBoard(){
  const L=$('list');
  L.querySelectorAll('[data-bp]').forEach(b=>b.onclick=()=>{boardProj=b.dataset.bp;render()});
  L.querySelectorAll('[data-ktoggle]').forEach(h=>h.onclick=()=>{if(window.innerWidth>760)return;const k=h.dataset.ktoggle;boardOpen[k]=!boardOpen[k];render()});
  L.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openDialog(b.dataset.edit));
  L.querySelectorAll('[data-kmove]').forEach(b=>b.onclick=()=>{const [id,c]=b.dataset.kmove.split('|');moveTask(id,c)});
  L.querySelectorAll('.kcard').forEach(c=>{
    c.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',c.dataset.kid);e.dataTransfer.effectAllowed='move';c.classList.add('drag')});
    c.addEventListener('dragend',()=>c.classList.remove('drag'));
  });
  L.querySelectorAll('.kcol').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('over')});
    col.addEventListener('dragleave',()=>col.classList.remove('over'));
    col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('over');const id=e.dataTransfer.getData('text/plain');if(id)moveTask(id,col.dataset.col)});
  });
}

// ---------- ИИ-разбор (Gemini через /api/parse) ----------
$('qAi').onclick=async()=>{
  const v=$('qInput').value.trim();
  if(!v){toast('Вставьте сообщение в строку, потом нажмите «ИИ»');return}
  if(!session){toast('ИИ-разбор доступен после входа: Ещё → Настройки → Аккаунт');return}
  const btn=$('qAi');btn.disabled=true;btn.textContent='…';
  try{
    const r=await fetch('/api/parse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({text:v,today:todayStr(),projects:state.projects.map(p=>p.name)})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||('http '+r.status));
    const added=[];
    (j.tasks||[]).forEach(t=>{
      let pid=null;
      if(t.project){const p=state.projects.find(x=>x.name.toLowerCase()===t.project.toLowerCase());if(p)pid=p.id}
      const task=touch({id:uid(),title:t.title,note:'',date:t.date||'',time:t.time||'',prio:t.prio||3,projectId:pid,repeat:'',done:false,subs:[],created:Date.now()});
      state.tasks.push(task);added.push(task.id);
    });
    if(!added.length){toast('ИИ не нашёл задач в тексте')}
    else{
      $('qInput').value='';$('qPrev').innerHTML='';save();render();
      toast('ИИ добавил задач: '+added.length,()=>{added.forEach(id=>{state.deleted[id]=Date.now()});state.tasks=state.tasks.filter(t=>!added.includes(t.id));save();render()});
    }
  }catch(e){
    toast(e.message==='no_key'?'Ключ Gemini не подхвачен: нужен Redeploy в Vercel':'ИИ недоступен ('+e.message+'). Используйте обычный ввод');
  }
  btn.disabled=false;btn.textContent='ИИ';
};

// ---------- даты, повторы, календарь ----------
const REPEAT_LABEL={daily:'каждый день',weekdays:'по будням',weekly:'каждую неделю',monthly:'каждый месяц'};
const MONTH_DATE=s=>new Date(s+'T00:00');
function addDays(s,n){const d=MONTH_DATE(s);d.setDate(d.getDate()+n);return dstr(d)}
function startOfWeek(s){const d=MONTH_DATE(s);return addDays(s,-((d.getDay()+6)%7))}
function nextOccurrence(t){
  const td=todayStr();
  const step=s=>{
    const x=MONTH_DATE(s);
    if(t.repeat==='daily')x.setDate(x.getDate()+1);
    else if(t.repeat==='weekly')x.setDate(x.getDate()+7);
    else if(t.repeat==='weekdays'){do{x.setDate(x.getDate()+1)}while(x.getDay()===0||x.getDay()===6)}
    else if(t.repeat==='monthly'){
      const day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+1);
      const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,last));
    }
    return dstr(x);
  };
  let d=step(t.date||td),g=0;
  while(d<=td&&g++<400)d=step(d);
  return d;
}
function calHtml(){
  const days=[];
  if(calMode==='week'){
    const st=startOfWeek(calAnchor);for(let i=0;i<7;i++)days.push(addDays(st,i));
  }else{
    const a=MONTH_DATE(calAnchor);
    const first=dstr(new Date(a.getFullYear(),a.getMonth(),1));
    const last=dstr(new Date(a.getFullYear(),a.getMonth()+1,0));
    let st=startOfWeek(first);
    while(st<=last||days.length%7!==0){days.push(st);st=addDays(st,1)}
  }
  const curM=MONTH_DATE(calAnchor).getMonth(),td=todayStr();
  const byDay={};
  state.tasks.forEach(t=>{if(t.date)(byDay[t.date]=byDay[t.date]||[]).push(t)});
  const cells=days.map(d=>{
    const list=(byDay[d]||[]).slice().sort((a,b)=>(a.done-b.done)||(a.prio-b.prio));
    const dots=list.slice(0,4).map(t=>`<i class="dot ${t.done?'dn':'p'+t.prio}"></i>`).join('');
    const more=list.length>4?`<span class="more">+${list.length-4}</span>`:'';
    const out=calMode==='month'&&MONTH_DATE(d).getMonth()!==curM;
    return `<div class="cal-d${d===calSel?' sel':''}${d===td?' today':''}${out?' out':''}" data-day="${d}" role="button" tabindex="0" aria-label="${d}">
      <span class="n">${MONTH_DATE(d).getDate()}</span><div class="dots">${dots}${more}</div></div>`;
  }).join('');
  const heads=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(h=>`<div class="cal-h">${h}</div>`).join('');
  const dayList=(byDay[calSel]||[]).slice().sort((a,b)=>(a.done-b.done)||((a.time||'99')<(b.time||'99')?-1:1));
  const ds=MONTH_DATE(calSel).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
  return `<div class="cal-bar">
      <div class="seg"><button data-mode="week" class="${calMode==='week'?'on':''}">Неделя</button><button data-mode="month" class="${calMode==='month'?'on':''}">Месяц</button></div>
      <div class="cal-nav"><button data-nav="-1" aria-label="Назад">‹</button><button class="tdy" data-nav="0">Сегодня</button><button data-nav="1" aria-label="Вперёд">›</button></div>
    </div>
    <div class="cal-grid">${heads}${cells}</div>
    <div class="group-title">${ds.charAt(0).toUpperCase()+ds.slice(1)}</div>
    ${dayList.length?dayList.map(taskHtml).join(''):'<div class="empty" style="margin-top:16px">Нет задач на этот день.<br>Добавьте задачу в строке выше.</div>'}`;
}
function bindCal(){
  const L=$('list');
  L.querySelectorAll('[data-day]').forEach(c=>{
    const pick=()=>{calSel=c.dataset.day;if(calMode==='month')calAnchor=calSel;render()};
    c.onclick=pick;
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
  });
  L.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{calMode=b.dataset.mode;calAnchor=calSel;render()});
  L.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{
    const n=+b.dataset.nav;
    if(n===0){calAnchor=calSel=todayStr()}
    else if(calMode==='week'){calAnchor=addDays(calAnchor,7*n);calSel=calAnchor}
    else{const a=MONTH_DATE(calAnchor);calAnchor=dstr(new Date(a.getFullYear(),a.getMonth()+n,1));calSel=calAnchor}
    render();
  });
}

// ---------- привычки ----------
const DAYS_ALL=[0,1,2,3,4,5,6];
const WD_LETTER=['П','В','С','Ч','П','С','В'];
const sched=(h,d)=>(h.days||DAYS_ALL).includes((MONTH_DATE(d).getDay()+6)%7);
const checked=(h,d)=>!!(h.log&&h.log[d]>0);
function streak(h){
  const td=todayStr();let c=0,d=td,g=0;
  while(g++<800){
    if(sched(h,d)){if(checked(h,d))c++;else if(d!==td)break}
    d=addDays(d,-1);
  }
  return c;
}
function pctOf(h,days){
  let s_=0,c_=0;
  days.forEach(d=>{if(sched(h,d)){s_++;if(checked(h,d))c_++}});
  return {s:s_,c:c_,p:s_?Math.round(c_*100/s_):0};
}
function lastDays(n){const td=todayStr(),a=[];for(let i=n-1;i>=0;i--)a.push(addDays(td,-i));return a}
function toggleHabit(id,d){
  const h=state.habits.find(x=>x.id===id);if(!h)return;
  h.log=h.log||{};
  const was=checked(h,d);
  h.log[d]=was?-Date.now():Date.now();
  touch(h);buzz();save();render();
}
function habitsHtml(){
  const td=todayStr(),hs=state.habits||[];
  const today=hs.filter(h=>sched(h,td));
  const doneN=today.filter(h=>checked(h,td)).length;
  const best=hs.reduce((m,h)=>Math.max(m,streak(h)),0);
  const sum=`<div class="s2 wide">
    <div class="stat pink"><span class="s-l">Сегодня</span><span class="s-n">${doneN} из ${today.length}</span></div>
    <div class="stat yellow"><span class="s-l">Лучшая серия</span><span class="s-n">${best} дн.</span></div></div>`;
  if(!hs.length)return sum+'<div class="empty wide">Привычек пока нет.<br>Нажмите «+», чтобы добавить первую.</div>';
  const week=lastDays(7);
  const cards=hs.map(h=>{
    const st=streak(h),p=pctOf(h,lastDays(30));
    const cells=week.map(d=>{
      const on=checked(h,d),rest=!sched(h,d);
      return `<button class="wd${on?' on':''}${rest&&!on?' rest':''}${d===td?' td':''}" data-hday="${h.id}|${d}" aria-label="${d}">${on?'✓':WD_LETTER[(MONTH_DATE(d).getDay()+6)%7]}</button>`;
    }).join('');
    const on=checked(h,td);
    return `<div class="habit">
      <div class="t-row">
        <button class="chk big${on?' done':''}" data-hchk="${h.id}" aria-label="Отметить сегодня">${on?'✓':''}</button>
        <div class="t-body" data-hedit="${h.id}">
          <div class="t-title">${esc(h.name)}</div>
          <div class="meta"><span class="pill date">Серия: ${st} дн.</span><span class="pill">30 дней: ${p.p}%</span>${sched(h,td)?'':'<span class="pill">сегодня отдых</span>'}</div>
        </div>
      </div>
      <div class="week">${cells}</div>
    </div>`;
  }).join('');
  return sum+`<div class="wide">${cards}</div>`;
}
function bindHabits(){
  const L=$('list');
  L.querySelectorAll('[data-hchk]').forEach(b=>b.onclick=()=>toggleHabit(b.dataset.hchk,todayStr()));
  L.querySelectorAll('[data-hday]').forEach(b=>b.onclick=()=>{const [id,d]=b.dataset.hday.split('|');toggleHabit(id,d)});
  L.querySelectorAll('[data-hedit]').forEach(b=>b.onclick=()=>openHabit(b.dataset.hedit));
}
let editingHabit=null,hDays=DAYS_ALL.slice();
function paintDays(){document.querySelectorAll('#hDays [data-d]').forEach(b=>b.classList.toggle('on',hDays.includes(+b.dataset.d)))}
function openHabit(id){
  editingHabit=id||null;
  const h=id?state.habits.find(x=>x.id===id):null;
  $('hTitleH').textContent=h?'Привычка':'Новая привычка';
  $('hName').value=h?h.name:'';
  hDays=h?(h.days||DAYS_ALL).slice():DAYS_ALL.slice();
  paintDays();
  $('hDelete').style.display=h?'':'none';
  $('hdlg').showModal();
  if(!h)setTimeout(()=>$('hName').focus(),50);
}
document.querySelectorAll('#hDays [data-d]').forEach(b=>b.onclick=()=>{
  const d=+b.dataset.d;hDays=hDays.includes(d)?hDays.filter(x=>x!==d):hDays.concat(d);paintDays();
});
$('hCancel').onclick=()=>$('hdlg').close();
$('hDelete').onclick=()=>{
  if(!confirm('Удалить привычку вместе с историей?'))return;
  state.deleted[editingHabit]=Date.now();
  state.habits=state.habits.filter(h=>h.id!==editingHabit);
  save();$('hdlg').close();render();
};
$('hform').addEventListener('submit',()=>{
  const name=$('hName').value.trim();if(!name)return;
  const days=hDays.length?hDays.slice().sort():DAYS_ALL.slice();
  if(editingHabit){touch(Object.assign(state.habits.find(h=>h.id===editingHabit),{name,days}))}
  else state.habits.push(touch({id:uid(),name,days,log:{}}));
  save();render();
});

// ---------- статистика ----------
let statPeriod=7;
const completionsOf=t=>(t.done&&t.doneAt?[dstr(new Date(t.doneAt))]:[]).concat(t.hist||[]);
function statsHtml(){
  const td=todayStr(),days=lastDays(statPeriod);
  const by={};
  state.tasks.forEach(t=>completionsOf(t).forEach(d=>{by[d]=(by[d]||0)+1}));
  const counts=days.map(d=>by[d]||0);
  const total=counts.reduce((a,b)=>a+b,0);
  const max=Math.max(1,...counts);
  const hrows=(state.habits||[]).map(h=>({h,...pctOf(h,days)}));
  const hs=hrows.reduce((a,r)=>a+r.s,0),hc=hrows.reduce((a,r)=>a+r.c,0);
  const hp=hs?Math.round(hc*100/hs):0;
  const overdue=state.tasks.filter(t=>!t.done&&t.date&&t.date<td).length;
  const bars=days.map((d,i)=>{
    const n=counts[i];
    const lab=statPeriod===7?MONTH_DATE(d).toLocaleDateString('ru-RU',{weekday:'short'}):((i%5===0||i===days.length-1)?MONTH_DATE(d).getDate():'');
    return `<div class="bar"><span class="bv">${statPeriod===7&&n?n:''}</span><div class="bw"><i class="${d===td?'tdy':''}" style="height:${n?Math.max(6,n/max*100):2}%"></i></div><span class="bl">${lab}</span></div>`;
  }).join('');
  const byProj={};
  state.tasks.forEach(t=>{
    const c=completionsOf(t).filter(d=>days.includes(d)).length;
    if(c){const k=t.projectId||'';byProj[k]=(byProj[k]||0)+c}
  });
  const prow=Object.entries(byProj).sort((a,b)=>b[1]-a[1]).map(([k,n])=>({name:k?(state.projects.find(p=>p.id===k)?.name||'Проект'):'Без проекта',n}));
  const pmax=Math.max(1,...prow.map(r=>r.n));
  return `<div class="wide">
    <div class="cal-bar"><div class="seg"><button data-sp="7" class="${statPeriod===7?'on':''}">Неделя</button><button data-sp="30" class="${statPeriod===30?'on':''}">Месяц</button></div></div>
    <div class="s3">
      <div class="stat pink"><span class="s-l">Задач сделано</span><span class="s-n">${total}</span></div>
      <div class="stat yellow"><span class="s-l">Привычки</span><span class="s-n">${hs?hp+'%':'—'}</span></div>
      <div class="stat blue"><span class="s-l">Просрочено</span><span class="s-n">${overdue}</span></div>
    </div>
    <div class="group-title">Выполнено задач по дням</div>
    <div class="chart">${bars}</div>
    ${hrows.length?'<div class="group-title">Привычки</div>'+hrows.map(r=>`<div class="hbar y"><span class="nm">${esc(r.h.name)}</span><div class="track"><div class="fill" style="width:${r.p}%"></div></div><span class="vl">${r.c}/${r.s}</span></div>`).join(''):''}
    ${prow.length?'<div class="group-title">Выполнено по проектам</div>'+prow.map(r=>`<div class="hbar"><span class="nm">${esc(r.name)}</span><div class="track"><div class="fill" style="width:${Math.round(r.n/pmax*100)}%"></div></div><span class="vl">${r.n}</span></div>`).join(''):''}
  </div>`;
}
function bindStats(){
  $('list').querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{statPeriod=+b.dataset.sp;render()});
}

// ---------- настройки ----------
function settingsHtml(){
  const th=settings.theme;
  const b=(k,n)=>`<button data-th="${k}" class="${th===k?'on':''}">${n}</button>`;
  return `<div class="wide">
    <div class="card"><h3>Внешний вид</h3><div class="seg" id="themeSeg">${b('auto','Авто')}${b('light','Светлая')}${b('dark','Тёмная')}</div></div>
    <div class="card"><h3>Аккаунт и синхронизация</h3><div class="acct" id="acct"></div></div>
    <div class="card"><h3>Данные</h3>
      <div class="acts"><button class="btn soft" id="exportBtn">Экспорт</button><button class="btn soft" id="importBtn">Импорт</button><button class="btn danger" id="clearDone2">Очистить выполненные</button></div>
      <div class="row"><small>Экспорт сохраняет копию всех задач в файл на случай потери данных.</small></div>
    </div>
    <div class="card"><h3>Быстрый ввод: что понимает строка</h3>
      <ul class="cheat">
        <li>Срок: <b>завтра в 15:00</b>, <b>в пятницу</b>, <b>через 3 дня</b>, <b>15 ноября</b>, <b>к 15.11</b></li>
        <li>Проект: <b>#работа</b>. Приоритет: <b>!1</b> (высокий), <b>!2</b>, <b>!3</b></li>
        <li>Повтор: <b>каждый день</b>, <b>по будням</b>, <b>каждый понедельник</b>, <b>каждый месяц</b></li>
        <li>Пример: «Позвонить клиенту завтра в 15:00 !1 #работа»</li>
        <li>Клавиши на компьютере: <b>N</b> новая задача, <b>/</b> поиск</li>
      </ul>
    </div>
  </div>`;
}
function bindSettings(){
  document.querySelectorAll('#themeSeg [data-th]').forEach(b=>b.onclick=()=>{
    settings.theme=b.dataset.th;saveSettings();applyTheme();render();
  });
  $('exportBtn').onclick=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='tasks-'+todayStr()+'.json';a.click();
  };
  $('importBtn').onclick=()=>$('importFile').click();
  $('clearDone2').onclick=clearDone;
}
$('importFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const s=JSON.parse(r.result);
      if(!s.tasks||!s.projects)throw 0;
      if(confirm('Добавить данные из файла к текущим?')){state=mergeStates(state,Object.assign({deleted:{},habits:[]},s));save();render()}
    }catch(_){alert('Файл не подходит')}
  };
  r.readAsText(f);e.target.value='';
};

// ---------- поиск ----------
function openSearch(){
  $('sInput').value='';renderSearch('');
  $('sdlg').showModal();
  setTimeout(()=>$('sInput').focus(),30);
}
function renderSearch(q){
  q=q.trim().toLowerCase();
  const box=$('sRes');
  if(!q){box.innerHTML='<div class="empty" style="margin-top:12px">Начните вводить название</div>';return}
  const pn=id=>{const p=state.projects.find(x=>x.id===id);return p?p.name:''};
  const tasks=state.tasks.filter(t=>[t.title,t.note||'',...(t.subs||[]).map(s=>s.title),pn(t.projectId)].join(' ').toLowerCase().includes(q)).slice(0,25);
  const habits=state.habits.filter(h=>h.name.toLowerCase().includes(q)).slice(0,5);
  const projs=state.projects.filter(p=>p.name.toLowerCase().includes(q)).slice(0,5);
  let html='';
  tasks.forEach(t=>{
    html+=`<button class="sitem" data-st="${t.id}"><div class="t-title${t.done?' done-t':''}">${esc(t.title)}</div>
      <div class="meta">${t.date?`<span class="pill date">${fmtDate(t)}</span>`:''}${t.projectId?`<span class="pill proj" style="--pc:${projColor(state.projects.find(p=>p.id===t.projectId)||{})}">${esc(pn(t.projectId))}</span>`:''}${t.done?'<span class="pill ok">выполнено</span>':''}</div></button>`;
  });
  projs.forEach(p=>{html+=`<button class="sitem" data-sp="${p.id}"><div class="t-title">Проект: ${esc(p.name)}</div></button>`});
  habits.forEach(h=>{html+=`<button class="sitem" data-sh="${h.id}"><div class="t-title">Привычка: ${esc(h.name)}</div></button>`});
  box.innerHTML=html||'<div class="empty" style="margin-top:12px">Ничего не найдено</div>';
  box.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{$('sdlg').close();openDialog(b.dataset.st)});
  box.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{$('sdlg').close();go({type:'project',id:b.dataset.sp})});
  box.querySelectorAll('[data-sh]').forEach(b=>b.onclick=()=>{$('sdlg').close();go({type:'habits'})});
}
$('searchBtn').onclick=openSearch;
$('sInput').addEventListener('input',e=>renderSearch(e.target.value));
$('sClose').onclick=()=>$('sdlg').close();
$('sdlg').addEventListener('click',e=>{if(e.target===$('sdlg'))$('sdlg').close()});

// ---------- окно задачи ----------
function fillProjects(sel){
  $('fProject').innerHTML='<option value="">Без проекта</option>'+state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('fProject').value=sel||'';
}
function openDialog(id){
  editingId=id||null;
  const t=id?taskById(id):null;
  $('dlgTitle').textContent=t?'Задача':'Новая задача';
  $('fTitle').value=t?t.title:'';
  $('fNote').value=t?(t.note||''):'';
  $('fDate').value=t?(t.date||''):(view.type==='today'?todayStr():view.type==='calendar'?calSel:view.type==='upcoming'?addDays(todayStr(),1):'');
  $('fRepeat').value=t?(t.repeat||''):'';
  $('fTime').value=t?(t.time||''):'';
  $('fPrio').value=t?String(t.prio):'3';
  fillProjects(t?t.projectId:(view.type==='project'?view.id:''));
  $('fDelete').style.display=t?'':'none';
  $('dlg').showModal();
  if(!t)setTimeout(()=>$('fTitle').focus(),50);
}
$('fab').onclick=()=>view.type==='habits'?openHabit():openDialog();
$('fCancel').onclick=()=>$('dlg').close();
document.querySelectorAll('.chips [data-q]').forEach(b=>b.onclick=()=>{
  const q=b.dataset.q;
  $('fDate').value=q==='x'?'':addDays(todayStr(),+q);
});
$('fDelete').onclick=()=>{const id=editingId;$('dlg').close();deleteTask(id)};
$('form').addEventListener('submit',()=>{
  const title=$('fTitle').value.trim();
  if(!title)return;
  const data={title,note:$('fNote').value.trim(),date:$('fDate').value,time:$('fTime').value,
    prio:+$('fPrio').value,projectId:$('fProject').value||null,repeat:$('fRepeat').value};
  if(data.repeat&&!data.date)data.date=todayStr();
  if(editingId){touch(Object.assign(taskById(editingId),data))}
  else state.tasks.push(touch({id:uid(),done:false,subs:[],created:Date.now(),...data}));
  save();render();
});

// ---------- проекты ----------
function addProject(){
  const v=$('newProject').value.trim();if(!v)return;
  const p=newProject(v);
  $('newProject').value='';save();go({type:'project',id:p.id});
}
$('addProject').onclick=addProject;
$('newProject').addEventListener('keydown',e=>{if(e.key==='Enter')addProject()});
$('renProject').onclick=()=>{
  const p=state.projects.find(x=>x.id===view.id);if(!p)return;
  const n=prompt('Название проекта',p.name);
  if(n&&n.trim()){p.name=n.trim();touch(p);save();render()}
};
$('delProject').onclick=()=>{
  if(!confirm('Удалить проект? Его задачи останутся во «Входящих».'))return;
  state.tasks.forEach(t=>{if(t.projectId===view.id){t.projectId=null;touch(t)}});
  state.deleted[view.id]=Date.now();
  state.projects=state.projects.filter(p=>p.id!==view.id);
  save();go({type:'inbox'});
};

// ---------- горячие клавиши (компьютер) ----------
document.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  if(document.querySelector('dialog[open]'))return;
  if(e.code==='KeyN'){
    e.preventDefault();
    if(QUICK_VIEWS.includes(view.type))$('qInput').focus();else openDialog();
  }else if(e.code==='Slash'){e.preventDefault();openSearch()}
});

// ---------- синхронизация (Supabase) ----------
const SB_URL='https://enxmmjdmkbfpmbyvgyei.supabase.co';
const SB_KEY='sb_publishable_8ODpS1wNyP_aSewFC2VmIQ_DqXGOLv4';
let sb=null,session=null,syncing=false,again=false,syncTimer=null,lastSync=null,syncErr='';
let acStep='email',pendingEmail='',acText='';

function mergeStates(a,b){
  const del={...(a.deleted||{})};
  for(const k in (b.deleted||{}))del[k]=Math.max(del[k]||0,b.deleted[k]);
  const alive=it=>!(del[it.id]&&del[it.id]>=(it.u||0));
  const mergeList=(x,y)=>{
    const m=new Map();
    [...(x||[]),...(y||[])].forEach(it=>{
      const c=m.get(it.id);
      if(!c||(it.u||0)>(c.u||0))m.set(it.id,it);
    });
    return [...m.values()].filter(alive);
  };
  const mergeHabits=(x,y)=>{
    const m=new Map();
    [...(x||[]),...(y||[])].forEach(h=>{
      const c=m.get(h.id);
      if(!c){m.set(h.id,h);return}
      const base=(h.u||0)>(c.u||0)?h:c;
      const log={...(c.log||{})};
      for(const k in (h.log||{})){if(!(k in log)||Math.abs(h.log[k])>Math.abs(log[k]))log[k]=h.log[k]}
      m.set(h.id,{...base,log,u:Math.max(h.u||0,c.u||0)});
    });
    return [...m.values()].filter(alive);
  };
  return {projects:mergeList(a.projects,b.projects),tasks:mergeList(a.tasks,b.tasks),habits:mergeHabits(a.habits,b.habits),deleted:del};
}
function initSb(){
  if(sb)return true;
  if(!window.supabase)return false;
  sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  return true;
}
async function syncNow(){
  if(!initSb()||!session)return;
  if(syncing){again=true;return}
  syncing=true;syncErr='';renderAcct();
  try{
    const userId=session.user.id;
    const {data,error}=await sb.from('app_state').select('data').eq('user_id',userId).maybeSingle();
    if(error)throw error;
    if(data&&data.data&&data.data.tasks)state=mergeStates(state,data.data);
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    const {error:e2}=await sb.from('app_state').upsert({user_id:userId,data:state,updated_at:new Date().toISOString()});
    if(e2)throw e2;
    lastSync=new Date();
    const ae=document.activeElement;
    if(!(ae&&$('list').contains(ae)&&ae.tagName==='INPUT'))render();
  }catch(e){syncErr=(e&&e.message)||'нет связи'}
  syncing=false;renderAcct();
  if(again){again=false;scheduleSync()}
}
function scheduleSync(){
  if(!session)return;
  clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,1200);
}
function acMsg(t){acText=t;renderAcct()}
function renderAcct(){
  const el=$('acct');
  if(!el)return;
  if(!initSb()){el.innerHTML='<div class="ac-note">Синхронизация недоступна без интернета</div>';return}
  if(session){
    const st=syncErr?'Ошибка: '+esc(syncErr):syncing?'Синхронизация…':lastSync?'Синхронизировано в '+lastSync.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
    el.innerHTML=`<div class="ac-note">${esc(session.user.email||'')}</div><div class="ac-note">${st}</div>
      <div class="acts"><button class="btn soft" id="acSync">Обновить</button><button class="btn soft" id="acOut">Выйти</button></div>`;
    $('acSync').onclick=syncNow;
    $('acOut').onclick=async()=>{await sb.auth.signOut();session=null;lastSync=null;acStep='email';acText='';renderAcct()};
    return;
  }
  el.innerHTML=`<input class="ac-in" id="acEmail" type="email" inputmode="email" autocomplete="email" placeholder="Почта" aria-label="Почта" value="${esc(pendingEmail)}">
    <input class="ac-in" id="acPass" type="password" autocomplete="current-password" placeholder="Пароль (от 6 символов)" aria-label="Пароль" style="margin-top:8px">
    <div class="acts"><button class="btn pink" id="acIn">Войти</button><button class="btn soft" id="acUp">Создать аккаунт</button></div>
    <div class="ac-note" style="margin-top:8px">${esc(acText)}</div>`;
  $('acIn').onclick=()=>passAuth(false);
  $('acUp').onclick=()=>passAuth(true);
  $('acPass').addEventListener('keydown',e=>{if(e.key==='Enter')passAuth(false)});
}
async function passAuth(signup){
  const email=$('acEmail').value.trim(),password=$('acPass').value;
  pendingEmail=email;
  if(!email||password.length<6){acMsg('Введите почту и пароль не короче 6 символов');return}
  $('acIn').disabled=$('acUp').disabled=true;
  const {data,error}=signup?await sb.auth.signUp({email,password}):await sb.auth.signInWithPassword({email,password});
  if(error){
    const m=error.message||'';
    acMsg(/invalid login/i.test(m)?'Неверная почта или пароль (или аккаунта ещё нет: нажмите «Создать аккаунт»)':/already/i.test(m)?'Такой аккаунт уже есть: нажмите «Войти»':/confirm/i.test(m)?'Почта не подтверждена: отключите Confirm email в Supabase':m);
    return;
  }
  if(signup&&!data.session){acMsg('Аккаунт создан, но нужен вход: в Supabase отключите Confirm email, затем нажмите «Войти»');return}
  acText='';
}
async function initAuth(){
  if(!initSb()){renderAcct();return}
  const {data}=await sb.auth.getSession();
  session=data.session;
  sb.auth.onAuthStateChange((ev,s)=>{
    const was=!!session;session=s;
    if(s&&!was){renderAcct();syncNow()}else if(!s&&was){renderAcct()}
  });
  renderAcct();
  if(session)syncNow();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow()});
  window.addEventListener('online',syncNow);
  setInterval(()=>{if(!document.hidden)syncNow()},60000);
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
applyTheme();
if(window.innerWidth<=760)$('qInput').placeholder='Новая задача…';
render();
initAuth();
})();
