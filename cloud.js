(function(){
  var SB_URL = "https://chxmuzllnddovmoyhifa.supabase.co";
  var SB_KEY = "sb_publishable_8Y5HXIbx61NNHlw60Iymxw_FJH85BcO";
  var sbc = window.supabase.createClient(SB_URL, SB_KEY);
  var currentOfferId = null;
  var cache = {};            // id -> list record (no data)
  var loadingRecord = false;
  var dirty = false;
  var sharedMode = false;
  var labels = {mice:'MICE',acc:'Ubytovanie',corp:'Korporát',sport:'Šport',wedding:'Svadba',newsletter:'Newsletter'};
  var statusLabels = {draft:'Rozpracovaná', sent:'Odoslaná', confirmed:'Potvrdená', cancelled:'Zrušená', deleted:'Kôš'};
  var statusOrder = ['draft','sent','confirmed'];

  function toast(t){ var e=document.getElementById('cloudToast'); e.textContent=t; e.classList.add('show'); setTimeout(function(){e.classList.remove('show');},1800); }
  function frameDoc(){ var f=document.getElementById('offerFrame'); return (f&&f.contentWindow)?f.contentWindow.document:null; }
  function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function newToken(){ try{ return crypto.randomUUID(); }catch(e){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);}); } }

  function setAuthUI(authed, email){
    document.getElementById('cloudLogin').style.display = authed ? 'none':'flex';
    document.getElementById('cloudBar').style.display   = authed ? 'flex':'none';
    if(authed && email){ document.getElementById('cloudUser').textContent = email; var ec=document.getElementById('emCurrent'); if(ec) ec.value=email; }
    document.body.classList.toggle('cloud-on', authed);
    refreshSaveBtn();
    if(authed){ try{ refreshRole(); }catch(e){} } else { myRole='sales'; }
  }
  function refreshSaveBtn(){
    var has = (typeof __current!=='undefined') && __current;
    var b=document.getElementById('cloudSaveBtn'); if(b) b.disabled = !has;
  }
  setInterval(refreshSaveBtn, 700);

  function setDirty(v){
    dirty=v;
    var d=document.getElementById('cloudDirty'), s=document.getElementById('cloudSaved');
    if(d) d.style.display = v ? 'inline':'none';
    if(s) s.style.display = v ? 'none':'none';
  }
  function flashSaved(){
    var s=document.getElementById('cloudSaved'); if(!s) return;
    s.style.display='inline'; setTimeout(function(){ if(!dirty) s.style.display='none'; }, 2500);
  }
  // mark dirty on any edit inside the open offer
  function attachDirtyTracking(doc){
    if(!doc || doc.__dirtyHooked) return; doc.__dirtyHooked = true;
    var mark=function(){ if(!loadingRecord) setDirty(true); };
    doc.addEventListener('input', mark, true);
    doc.addEventListener('change', mark, true);
  }

  window.cloudSignIn = async function(){
    var email=document.getElementById('clEmail').value.trim();
    var pwd=document.getElementById('clPwd').value;
    document.getElementById('clErr').textContent='';
    var r=await sbc.auth.signInWithPassword({email:email,password:pwd});
    if(r.error){ document.getElementById('clErr').textContent=r.error.message; return; }
    setAuthUI(true, r.data.user.email);
  };
  window.cloudSignOut = async function(){ await sbc.auth.signOut(); currentOfferId=null; setAuthUI(false); };

  window.showPwdModal = function(){
    ['pwdCurrent','pwdNew','pwdConfirm'].forEach(function(id){ document.getElementById(id).value=''; });
    var m=document.getElementById('pwdMsg'); m.textContent=''; m.className='msg';
    document.getElementById('pwdSaveBtn').disabled=false;
    document.getElementById('pwdModal').classList.add('open');
    document.getElementById('pwdCurrent').focus();
  };
  window.hidePwdModal = function(){ document.getElementById('pwdModal').classList.remove('open'); };
  window.cloudChangePassword = async function(){
    var cur=document.getElementById('pwdCurrent').value;
    var nw=document.getElementById('pwdNew').value;
    var conf=document.getElementById('pwdConfirm').value;
    var msgEl=document.getElementById('pwdMsg');
    var saveBtn=document.getElementById('pwdSaveBtn');
    msgEl.textContent=''; msgEl.className='msg';
    if(!cur||!nw||!conf){ msgEl.className='msg err'; msgEl.textContent='Vyplňte všetky polia.'; return; }
    if(nw.length<6){ msgEl.className='msg err'; msgEl.textContent='Nové heslo musí mať aspoň 6 znakov.'; return; }
    if(nw!==conf){ msgEl.className='msg err'; msgEl.textContent='Nové heslá sa nezhodujú.'; return; }
    saveBtn.disabled=true;
    var s=await sbc.auth.getSession();
    var email=s.data&&s.data.session?s.data.session.user.email:null;
    if(!email){ msgEl.className='msg err'; msgEl.textContent='Nie ste prihlásený. Prihláste sa znova.'; saveBtn.disabled=false; return; }
    var re=await sbc.auth.signInWithPassword({email:email,password:cur});
    if(re.error){ msgEl.className='msg err'; msgEl.textContent='Aktuálne heslo je nesprávne.'; saveBtn.disabled=false; return; }
    var res=await sbc.auth.updateUser({password:nw});
    if(res.error){ msgEl.className='msg err'; msgEl.textContent=res.error.message; saveBtn.disabled=false; return; }
    msgEl.className='msg ok'; msgEl.textContent='Heslo bolo úspešne zmenené.';
    setTimeout(hidePwdModal,1600);
  };

  /* ---------- ZMENA E-MAILU ---------- */
  window.showEmailModal = async function(){
    var m=document.getElementById('emMsg'); m.textContent=''; m.className='msg';
    document.getElementById('emNew').value='';
    try{ var s=await sbc.auth.getSession(); var em=s.data&&s.data.session?s.data.session.user.email:''; document.getElementById('emCurrent').value=em; }catch(e){}
    document.getElementById('emSaveBtn').disabled=false;
    document.getElementById('emailModal').classList.add('open');
    document.getElementById('emNew').focus();
  };
  window.hideEmailModal = function(){ document.getElementById('emailModal').classList.remove('open'); };
  window.cloudChangeEmail = async function(){
    var nw=document.getElementById('emNew').value.trim();
    var msgEl=document.getElementById('emMsg'); var btn=document.getElementById('emSaveBtn');
    msgEl.textContent=''; msgEl.className='msg';
    if(!nw || nw.indexOf('@')<1){ msgEl.className='msg err'; msgEl.textContent='Zadajte platný e-mail.'; return; }
    btn.disabled=true;
    var res=await sbc.auth.updateUser({email:nw});
    if(res.error){ msgEl.className='msg err'; msgEl.textContent=res.error.message; btn.disabled=false; return; }
    msgEl.className='msg ok'; msgEl.textContent='Overovací odkaz sme poslali. Zmena sa prejaví po jeho potvrdení v oboch schránkach.';
  };

  /* ---------- SERIALIZÁCIA / BAKE ---------- */
  function bake(root){ if(!root)return;
    root.querySelectorAll('input').forEach(function(el){ if(el.type==='checkbox'||el.type==='radio'){ el.checked?el.setAttribute('checked',''):el.removeAttribute('checked'); } else el.setAttribute('value', el.value==null?'':el.value); });
    root.querySelectorAll('select').forEach(function(s){ Array.prototype.forEach.call(s.options,function(o){ o.selected?o.setAttribute('selected',''):o.removeAttribute('selected'); }); });
    root.querySelectorAll('textarea').forEach(function(t){ t.textContent=t.value; });
  }
  function serializeActive(){
    var d=frameDoc(); if(!d||typeof __current==='undefined'||!__current) return null;
    var w=d.defaultView;
    if(__current==='newsletter'){
      var proj=null; try{ if(typeof w.snapshotState==='function') proj=w.snapshotState(); }catch(e){}
      var subj=''; try{ subj=(d.getElementById('emailSubject')||{}).value||''; }catch(e){}
      return { template:'newsletter', client:subj, reference:'', data:{ project:proj } };
    }
    // Use the template's own thorough baker if available, else fall back.
    try{ if(w && typeof w.__pushLiveToDOM==='function'){ w.__pushLiveToDOM(); } }catch(e){}
    var cover=d.querySelector('.cover-page'), body=d.querySelector('.doc-body');
    bake(cover); bake(body);
    var cEl=d.getElementById('hdr-client'); var rEl=d.getElementById('hdr-ref');
    var client=cEl?(cEl.textContent||'').trim():''; var ref=rEl?(rEl.textContent||'').trim():'';
    var amount=null; try{ var gt=d.getElementById('grandTotal'); if(gt){ amount=parseFloat((gt.textContent||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||null; } }catch(e){}
    var evd=null; try{ var ed=d.getElementById('eventDate')||d.getElementById('hdr-date'); var ev=ed?(ed.value||ed.textContent||'').trim():''; if(/^\d{4}-\d{2}-\d{2}$/.test(ev)) evd=ev; }catch(e){}
    var state={};
    try{ state={ lang:(w.LANG!=null?w.LANG:undefined), custCountry:(w.CUST_COUNTRY!=null?w.CUST_COUNTRY:undefined), selectedCompany:(w.SELECTED_COMPANY!=null?w.SELECTED_COMPANY:null), lastDate:(w.lastDate!=null?w.lastDate:undefined) }; }catch(e){}
    return { template:__current, client:client, reference:ref, amount:amount, event_date:evd, data:{ cover:cover?cover.innerHTML:'', body:body?body.innerHTML:'', state:state } };
  }

  /* ---------- OBRÁZKY → STORAGE (namiesto base64 v ponuke) ---------- */
  function _imgExt(mime){ return ({'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'})[mime]||'img'; }
  async function _uploadDataUrl(dataUrl, offerId){
    var m=/^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
    var mime=m?m[1]:'image/png';
    var blob=await (await fetch(dataUrl)).blob();
    var path='nl/'+(offerId||'tmp')+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+_imgExt(mime);
    var up=await sbc.storage.from('nl-assets').upload(path, blob, { contentType:mime, upsert:false });
    if(up.error) throw up.error;
    return sbc.storage.from('nl-assets').getPublicUrl(path).data.publicUrl;
  }
  // Nahradí všetky base64 obrázky vo poliach cover/body/project verejnými URL z úložiska.
  async function bakeDataImages(data, offerId){
    if(!data) return 0;
    var fields=['project','cover','body'], baked=0;
    for(var fi=0; fi<fields.length; fi++){
      var key=fields[fi], str=data[key];
      if(typeof str!=='string' || str.indexOf('data:image')<0) continue;
      var seen={}, list=[], re=/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, mm;
      while((mm=re.exec(str))){ if(!seen[mm[0]]){ seen[mm[0]]=1; list.push(mm[0]); } }
      for(var i=0;i<list.length;i++){
        try{ var url=await _uploadDataUrl(list[i], offerId); str=str.split(list[i]).join(url); baked++; }
        catch(e){ /* pri zlyhaní necháme base64, aby sa obrázok nestratil */ }
      }
      data[key]=str;
    }
    return baked;
  }

  window.cloudSave = async function(opts){
    opts=opts||{};
    var snap=serializeActive();
    if(!snap){ if(!opts.silent) alert('Najprv otvor ponuku.'); return false; }
    // Najprv presuň prípadné base64 obrázky do úložiska (inak je ponuka obrovská a uloženie zlyhá).
    try{
      var baked=await bakeDataImages(snap.data, currentOfferId);
      if(baked && !opts.silent) toast(baked+' obrázk'+(baked===1?' presunutý':(baked<5?'y presunuté':'ov presunutých'))+' do úložiska');
    }catch(e){}
    var _sz=0; try{ _sz=JSON.stringify(snap.data||{}).length; }catch(e){}
    if(_sz>4500000){ var big='Ponuka je veľmi veľká ('+(Math.round(_sz/1048576*10)/10)+' MB) – uloženie môže zlyhať. Skús zmenšiť/odstrániť veľké obrázky.'; if(!opts.silent) alert(big); else toast('⚠ '+big); }
    var def = (snap.client && snap.client.indexOf('Spoločnosť')<0 && snap.client.length>1) ? snap.client : 'Nová ponuka';
    var title;
    if(currentOfferId){ title = snap.client||def; }
    else if(opts.silent){ title = (snap.client && snap.client.length>1)? snap.client : ('Ponuka '+new Date().toLocaleDateString('sk-SK')); }
    else if(snap.template==='corp' && snap.client && snap.client.length>1 && snap.client.indexOf('Spoločnosť')<0){ title = snap.client; }
    else { title = prompt('Názov ponuky (pre zoznam):', def); if(title===null) return false; }
    var row={ template:snap.template, title:title, client:snap.client, reference:snap.reference, data:snap.data };
    if(snap.amount!=null) row.amount=snap.amount;
    if(snap.event_date) row.event_date=snap.event_date;
    var res;
    if(currentOfferId){ res=await sbc.from('offers').update(row).eq('id',currentOfferId).select('id').single(); }
    else { res=await sbc.from('offers').insert(row).select('id').single(); }
    if(res.error){ if(!opts.silent) alert('Chyba pri ukladaní: '+res.error.message); else toast('⚠ Automatické uloženie zlyhalo – zmeny nie sú uložené'); return false; }
    currentOfferId=res.data.id; setDirty(false); flashSaved();
    if(!opts.silent) toast('Uložené ✓'); else toast('Automaticky uložené ✓');
    return true;
  };

  /* ---------- AUTO-SAVE každých 60 s ---------- */
  setInterval(function(){
    if(sharedMode) return;
    if(!dirty) return;
    if((typeof __current==='undefined') || !__current) return;
    if(currentOfferId){ window.cloudSave({silent:true}); return; }
    // NOVÁ ešte neuložená ponuka s reálnym obsahom → ulož ju, nech sa koncept nestratí
    try{ var s=serializeActive(); if(s && ((s.client && s.client.length>1) || (s.data && JSON.stringify(s.data).length>400))){ window.cloudSave({silent:true}); } }catch(e){}
  }, 60000);

  /* ---------- POISTKA: varuj pred zatvorením/refreshom s neuloženými zmenami ---------- */
  window.addEventListener('beforeunload', function(e){
    if(dirty && !sharedMode){ e.preventDefault(); e.returnValue='Máte neuložené zmeny v ponuke. Naozaj odísť?'; return e.returnValue; }
  });

  /* ---------- ZOZNAM + FILTRE ---------- */
  window.cloudList = async function(){
    var res=await sbc.from('offers').select('id,template,title,client,reference,status,follow_up_date,updated_at,deleted_at').order('updated_at',{ascending:false});
    if(res.error){ alert(res.error.message); return; }
    cache={}; (res.data||[]).forEach(function(o){ cache[o.id]=o; });
    try{ var vs=await sbc.from('offer_view_stats').select('offer_id,views,last_viewed'); (vs.data||[]).forEach(function(r){ if(cache[r.offer_id]){ cache[r.offer_id]._views=r.views; cache[r.offer_id]._lastView=r.last_viewed; } }); }catch(e){}
    cloudRenderRows();
    document.getElementById('cloudPanel').style.display='block';
  };
  window.cloudRenderRows = function(){
    var q=(document.getElementById('cloudSearch').value||'').trim().toLowerCase();
    var ft=document.getElementById('cloudFilterType').value;
    var fs=document.getElementById('cloudFilterStatus').value;
    var ids=Object.keys(cache).sort(function(a,b){ return new Date(cache[b].updated_at)-new Date(cache[a].updated_at); });
    var html='';
    ids.forEach(function(id){
      var o=cache[id];
      if(ft && o.template!==ft) return;
      var st=o.status||'draft';
      if(st==='deleted' && !fs) return;
      if(fs && st!==fs) return;
      if(q){ var hay=((o.title||'')+' '+(o.client||'')+' '+(o.reference||'')).toLowerCase(); if(hay.indexOf(q)<0) return; }
      var dt=new Date(o.updated_at).toLocaleString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var today0=new Date(); today0.setHours(0,0,0,0);
      var fuTxt='';
      if(o.follow_up_date){ var fud=new Date(o.follow_up_date); var over=fud<=today0; fuTxt=' · <span class="fu'+(over?' due':'')+'">⏰ '+fud.toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit'})+'</span>'; }
      var seenTxt = o._views ? (' · <span class="seen" title="Klient otvoril zdieľanú ponuku">👁 '+o._views+'× '+new Date(o._lastView).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit'})+'</span>') : '';
      var delTxt='';
      if(st==='deleted'){ var base=o.deleted_at?new Date(o.deleted_at):new Date(o.updated_at); var left=Math.ceil(5-(Date.now()-base.getTime())/86400000); delTxt=' · <span class="fu due">🗑 zmaže sa '+(left>1?('o '+left+' dni'):(left===1?'zajtra':'dnes'))+'</span>'; }
      html+='<div class="row'+(st==='cancelled'?' cancelled':'')+'">'
        +'<div class="rowTop" onclick="cloudOpen(\''+id+'\')">'
          +'<span class="badge">'+esc(labels[o.template]||o.template)+'</span>'
          +'<div style="flex:1"><div class="ttl">'+esc(o.title||o.client||'Bez názvu')+'</div>'
          +'<div class="meta">'+esc(o.reference||'')+' · '+dt+fuTxt+seenTxt+delTxt+'</div></div>'
          +'<span class="st '+st+'" title="Klik = zmeniť stav" onclick="event.stopPropagation();cloudCycleStatus(\''+id+'\')">'+esc(statusLabels[st]||st)+'</span>'
        +'</div>'
        +'<div class="rowActs">'
          +(st==='deleted'
             ? ('<button class="pri" onclick="cloudRestore(\''+id+'\')">♻ Obnoviť z koša</button>'
                +'<button onclick="cloudOpen(\''+id+'\')">Otvoriť</button>')
             : ('<button onclick="cloudOpen(\''+id+'\')">Otvoriť</button>'
                +'<button onclick="createDealFromOffer(\''+id+'\')">→ Akcia</button>'
                +'<button onclick="cloudSetFollowup(\''+id+'\')">Follow-up</button>'
                +'<button onclick="cloudShare(\''+id+'\')">Zdieľať</button>'
                +'<button onclick="cloudDuplicate(\''+id+'\')">Duplikovať</button>'
                +'<button onclick="cloudHistory(\''+id+'\')">História</button>'
                +'<button onclick="cloudCancelOffer(\''+id+'\','+(st==='cancelled'?'false':'true')+')">'+(st==='cancelled'?'Obnoviť':'Zrušiť')+'</button>'
                +'<button class="danger" onclick="cloudDelete(\''+id+'\')">Zmazať</button>'))
        +'</div>'
      +'</div>';
    });
    document.getElementById('cloudRows').innerHTML = html || '<div class="empty">Žiadne ponuky nevyhovujú filtru.</div>';
  };

  window.cloudCycleStatus = async function(id){
    var o=cache[id]; if(!o) return;
    var cur=o.status||'draft'; var nx=statusOrder[(statusOrder.indexOf(cur)+1)%statusOrder.length];
    var res=await sbc.from('offers').update({status:nx}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    o.status=nx; cloudRenderRows(); toast('Stav: '+(statusLabels[nx]||nx));
  };
  window.cloudCancelOffer = async function(id, cancel){
    var o=cache[id]; if(!o) return;
    if(cancel && !confirm('Zrušiť túto ponuku?\n\nZostane v zozname ponúk označená ako „Zrušená", ale zmizne z kalendára aj zo všetkých prehľadov.')) return;
    var nx = cancel ? 'cancelled' : 'draft';
    var res=await sbc.from('offers').update({status:nx}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    o.status=nx; cloudRenderRows(); toast(cancel?'Ponuka zrušená':'Ponuka obnovená');
  };

  window.cloudSetFollowup = async function(id){
    var o=cache[id]; if(!o) return;
    var cur=o.follow_up_date||'';
    var val=prompt('Dátum follow-upu (RRRR-MM-DD), prázdne = zrušiť:', cur);
    if(val===null) return;
    val=val.trim();
    if(val && !/^\d{4}-\d{2}-\d{2}$/.test(val)){ alert('Neplatný dátum. Použite formát RRRR-MM-DD.'); return; }
    var res=await sbc.from('offers').update({follow_up_date: val||null}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    o.follow_up_date=val||null; cloudRenderRows(); toast(val?('Follow-up: '+val):'Follow-up zrušený');
  };

  window.cloudRestore = async function(id){
    var res=await sbc.from('offers').update({status:'draft', deleted_at:null}).eq('id',id);
    if(res.error){ alert('Chyba pri obnove: '+res.error.message); return; }
    if(cache[id]) cache[id].status='draft';
    cloudRenderRows();
    toast('Ponuka obnovená z koša ✓');
  };

  window.cloudDelete = async function(id){
    if(!confirm('Presunúť ponuku do koša?\n\nV koši zostane 5 dní, potom sa automaticky zmaže (obnoviteľná z histórie).')) return;
    var res=await sbc.from('offers').update({status:'deleted', deleted_at:new Date().toISOString()}).eq('id',id);
    if(res.error){
      console.log('Delete error:',res.error);
      alert('Chyba mazania: '+res.error.message);
      return;
    }
    if(cache[id]) cache[id].status='deleted';
    cloudRenderRows();
    toast('Ponuka presunutá do koša ✓');
  };

  window.cloudDuplicate = async function(id){
    var full=await sbc.from('offers').select('template,title,client,reference,data').eq('id',id).single();
    if(full.error){ alert(full.error.message); return; }
    var d=full.data;
    var row={ template:d.template, title:(d.title||'Ponuka')+' (kópia)', client:d.client, reference:d.reference, data:d.data, status:'draft' };
    var res=await sbc.from('offers').insert(row).select('id,template,title,client,reference,status,updated_at').single();
    if(res.error){ alert(res.error.message); return; }
    cache[res.data.id]=res.data; cloudRenderRows(); toast('Ponuka zduplikovaná ✓');
  };

  /* ---------- ZDIEĽANIE (read-only link) ---------- */
  window.cloudShare = async function(id){
    var g=await sbc.from('offers').select('share_token').eq('id',id).single();
    if(g.error){ alert(g.error.message); return; }
    var tok=g.data.share_token;
    if(!tok){ tok=newToken(); var u=await sbc.from('offers').update({share_token:tok}).eq('id',id); if(u.error){ alert(u.error.message); return; } }
    var link=location.origin+location.pathname+'?share='+tok;
    try{ await navigator.clipboard.writeText(link); toast('Odkaz skopírovaný do schránky ✓'); }
    catch(e){ prompt('Skopírujte read-only odkaz pre klienta:', link); }
  };

  /* ---------- HISTÓRIA VERZIÍ ---------- */
  window.cloudHistory = async function(id){
    var res=await sbc.from('offer_history').select('id,operation,changed_at,title,client,status,snapshot').eq('offer_id',id).order('changed_at',{ascending:false}).limit(50);
    if(res.error){ alert(res.error.message); return; }
    var opLabel={INSERT:'Vytvorené', UPDATE:'Úprava', DELETE:'Zmazané'};
    var html='';
    (res.data||[]).forEach(function(h){
      var dt=new Date(h.changed_at).toLocaleString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var canRestore = h.snapshot && h.snapshot.data && h.snapshot.template;
      window.__hist=window.__hist||{}; window.__hist[h.id]=h;
      html+='<div class="hrow"><div class="hmeta">'+esc(opLabel[h.operation]||h.operation)
        +'<small>'+dt+' · '+esc(h.title||h.client||'')+'</small></div>'
        +(canRestore?'<button onclick="cloudRestoreVersion(\''+h.id+'\')">Obnoviť túto verziu</button>':'<span style="font-size:11px;color:#bbb">—</span>')
        +'</div>';
    });
    document.getElementById('histRows').innerHTML = html || '<div class="empty">Zatiaľ žiadne zaznamenané zmeny.</div>';
    document.getElementById('histPanel').style.display='block';
  };
  window.cloudRestoreVersion = function(histId){
    var h=(window.__hist||{})[histId]; if(!h||!h.snapshot){ return; }
    if(!confirm('Obnoviť túto verziu do otvorenej ponuky? Aktuálny obsah prepíšete (môžete uložiť ako novú verziu).')) return;
    var snap=h.snapshot;
    var rec={ id: snap.id||currentOfferId, template: snap.template, data: (snap.data||{}) };
    document.getElementById('histPanel').style.display='none';
    document.getElementById('cloudPanel').style.display='none';
    openRecord(rec);
    setTimeout(function(){ setDirty(true); }, 800);
  };

  /* ---------- OTVORENIE / OBNOVA (oprava bugu) ---------- */
  function lockReadOnly(d){
    try{
      try{ if(d.body) d.body.classList.remove('editing'); }catch(e){}
      d.querySelectorAll('input,select,textarea').forEach(function(el){ el.setAttribute('disabled','disabled'); });
      d.querySelectorAll('[contenteditable]').forEach(function(el){ el.setAttribute('contenteditable','false'); });
      // neutralise the in-template "back to selector" link
      d.querySelectorAll('a[onclick*="showSelector"]').forEach(function(a){ a.removeAttribute('onclick'); a.removeAttribute('href'); a.style.display='none'; });
      var st=d.createElement('style');
      st.textContent='.no-print-screen{display:none!important;}.storno-selector,.no-print-storno,.release-controls{display:none!important;}.toolbar,.verbar,.metabar,.rtbar,.edit-hint,.drawer,.blockmenu,.card-ctrls,.xctrls{display:none!important;}.no-print,.del-btn,.add-row-btn,.section-del,.mv-btn,.storno-del,.storno-add-btn,.actions,.lang-switch,.disc-block .add-row-btn,[onclick*="saveOfferHTML"],[onclick*="showSelector"]{display:none!important;}body{cursor:default;}';
      d.head.appendChild(st);
    }catch(e){}
  }
  function applyRestore(f, rec, readOnly){
    var w=f.contentWindow; if(!w || !w.document){ return; }
    var d=w.document;
    var data=rec.data||{};
    if(rec.template==='newsletter'){
      try{ if(data.project && typeof w.restoreState==='function') w.restoreState(data.project); }catch(e){}
      if(readOnly){ lockReadOnly(d); } else { attachDirtyTracking(d); }
      return;
    }
    try{
      if(data.cover){ var c=d.querySelector('.cover-page'); if(c) c.innerHTML=data.cover; }
      if(data.body){ var b=d.querySelector('.doc-body'); if(b) b.innerHTML=data.body; }
      // restore template globals if we saved them
      var st=data.state;
      if(st){
        try{
          if(st.lang!=null) w.LANG=st.lang;
          if(st.custCountry!=null) w.CUST_COUNTRY=st.custCountry;
          if(st.selectedCompany!=null) w.SELECTED_COMPANY=st.selectedCompany;
          if(st.lastDate!=null) w.lastDate=st.lastDate;
          if(st.lang && typeof w.setLang==='function') w.setLang(st.lang);
        }catch(e){}
      }
      try{ if(typeof w.injectSectionRemovers==='function') w.injectSectionRemovers(); }catch(e){}
      try{ if(typeof w.recalc==='function') w.recalc(); }catch(e){}
      try{ if(typeof w.renderRelease==='function') w.renderRelease(); }catch(e){}
    }catch(e){}
    if(readOnly){ lockReadOnly(d); }
    else { attachDirtyTracking(d); }
  }
  // poll until the template DOM is ready, then restore (fixes the 60 ms race)
  function waitAndRestore(f, rec, readOnly, done){
    var tries=0;
    (function poll(){
      var d=(f.contentWindow&&f.contentWindow.document)?f.contentWindow.document:null;
      var ready = d && (rec.template==='newsletter'
        ? (d.getElementById('newsletter') && f.contentWindow && typeof f.contentWindow.restoreState==='function')
        : d.querySelector('.doc-body'));
      if(ready){
        applyRestore(f, rec, readOnly);
        // second pass shortly after, to defeat any late template re-render
        setTimeout(function(){ applyRestore(f, rec, readOnly); if(done) done(); }, 120);
        return;
      }
      if(tries++>80){ if(done) done(); return; }
      setTimeout(poll, 40);
    })();
  }
  function openRecord(rec){
    var f=document.getElementById('offerFrame');
    var prev=(typeof __current!=='undefined')?__current:null;
    loadingRecord=true; setDirty(false);
    var finish=function(){
      currentOfferId = rec.id || currentOfferId;
      loadingRecord=false;
      document.getElementById('cloudPanel').style.display='none';
      if(sharedMode){
        try{ window.showSelector=function(){}; }catch(e){}
        try{ window.openOffer=function(){}; }catch(e){}
        try{ window.onhashchange=function(){ return false; }; }catch(e){}
      } else {
        toast('Ponuka načítaná');
      }
    };
    var doc0 = f.contentWindow && f.contentWindow.document;
    var alreadyOpen = (prev===rec.template) && doc0 &&
      (rec.template==='newsletter' ? doc0.getElementById('newsletter') : doc0.querySelector('.doc-body'));
    if(alreadyOpen){
      window.openOffer(rec.template);
      waitAndRestore(f, rec, !!sharedMode, finish);
    } else {
      var h=function(){ f.removeEventListener('load',h); waitAndRestore(f, rec, !!sharedMode, finish); };
      f.addEventListener('load', h);
      window.openOffer(rec.template);
    }
  }
  window.cloudOpen = async function(id){
    var lite=cache[id];
    var full=await sbc.from('offers').select('id,template,data').eq('id',id).single();
    if(full.error){ alert('Nepodarilo sa načítať ponuku: '+full.error.message); return; }
    openRecord({ id: full.data.id, template: full.data.template, data: full.data.data||{} });
  };

  // fresh open from selector cards => start a NEW offer (reset id)
  if(window.openOffer){
    var _open=window.openOffer;
    window.openOffer=function(w){
      if(!loadingRecord){ currentOfferId=null; setDirty(false); }
      try{ document.getElementById('dashView').classList.remove('open'); }catch(e){}
      try{ document.getElementById('calView').classList.remove('open'); }catch(e){}
      try{ document.getElementById('dealView').classList.remove('open'); }catch(e){}
      try{ document.getElementById('fcView').classList.remove('open'); }catch(e){}
      var r=_open(w);
      try{ syncCtxSave(); }catch(e){}
      if(!sharedMode){
        var f=document.getElementById('offerFrame');
        var h=function(){ f.removeEventListener('load',h); try{ attachDirtyTracking(f.contentWindow.document); }catch(e){} };
        f.addEventListener('load',h);
      }
      return r;
    };
  }

  /* ---------- ZDIEĽANÝ READ-ONLY POHĽAD (?share=token) ---------- */
  async function renderShared(tok){
    sharedMode=true; document.body.classList.add('shared-view');
    document.getElementById('cloudLogin').style.display='none';
    var res;
    try { res = await sbc.rpc('get_shared_offer',{p_token:tok}); }
    catch(e){ document.getElementById('sharedBadge').textContent='Chyba pripojenia — skús to neskôr.'; return; }
    if(res.error || !res.data || !res.data.length){
      document.getElementById('sharedBadge').textContent='Táto ponuka už nie je dostupná.';
      return;
    }
    var rec=res.data[0];
    try{ await sbc.rpc('log_offer_view',{ p_token: tok, p_ua: (navigator.userAgent||'').slice(0,200) }); }catch(e){}
    document.getElementById('sharedBadge').textContent='Ponuka pre '+(rec.client||'klienta')+' · Swissôtel Damian Jasna';
    openRecord({ id: rec.id, template: rec.template, data: rec.data||{} });
  }

  /* ---------- NEWSLETTER (admin) ---------- */
  var nlCache=[];
  window.showNewsletter = async function(){
    var res=await sbc.from('newsletter_subscribers').select('id,email,name,status,source,created_at').order('created_at',{ascending:false});
    if(res.error){ alert('Nepodarilo sa načítať odberateľov: '+res.error.message); return; }
    nlCache=res.data||[];
    nlRenderRows();
    document.getElementById('nlPanel').style.display='block';
  };
  window.nlRenderRows = function(){
    var q=(document.getElementById('nlSearch').value||'').trim().toLowerCase();
    var sub=nlCache.filter(function(r){ return (r.status||'subscribed')==='subscribed'; }).length;
    document.getElementById('nlCount').textContent='Spolu '+nlCache.length+' kontaktov · '+sub+' aktívnych odberateľov';
    var rows=nlCache.filter(function(r){ if(!q) return true; return ((r.email||'')+' '+(r.name||'')).toLowerCase().indexOf(q)>=0; });
    var html='';
    rows.forEach(function(r){
      var st=r.status||'subscribed';
      var dt=new Date(r.created_at).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'});
      html+='<div class="nlrow"><div style="flex:1"><div class="em">'+esc(r.email)+'</div>'
        +'<small>'+esc(r.name||'')+(r.name?' · ':'')+dt+' · '+esc(r.source||'')+'</small></div>'
        +'<div class="acts"><span class="stt '+st+'">'+(st==='subscribed'?'Aktívny':'Odhlásený')+'</span>'
        +(st==='subscribed'?'<button onclick="nlSetStatus(\''+r.id+'\',\'unsubscribed\')">Odhlásiť</button>':'<button onclick="nlSetStatus(\''+r.id+'\',\'subscribed\')">Obnoviť</button>')
        +'<button class="danger" onclick="nlDelete(\''+r.id+'\')">Zmazať</button></div></div>';
    });
    document.getElementById('nlRows').innerHTML = html || '<div class="empty">Zatiaľ žiadne kontakty.</div>';
  };
  window.nlSetStatus = async function(id,status){
    var res=await sbc.from('newsletter_subscribers').update({status:status}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    var r=nlCache.find(function(x){return x.id===id;}); if(r) r.status=status; nlRenderRows();
  };
  window.nlDelete = async function(id){
    if(!confirm('Zmazať tento kontakt?')) return;
    var res=await sbc.from('newsletter_subscribers').delete().eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    nlCache=nlCache.filter(function(x){return x.id!==id;}); nlRenderRows();
  };
  window.nlAddManual = async function(){
    var email=prompt('E-mail nového kontaktu:'); if(!email) return; email=email.trim();
    if(email.indexOf('@')<1){ alert('Neplatný e-mail.'); return; }
    var name=prompt('Meno (nepovinné):')||null;
    var res=await sbc.from('newsletter_subscribers').insert({email:email,name:name,source:'manual'}).select('id,email,name,status,source,created_at').single();
    if(res.error){ alert(res.error.code==='23505'?'Tento e-mail už v zozname je.':res.error.message); return; }
    nlCache.unshift(res.data); nlRenderRows();
  };
  window.nlCopyLink = async function(){
    var link=location.origin+location.pathname+'?newsletter=1';
    try{ await navigator.clipboard.writeText(link); toast('Odkaz na prihlásenie skopírovaný ✓'); }
    catch(e){ prompt('Odkaz na prihlásenie k odberu:', link); }
  };
  window.nlExportCsv = function(){
    var rows=[['email','meno','stav','zdroj','dátum']];
    nlCache.forEach(function(r){ rows.push([r.email||'', r.name||'', r.status||'', r.source||'', new Date(r.created_at).toISOString().slice(0,10)]); });
    var csv=rows.map(function(row){ return row.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8;'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='newsletter_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
  };

  /* ---------- NEWSLETTER (verejné prihlásenie) ---------- */
  window.nlSubscribe = async function(){
    var email=(document.getElementById('nlPubEmail').value||'').trim();
    var name=(document.getElementById('nlPubName').value||'').trim()||null;
    var msg=document.getElementById('nlPubMsg'); var btn=document.getElementById('nlPubBtn');
    msg.textContent=''; msg.className='msg';
    if(email.indexOf('@')<1){ msg.className='msg err'; msg.textContent='Zadajte platný e-mail.'; return; }
    btn.disabled=true;
    var res=await sbc.from('newsletter_subscribers').insert({email:email,name:name,source:'web'});
    if(res.error){
      if(res.error.code==='23505'){ msg.className='msg ok'; msg.textContent='Tento e-mail už odoberá naše novinky. Ďakujeme!'; }
      else { msg.className='msg err'; msg.textContent='Prihlásenie sa nepodarilo. Skúste to znova.'; btn.disabled=false; return; }
    } else {
      msg.className='msg ok'; msg.textContent='Hotovo! Ste prihlásený na odber. Ďakujeme.';
    }
    document.getElementById('nlPubEmail').value=''; document.getElementById('nlPubName').value='';
  };
  function renderNewsletterSignup(){ document.getElementById('cloudLogin').style.display='none'; document.getElementById('nlPublic').classList.add('open'); }

  /* ---------- ROLE / OPRÁVNENIA ---------- */
  var myRole='sales';
  async function refreshRole(){
    try{ var r=await sbc.rpc('my_role'); myRole=(r && !r.error && r.data) ? r.data : 'sales'; }catch(e){ myRole='sales'; }
    applyRoleUI();
    if(!sharedMode){
      if(myRole==='finance'){ try{ showDocs(); }catch(e){} }
      else if(myRole==='revenue'){ try{ showForecast(); }catch(e){} }
      else { try{ showDashboard(); }catch(e){} }
    }
  }
  function applyRoleUI(){
    var isAdmin = myRole==='admin';
    var canCreate = (myRole==='admin' || myRole==='sales' || myRole==='revenue');
    function show(id,on){ var el=document.getElementById(id); if(el) el.style.display = on ? '' : 'none'; }
    show('btnAdmin', isAdmin);
    show('btnDeals', canCreate);
    show('btnDash', canCreate);
    syncCtxSave();
    show('btnMyOffers', canCreate);
    show('btnNewsletter', canCreate);
    show('btnDocs', true);
    show('btnCal', true);
    show('btnAi', canCreate);
    var u=document.getElementById('cloudUser');
    if(u){ u.textContent = (u.textContent||'').replace(/\s*·.*$/,'') + (myRole==='finance'?' · Financie':(myRole==='admin'?' · Admin':(myRole==='revenue'?' · Revenue':''))); }
    if(myRole==='finance'){ try{ document.getElementById('view-selector').style.display='none'; }catch(e){} }
  }

  /* ---------- ZMLUVA / DEPOZIT → DOKUMENTY ---------- */
  function captureDocHTML(kind){
    var f=document.getElementById('offerFrame'); var w=f&&f.contentWindow; if(!w) return null;
    var fn = kind==='contract' ? w.generateContract : w.generateDepositFolio;
    if(typeof fn!=='function') return null;
    var cap=w.document.createElement('iframe');
    cap.style.cssText='position:fixed;left:-99999px;top:0;width:900px;height:10px;border:0;';
    w.document.body.appendChild(cap);
    var html=null;
    try{
      fn.call(w, (w.LANG||'sk'), cap.contentWindow);
      // For deposit folio: apply the last user-entered pct/amount (from open popup) to the captured doc
      // and sync input.value -> value attribute so outerHTML serialization preserves the user's edits.
      if(kind==='deposit'){
        try{
          var capWin=cap.contentWindow, capDoc=capWin.document;
          var p=capDoc.getElementById('depPct'), a=capDoc.getElementById('depAmt');
          var lastAmt = w.__depFolioLastAmount || w.__depFolioLastAmt || w.__depFolioAmount || null;
          var lastPct = (w.__depFolioLastPct!=null) ? w.__depFolioLastPct : null;
          if(p && a){
            // Prefer amount as source of truth (covers both "user changed pct" and "user changed amount" cases)
            if(lastAmt!=null && typeof capWin.fromAmt==='function'){
              var fmt=Number(lastAmt).toLocaleString('sk-SK',{minimumFractionDigits:2,maximumFractionDigits:2})+' \u20ac';
              a.value=fmt;
              capWin.fromAmt(true);
            } else if(lastPct!=null && typeof capWin.up==='function'){
              p.value=String(lastPct).replace('.',',');
              capWin.up();
            }
            // Persist current input.value into the value attribute for serialization
            p.setAttribute('value', p.value);
            a.setAttribute('value', a.value);
          }
        }catch(e){}
      }
      html='<!DOCTYPE html>'+cap.contentWindow.document.documentElement.outerHTML;
    }catch(e){}
    setTimeout(function(){ try{ cap.remove(); }catch(e){} }, 60);
    return html;
  }
  window.saveDocFromOffer = async function(kind){
    if(myRole==='finance'){ alert('Financie nemajú právo vytvárať dokumenty.'); return; }
    var ok = (typeof __current!=='undefined') && ['mice','corp','acc','sport','wedding'].indexOf(__current)>=0;
    if(!ok){ alert('Najprv otvor ponuku, z ktorej sa zmluva/depozit generuje.'); return; }
    var w=document.getElementById('offerFrame').contentWindow;
    // Snapshot deposit amount NOW before captureDocHTML overwrites __depFolioAmount
    // Read from popup window directly (srcdoc iframe's window.open popup has opener=top, not w)
    var __savedDepAmount = null;
    // 1. Top-level window (popup's window.opener = top window when offerFrame uses srcdoc)
    if(window.__depFolioLastAmt){ __savedDepAmount = window.__depFolioLastAmt; }
    // 2. Popup window directly (if still open)
    try{
      if(!__savedDepAmount && w.__depFolioWin && !w.__depFolioWin.closed && w.__depFolioWin.__depFolioLastAmount){
        __savedDepAmount = w.__depFolioWin.__depFolioLastAmount;
      }
    }catch(e){}
    // 3. offerFrame window (fallback)
    if(!__savedDepAmount && w.__depFolioLastAmt){ __savedDepAmount = w.__depFolioLastAmt; }
    if(!__savedDepAmount && w.__depFolioAmount){ __savedDepAmount = w.__depFolioAmount; }

    var html = captureDocHTML(kind==='contract'?'contract':'deposit');
    if(!html){ alert('Tento typ ponuky nepodporuje '+(kind==='contract'?'zmluvu':'depozitnú faktúru')+'.'); return; }
    function gv(id){ try{ var el=w.document.getElementById(id); return el?((el.value!=null?el.value:el.textContent)||'').trim():''; }catch(e){ return ''; } }
    var client=gv('calcClientName')||gv('hdr-client'); var ref=gv('hdr-ref');
    var type = kind==='contract' ? 'contract' : 'deposit_invoice';
    var amount=null; try{
      if(type==='deposit_invoice'){
        // Read deposit % from the open folio popup (window.__depFolioWin) and
        // compute amount from stored total (window.__depFolioTotal).
        // Use pre-captured amount (snapshotted before captureDocHTML overwrites it)
        if(__savedDepAmount){ amount = __savedDepAmount; }
        // Fallback: __depFolioTotal * 50%
        if(!amount && w.__depFolioTotal){
          amount = Math.round(w.__depFolioTotal * 50 / 100 * 100) / 100;
        }
        // Last resort: grandTotal * 50%
        if(!amount){
          var gtEl2=w.document.getElementById('grandTotal');
          if(gtEl2){
            var gt=parseFloat((gtEl2.textContent||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;
            if(gt>0) amount=Math.round(gt*50/100*100)/100;
          }
        }
      } else {
        // For contracts use the full grand total
        var gtEl=w.document.getElementById('grandTotal');
        if(gtEl){ amount=parseFloat((gtEl.textContent||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))||null; }
      }
    }catch(e){}
    var title = (kind==='contract'?'Zmluva':'Depozitná faktúra')+(client?(' – '+client):'');
    var due=null;
    if(type==='deposit_invoice'){
      var def=new Date(Date.now()+14*864e5).toISOString().slice(0,10);
      var dv=prompt('Splatnosť depozitu (RRRR-MM-DD), prázdne = bez termínu:', def);
      if(dv===null) return;
      dv=(dv||'').trim();
      if(dv && !/^\d{4}-\d{2}-\d{2}$/.test(dv)){ alert('Neplatný dátum. Použite formát RRRR-MM-DD.'); return; }
      due=dv||null;
    }
    var dealId=null; if(currentOfferId){ try{ var dlk=await sbc.from('offers').select('deal_id').eq('id',currentOfferId).single(); dealId=(dlk.data&&dlk.data.deal_id)||null; }catch(e){} }
    var res=await sbc.from('documents').insert({ offer_id:(currentOfferId||null), deal_id:dealId, type:type, title:title, client:client, reference:ref, amount:amount, due_date:due, html:html }).select('id').single();
    if(res.error){ alert('Uloženie zlyhalo: '+res.error.message); return; }
    toast((kind==='contract'?'Zmluva':'Depozit')+' uložené do Dokumentov ✓');
  };

  /* ---------- DOKUMENTY (zoznam, PDF, úhrada) ---------- */
  var docCache=[];
  window.showDocs = async function(typeFilter){
    var res=await sbc.from('documents').select('id,type,title,client,reference,doc_number,amount,currency,status,paid_at,due_date,file_path,created_at').order('created_at',{ascending:false});
    if(res.error){ alert(res.error.message); return; }
    docCache=res.data||[];
    try{ if(typeof typeFilter==='string'){ document.getElementById('docFilterType').value=typeFilter; } }catch(e){}
    try{ var canUp=(myRole==='admin'||myRole==='sales'||myRole==='finance'||myRole==='revenue'); document.getElementById('docUploadBtn').style.display=canUp?'':'none'; }catch(e){}
    docsRender();
    document.getElementById('docsPanel').style.display='block';
  };
  window.docsRender = function(){
    var q=(document.getElementById('docSearch').value||'').toLowerCase();
    var ft=document.getElementById('docFilterType').value, fs=document.getElementById('docFilterStatus').value;
    var canPay=(myRole==='admin'||myRole==='finance'||myRole==='sales'||myRole==='revenue');
    var canEdit=(myRole==='admin'||myRole==='sales'||myRole==='revenue');
    (function(){
      var sumU=0,cntU=0,sumO=0,cntO=0,nextDue=null,nextClient='', t0s=new Date(); t0s.setHours(0,0,0,0);
      docCache.forEach(function(d){
        if(d.type!=='deposit_invoice' && d.type!=='final_invoice') return;
        if(ft && d.type!==ft) return;
        if(q && (((d.client||'')+' '+(d.reference||'')+' '+(d.title||'')+' '+(d.doc_number||'')).toLowerCase().indexOf(q)<0)) return;
        if(d.status==='paid') return;
        var a=Number(d.amount||0); sumU+=a; cntU++;
        if(d.due_date){ var dd=new Date(d.due_date);
          if(dd<t0s){ sumO+=a; cntO++; }
          else if(!nextDue || dd<nextDue){ nextDue=dd; nextClient=d.client||d.title||''; }
        }
      });
      var el=document.getElementById('docSummary');
      if(el){
        if(ft==='contract'){ el.style.display='none'; }
        else {
          el.style.display='';
          var h='<div class="su"><span class="lbl">Nezaplatené faktúry</span><span class="val">'+eur(sumU)+'</span><span class="cnt">'+cntU+' ks</span></div>';
          if(cntO) h+='<div class="su over"><span class="lbl">Po splatnosti</span><span class="val">'+eur(sumO)+'</span><span class="cnt">'+cntO+' ks</span></div>';
          if(nextDue) h+='<div class="su next"><span class="lbl">Najbližšia splatnosť</span><span class="val">'+nextDue.toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'})+'</span><span class="cnt">'+esc(nextClient||'')+'</span></div>';
          el.innerHTML=h;
        }
      }
    })();
    var html='';
    docCache.forEach(function(d){
      if(ft && d.type!==ft) return;
      if(fs && d.status!==fs) return;
      if(q && (((d.client||'')+' '+(d.reference||'')+' '+(d.title||'')).toLowerCase().indexOf(q)<0)) return;
      var dt=new Date(d.created_at).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'});
      var amt = d.amount!=null ? (Number(d.amount).toLocaleString('sk-SK',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(d.currency||'EUR')) : '';
      var dueTxt='';
      if((d.type==='deposit_invoice'||d.type==='final_invoice') && d.due_date){
        var t0=new Date(); t0.setHours(0,0,0,0);
        var over=(d.status!=='paid' && new Date(d.due_date)<t0);
        dueTxt=' · <span class="due'+(over?' over':'')+'">splatnosť '+new Date(d.due_date).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'})+(over?' (po termíne)':'')+'</span>';
      }
      var typeLab=(d.type==='contract'?'Zmluva':(d.type==='final_invoice'?'Vyúčt.':'Depozit'));
      var canEditDoc=(canEdit || (myRole==='finance' && d.type==='final_invoice'));
      var isInv=(d.type==='deposit_invoice'||d.type==='final_invoice');
      var numTxt = d.doc_number ? ('<b>'+(d.type==='deposit_invoice'?'VS ':'č. ')+esc(d.doc_number)+'</b> · ') : '';
      var openCall = (d.type==='final_invoice') ? ('docOpenFinal(\''+d.id+'\')') : ('docOpen(\''+d.id+'\')');
      var pdfGoneTxt = (d.type==='final_invoice' && d.status==='paid' && !d.file_path) ? ' · <span class="muted" title="PDF bolo po úhrade odstránené, miesto uvoľnené">📄 PDF archivované</span>' : '';
      html+='<div class="drow"><div class="top">'
        +'<span class="dtype '+d.type+'">'+typeLab+'</span>'
        +'<div style="flex:1"><div class="dtitle">'+esc(d.title||d.client||'Dokument')+'</div>'
        +'<div class="dmeta">'+numTxt+esc(d.reference||'')+(amt?(' · '+amt):'')+' · '+dt+dueTxt+pdfGoneTxt+'</div></div>'
        +'<span class="pay '+d.status+'">'+(d.type==='contract'?(d.status==='paid'?'Potvrdené':'Nepotvrdené'):(d.status==='paid'?'Uhradené':'Neuhradené'))+'</span></div>'
        +'<div class="acts"><button class="pri" onclick="'+openCall+'">Otvoriť / PDF</button>'
        +(canEditDoc?('<button onclick="docSetNumber(\''+d.id+'\')">'+(d.type==='deposit_invoice'?'Číslo / VS':'Číslo')+'</button>'):'')
        +(canPay?('<button onclick="docTogglePaid(\''+d.id+'\','+(d.status==='paid'?'false':'true')+')">'+(d.type==='contract'?(d.status==='paid'?'Označiť nepotvrdené':'Označiť potvrdené'):(d.status==='paid'?'Označiť neuhradené':'Označiť uhradené'))+'</button>'):'')
        +((canEditDoc && isInv)?('<button onclick="docSetDue(\''+d.id+'\')">Splatnosť</button>'):'')
        +((canEditDoc && isInv)?'<button onclick="docSetAmount(\''+d.id+'\')">Upraviť sumu</button>':'')
        +(canEditDoc?('<button class="danger" onclick="docDelete(\''+d.id+'\')">Zmazať</button>'):'')
        +'</div></div>';
    });
    document.getElementById('docRows').innerHTML = html || '<div class="empty">Žiadne dokumenty nevyhovujú filtru.</div>';
  };
  function dueFmt(iso){ if(!iso) return ''; var p=(''+iso).split('-'); if(p.length!==3) return iso; return p[2]+'. '+p[1]+'. '+p[0]; }
  function dueParse(s){ if(!s) return null; var m=(''+s).replace(/\s+/g,'').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/); if(!m) return null; return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2); }
  function injectDue(html, iso){
    try{
      var doc=new DOMParser().parseFromString(html,'text/html'); var dd=dueFmt(iso);
      Array.prototype.forEach.call(doc.querySelectorAll('.k'),function(k){
        if(/splatnos|due date/i.test(k.textContent||'')){ var v=k.parentNode && k.parentNode.querySelector('.v'); if(v) v.textContent=dd; }
      });
      return '<!DOCTYPE html>'+doc.documentElement.outerHTML;
    }catch(e){ return html; }
  }
  function extractDue(docEl){
    var found;
    Array.prototype.forEach.call(docEl.querySelectorAll('.k'),function(k){
      if(found!==undefined) return;
      if(/splatnos|due date/i.test(k.textContent||'')){ var v=k.parentNode && k.parentNode.querySelector('.v'); if(v) found=dueParse((v.textContent||'').trim()); }
    });
    return found;
  }
  function injectVS(html, num){
    try{
      var doc=new DOMParser().parseFromString(html,'text/html');
      var origVS=null;
      var ks=doc.querySelectorAll('.k');
      Array.prototype.forEach.call(ks,function(k){
        if(/ariabiln|ariable symbol/i.test(k.textContent||'')){
          var v=k.parentNode && k.parentNode.querySelector('.v');
          if(v){ if(origVS===null) origVS=(v.textContent||'').trim(); v.textContent=num; }
        }
      });
      var out='<!DOCTYPE html>'+doc.documentElement.outerHTML;
      if(origVS){ out=out.split('ZF'+origVS).join(num); }
      return out;
    }catch(e){ return html; }
  }
  var curDocId=null;
  window.docOpen = async function(id){
    var res=await sbc.from('documents').select('html,type,title,doc_number,due_date').eq('id',id).single();
    if(res.error){ alert(res.error.message); return; }
    curDocId=id;
    var html=res.data.html||'<p style="font-family:sans-serif;padding:30px">Prázdny dokument</p>';
    if(res.data.type==='deposit_invoice'){
      if(res.data.doc_number){ html=injectVS(html, res.data.doc_number); }
      if(res.data.due_date){ html=injectDue(html, res.data.due_date); }
    }
    var ttl=(res.data.title||'Dokument'); if(res.data.doc_number){ ttl+=' · '+(res.data.type==='deposit_invoice'?'VS ':'č. ')+res.data.doc_number; }
    document.getElementById('docEditTitle').textContent=ttl;
    document.getElementById('docEditFrame').srcdoc=html;
    document.getElementById('docEditView').classList.add('open');
  };
  window.docEditClose=function(){ document.getElementById('docEditView').classList.remove('open'); try{ document.getElementById('docEditFrame').srcdoc=''; }catch(e){} curDocId=null; };
  window.docEditSave=async function(){
    if(!curDocId){ return; }
    var f=document.getElementById('docEditFrame');
    var d=f.contentWindow && f.contentWindow.document;
    if(!d || !d.documentElement){ alert('Dokument ešte nie je načítaný, skús o sekundu.'); return; }
    // Sync <input> .value -> value attribute so user edits survive outerHTML serialization
    try{
      var ips=d.querySelectorAll('input,textarea');
      for(var k=0;k<ips.length;k++){
        try{ ips[k].setAttribute('value', ips[k].value); }catch(_e){}
      }
    }catch(e){}
    var html='<!DOCTYPE html>'+d.documentElement.outerHTML;
    var patch={html:html};
    var dc=(typeof docCache!=='undefined' && docCache)?docCache.find(function(x){return x.id===curDocId;}):null;
    if(dc && dc.type==='deposit_invoice'){
      var due=extractDue(d); if(due!==undefined){ patch.due_date=due; }
      // Extract deposit amount from iframe DOM (#depAmt) so the side panel reflects edits made inside the folio popup
      try{
        var amtEl=d.getElementById('depAmt');
        if(amtEl){
          var src=(amtEl.value!=null && amtEl.value!=='') ? amtEl.value : (amtEl.textContent||'');
          var raw=String(src).replace(/[^0-9,.\-]/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');
          var n=parseFloat(raw);
          if(!isNaN(n)&&n>=0){ patch.amount=Math.round(n*100)/100; }
        }
      }catch(e){}
    }
    var res=await sbc.from('documents').update(patch).eq('id',curDocId);
    if(res.error){ alert('Uloženie zlyhalo: '+res.error.message); return; }
    if(dc){
      if(patch.due_date!==undefined) dc.due_date=patch.due_date;
      if(patch.amount!==undefined) dc.amount=patch.amount;
      try{ docsRender(); }catch(e){}
      try{ dashRefresh(); }catch(e){}
    }
    toast('Zmeny uložené ✓');
  };
  window.docEditPrint=function(){ var f=document.getElementById('docEditFrame'); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ alert('Tlač sa nepodarila – v dokumente skús Ctrl/Cmd+P.'); } };
  window.docSetDue = async function(id){
    var d=docCache.find(function(x){return x.id===id;}); if(!d) return;
    var val=prompt('Splatnosť (RRRR-MM-DD), prázdne = bez termínu:', d.due_date||'');
    if(val===null) return; val=(val||'').trim();
    if(val && !/^\d{4}-\d{2}-\d{2}$/.test(val)){ alert('Neplatný dátum. Použite formát RRRR-MM-DD.'); return; }
    var res=await sbc.from('documents').update({due_date: val||null}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    try{ var hr=await sbc.from('documents').select('html,type').eq('id',id).single(); if(hr.data && hr.data.type==='deposit_invoice' && hr.data.html){ var nh=injectDue(hr.data.html, val||''); await sbc.from('documents').update({html:nh}).eq('id',id); } }catch(e){}
    d.due_date=val||null; docsRender(); toast(val?('Splatnosť: '+val):'Splatnosť zrušená');
  };
  function injectDepositAmount(html, newAmount){
    try{
      // Extract baked TOTAL from the popup script: "var TOTAL=<num>,..."
      var m = html.match(/var\s+TOTAL\s*=\s*([0-9.]+)/);
      if(!m) return null;
      var total = parseFloat(m[1]);
      if(!(total > 0)) return null;
      var pct = Math.round(newAmount / total * 10000) / 100;
      if(pct < 0) pct = 0; if(pct > 100) pct = 100;
      var pctStr = String(pct).replace('.', ',');
      var amtFmt = Number(newAmount).toLocaleString('sk-SK',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' \u20ac';
      // Replace value attribute inside <input id="depPct" ...> and <input id="depAmt" ...> (any attribute order)
      function repVal(tagRe, newVal){
        return html.replace(tagRe, function(tag){
          if(/\bvalue\s*=\s*"/.test(tag)){
            return tag.replace(/(\bvalue\s*=\s*")[^"]*(")/, '$1'+newVal.replace(/"/g,'&quot;')+'$2');
          }
          // No value attribute yet — inject before closing >
          return tag.replace(/\s*\/?>$/, ' value="'+newVal.replace(/"/g,'&quot;')+'">');
        });
      }
      html = repVal(/<input[^>]*\bid\s*=\s*"depPct"[^>]*>/, pctStr);
      html = repVal(/<input[^>]*\bid\s*=\s*"depAmt"[^>]*>/, amtFmt);
      return html;
    }catch(e){ return null; }
  }
  window.docSetAmount = async function(id){
    var d=docCache.find(function(x){return x.id===id;}); if(!d) return;
    var cur=(d.amount!=null)?String(d.amount).replace('.',','):'';
    var val=prompt('Nová suma zálohy (EUR, napr. 5 000,50):', cur);
    if(val===null) return;
    val=val.trim().replace(/\s/g,'').replace(',','.');
    var num=parseFloat(val);
    if(isNaN(num)||num<0){ alert('Neplatná suma.'); return; }
    num=Math.round(num*100)/100;
    var patch={amount:num};
    // For deposit invoices, also update the HTML so the invoice itself reflects new amount & recomputed pct
    if(d.type==='deposit_invoice'){
      try{
        var hr=await sbc.from('documents').select('html').eq('id',id).single();
        if(hr.data && hr.data.html){
          var nh=injectDepositAmount(hr.data.html, num);
          if(nh) patch.html=nh;
        }
      }catch(e){}
    }
    var res=await sbc.from('documents').update(patch).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    d.amount=num; docsRender(); try{ dashRefresh(); }catch(e){}
    toast('Suma upravená: '+num.toLocaleString('sk-SK',{minimumFractionDigits:2})+' EUR ✓');
  };
  window.docSetNumber = async function(id){
    var d=docCache.find(function(x){return x.id===id;}); if(!d) return;
    var isZF=(d.type==='deposit_invoice');
    var val=prompt(isZF?'Číslo zálohovej faktúry (= variabilný symbol):':'Číslo / názov dokumentu:', d.doc_number||'');
    if(val===null) return; val=(val||'').trim();
    var res=await sbc.from('documents').update({doc_number: val||null}).eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    d.doc_number=val||null; docsRender(); toast(val?((isZF?'VS / číslo ZF: ':'Číslo: ')+val):'Číslo odstránené');
  };
  window.docTogglePaid = async function(id,paid){
    var d=docCache.find(function(x){return x.id===id;});
    var willPurge = paid && d && d.type==='final_invoice' && d.file_path;
    if(willPurge){
      if(!confirm('Označiť vyúčtovaciu faktúru ako UHRADENÚ?\n\nPo úhrade sa PDF odstráni z úložiska a uvoľní sa miesto. Zostane záznam faktúry, suma a zadané údaje. Tento krok je nevratný.')) return;
    }
    var res=await sbc.rpc('mark_document_paid',{ p_id:id, p_paid:paid });
    if(res.error){ alert('Nepodarilo sa zmeniť stav úhrady: '+res.error.message); return; }
    if(d){ d.status=paid?'paid':'unpaid'; }
    // PRAVIDLO: uhradená vyúčtovacia faktúra → vymaž PDF a uvoľni priestor; zostáva len záznam + suma
    if(willPurge){
      try{ await sbc.storage.from('invoices').remove([d.file_path]); }catch(e){}
      try{ await sbc.from('documents').update({file_path:null}).eq('id',id); }catch(e){}
      d.file_path=null;
    }
    docsRender();
    toast(paid ? (willPurge ? 'Uhradené ✓ · PDF odstránené, miesto uvoľnené' : 'Označené ako uhradené ✓') : 'Označené ako neuhradené');
  };
  window.docDelete = async function(id){
    if(!confirm('Zmazať tento dokument?')) return;
    var d=docCache.find(function(x){return x.id===id;});
    if(d && d.type==='final_invoice' && d.file_path){ try{ await sbc.storage.from('invoices').remove([d.file_path]); }catch(e){} }
    var res=await sbc.from('documents').delete().eq('id',id);
    if(res.error){ alert(res.error.message); return; }
    docCache=docCache.filter(function(x){return x.id!==id;}); docsRender();
  };
  window.docUploadFinal=function(){
    if(!(myRole==='admin'||myRole==='sales'||myRole==='finance'||myRole==='revenue')){ alert('Nemáte oprávnenie.'); return; }
    ['fuFile','fuClient','fuNum','fuAmount','fuDue'].forEach(function(i){ var el=document.getElementById(i); if(el) el.value=''; });
    document.getElementById('fuMsg').textContent='';
    document.getElementById('finUpload').classList.add('open');
  };
  window.docUploadSubmit=async function(){
    var fileEl=document.getElementById('fuFile'), msg=document.getElementById('fuMsg'), btn=document.getElementById('fuSaveBtn');
    msg.style.color='#b00020';
    var file=fileEl.files && fileEl.files[0];
    if(!file){ msg.textContent='Vyber PDF súbor.'; return; }
    if((file.type && file.type.indexOf('pdf')<0) && !/\.pdf$/i.test(file.name||'')){ msg.textContent='Súbor musí byť PDF.'; return; }
    if(file.size > 15*1024*1024){ msg.textContent='Súbor je príliš veľký (max 15 MB).'; return; }
    var client=document.getElementById('fuClient').value.trim();
    var num=document.getElementById('fuNum').value.trim();
    var amountRaw=document.getElementById('fuAmount').value.trim().replace(/\s/g,'').replace(',','.');
    var amount=amountRaw?parseFloat(amountRaw):null; if(amount!=null && !isFinite(amount)) amount=null;
    var due=document.getElementById('fuDue').value||null;
    btn.disabled=true; msg.style.color='#5f5848'; msg.textContent='Nahrávam…';
    try{
      var safe=(file.name||'faktura.pdf').replace(/[^a-zA-Z0-9._-]/g,'_');
      var path='final/'+Date.now()+'_'+safe;
      var up=await sbc.storage.from('invoices').upload(path, file, {contentType:'application/pdf', upsert:false});
      if(up.error){ msg.style.color='#b00020'; msg.textContent='Nahranie zlyhalo: '+up.error.message; btn.disabled=false; return; }
      var ins=await sbc.from('documents').insert({ type:'final_invoice', title:(num?('Vyúčt. faktúra '+num):(client||'Vyúčtovacia faktúra')), client:client||null, doc_number:num||null, amount:amount, due_date:due, file_path:path, status:'unpaid' }).select('id').single();
      if(ins.error){ msg.style.color='#b00020'; msg.textContent='Uloženie zlyhalo: '+ins.error.message; btn.disabled=false; return; }
      document.getElementById('finUpload').classList.remove('open');
      toast('Faktúra nahraná ✓');
      showDocs('final_invoice');
    }catch(e){ msg.style.color='#b00020'; msg.textContent=String(e); }
    btn.disabled=false;
  };
  window.docOpenFinal=async function(id){
    var d=docCache.find(function(x){return x.id===id;}); if(!d) return;
    if(!d.file_path){ alert(d.status==='paid' ? 'PDF bolo po úhrade odstránené (uvoľnenie miesta). Zostal len záznam faktúry a suma.' : 'K tejto faktúre nie je priložené PDF.'); return; }
    var s=await sbc.storage.from('invoices').createSignedUrl(d.file_path, 3600);
    if(s.error || !s.data || !s.data.signedUrl){ alert('Nepodarilo sa otvoriť PDF: '+((s.error&&s.error.message)||'')); return; }
    window.open(s.data.signedUrl,'_blank');
  };

  /* ---------- ADMIN: tvorba používateľov ---------- */
  window.showAdmin = async function(){
    if(myRole!=='admin'){ alert('Len administrátor.'); return; }
    var m=document.getElementById('auMsg'); m.textContent=''; m.className='msg';
    document.getElementById('auEmail').value=''; document.getElementById('auPwd').value='';
    document.getElementById('auSaveBtn').disabled=false;
    document.getElementById('adminPanel').classList.add('open');
    adminLoadUsers();
  };
  window.hideAdmin = function(){ document.getElementById('adminPanel').classList.remove('open'); };
  var ROLE_OPTS=[['sales','Sales'],['finance','Financie'],['revenue','Revenue'],['admin','Admin']];
  async function adminLoadUsers(){
    var box=document.getElementById('auList'); if(!box) return;
    box.innerHTML='<div style="font-size:12px;color:#999;padding:8px 0">Načítavam používateľov…</div>';
    var meId=null; try{ var gu=await sbc.auth.getUser(); meId=(gu&&gu.data&&gu.data.user)?gu.data.user.id:null; }catch(e){}
    var r=await sbc.functions.invoke('admin-users',{ body:{ action:'list' } });
    var err=null, data=null;
    if(r.error){ try{ err=(await r.error.context.json()).error; }catch(e){ err=r.error.message; } } else { data=r.data; if(data&&data.error) err=data.error; }
    if(err){ box.innerHTML='<div class="msg err" style="padding:8px 0">'+esc(err)+'</div>'; return; }
    var users=(data&&data.users)||[];
    var html='<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:8px 0 2px;">Používatelia ('+users.length+')</div>';
    users.forEach(function(u){
      var isMe=(u.id===meId);
      var sel='<select onchange="adminSetRole(\''+u.id+'\',this.value)">'+ROLE_OPTS.map(function(o){ return '<option value="'+o[0]+'"'+(u.role===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>';
      var last=u.last_sign_in_at?('posl. prihlásenie '+new Date(u.last_sign_in_at).toLocaleDateString('sk-SK')):'nikdy neprihlásený';
      html+='<div class="urow'+(isMe?' me':'')+'"><div class="em">'+esc(u.email||'—')+(isMe?' (vy)':'')+'<small>'+last+'</small></div>'+sel
        +'<button class="ub" onclick="adminResetPwd(\''+u.id+'\',\''+esc(u.email||'')+'\')">Reset hesla</button>'
        +(isMe?'':'<button class="ub del" onclick="adminDeleteUser(\''+u.id+'\',\''+esc(u.email||'')+'\')">Zmazať</button>')
        +'</div>';
    });
    box.innerHTML=html;
  }
  window.adminSetRole=async function(id,role){
    var r=await sbc.functions.invoke('admin-users',{ body:{ action:'set_role', user_id:id, role:role } });
    var err=null; if(r.error){ try{ err=(await r.error.context.json()).error; }catch(e){ err=r.error.message; } } else if(r.data&&r.data.error){ err=r.data.error; }
    if(err){ alert(err); adminLoadUsers(); return; }
    toast('Rola zmenená na: '+role);
  };
  window.adminResetPwd=async function(id,email){
    var pwd=prompt('Nové heslo pre '+email+' (min. 6 znakov):',''); if(pwd===null) return;
    if((pwd||'').length<6){ alert('Heslo musí mať aspoň 6 znakov.'); return; }
    var r=await sbc.functions.invoke('admin-users',{ body:{ action:'reset_password', user_id:id, password:pwd } });
    var err=null; if(r.error){ try{ err=(await r.error.context.json()).error; }catch(e){ err=r.error.message; } } else if(r.data&&r.data.error){ err=r.data.error; }
    if(err){ alert(err); return; }
    toast('Heslo resetované pre '+email);
  };
  window.adminDeleteUser=async function(id,email){
    if(!confirm('Zmazať používateľa '+email+'?\n\nTento krok je nezvratný a zruší mu prístup.')) return;
    var r=await sbc.functions.invoke('admin-users',{ body:{ action:'delete', user_id:id } });
    var err=null; if(r.error){ try{ err=(await r.error.context.json()).error; }catch(e){ err=r.error.message; } } else if(r.data&&r.data.error){ err=r.data.error; }
    if(err){ alert(err); return; }
    toast('Používateľ zmazaný'); adminLoadUsers();
  };
  window.adminCreateUser = async function(){
    var email=document.getElementById('auEmail').value.trim();
    var pwd=document.getElementById('auPwd').value;
    var role=document.getElementById('auRole').value;
    var msg=document.getElementById('auMsg'); var btn=document.getElementById('auSaveBtn');
    msg.textContent=''; msg.className='msg';
    if(!email||email.indexOf('@')<1){ msg.className='msg err'; msg.textContent='Zadajte platný e-mail.'; return; }
    if(pwd.length<6){ msg.className='msg err'; msg.textContent='Heslo musí mať aspoň 6 znakov.'; return; }
    btn.disabled=true;
    try{
      var r=await sbc.functions.invoke('admin-create-user',{ body:{ email:email, password:pwd, role:role } });
      var errTxt=null;
      if(r.error){ try{ errTxt=(await r.error.context.json()).error; }catch(e){ errTxt=r.error.message; } }
      else if(r.data && r.data.error){ errTxt=r.data.error; }
      if(errTxt){ msg.className='msg err'; msg.textContent=errTxt; btn.disabled=false; return; }
      msg.className='msg ok'; msg.textContent='Používateľ '+email+' vytvorený ('+role+').';
      document.getElementById('auEmail').value=''; document.getElementById('auPwd').value='';
      adminLoadUsers();
    }catch(e){ msg.className='msg err'; msg.textContent=String(e); }
    btn.disabled=false;
  };

  /* ---------- DASHBOARD (Prehľad) ---------- */
  var dashCache={offers:[],documents:[],subs:0};
  function eur(n){ return Number(n||0).toLocaleString('sk-SK',{maximumFractionDigits:0})+' €'; }
  window.showDashboard = async function(){
    document.getElementById('dashView').classList.add('open');
    try{ document.getElementById('view-selector').style.display='none'; document.getElementById('view-offer').style.display='none'; }catch(e){}
    var email=((document.getElementById('cloudUser').textContent)||'').split('·')[0].trim();
    document.getElementById('dashGreet').textContent='Dobrý deň'+(email?(', '+email.split('@')[0]):'');
    var of=await sbc.from('offers').select('id,title,client,status,amount,event_date,follow_up_date,template,updated_at').order('updated_at',{ascending:false});
    var dc=await sbc.from('documents').select('id,type,title,client,amount,status,due_date,deal_id,created_at').order('created_at',{ascending:false});
    var dl=await sbc.from('deals').select('id,title,client,event_date,status').order('updated_at',{ascending:false});
    var ns=await sbc.from('newsletter_subscribers').select('id',{count:'exact',head:true});
    dashCache.offers=((of&&of.data)||[]).filter(function(o){return o.status!=='cancelled';}); dashCache.documents=(dc&&dc.data)||[]; dashCache.deals=(dl&&dl.data)||[]; dashCache.subs=(ns&&ns.count)||0;
    try{ var vs=await sbc.from('offer_view_stats').select('offer_id,views,last_viewed'); var vm={}; (vs.data||[]).forEach(function(r){ vm[r.offer_id]=r; }); dashCache.offers.forEach(function(o){ if(vm[o.id]){ o._views=vm[o.id].views; o._lastView=vm[o.id].last_viewed; } }); }catch(e){}
    dashRender();
  };
  function dashRender(){
    var offers=dashCache.offers, docs=dashCache.documents;
    var byStatus={draft:0,sent:0,confirmed:0}, pipeline={draft:0,sent:0,confirmed:0};
    offers.forEach(function(o){ var s=o.status||'draft'; if(byStatus[s]==null){byStatus[s]=0;pipeline[s]=0;} byStatus[s]++; pipeline[s]+=Number(o.amount||0); });
    var total=offers.length, confirmed=byStatus.confirmed||0, conv=total?Math.round(confirmed/total*100):0;
    var today=new Date(); today.setHours(0,0,0,0);
    var contracts=docs.filter(function(d){return d.type==='contract';});
    var deposits=docs.filter(function(d){return d.type==='deposit_invoice';});
    var unpaid=deposits.filter(function(d){return d.status!=='paid';});
    var unpaidSum=unpaid.reduce(function(a,d){return a+Number(d.amount||0);},0);
    var overdue=unpaid.filter(function(d){return d.due_date && new Date(d.due_date)<today;});
    var finals=docs.filter(function(d){return d.type==='final_invoice';});
    var finalsUnpaid=finals.filter(function(d){return d.status!=='paid';});
    var finalsUnpaidSum=finalsUnpaid.reduce(function(a,d){return a+Number(d.amount||0);},0);
    var finalsOverdue=finalsUnpaid.filter(function(d){return d.due_date && new Date(d.due_date)<today;});
    var finalsOverdueSum=finalsOverdue.reduce(function(a,d){return a+Number(d.amount||0);},0);
    var contractedSum=contracts.reduce(function(a,d){return a+Number(d.amount||0);},0);
    var fups=offers.filter(function(o){return o.follow_up_date;});
    var fupsDue=fups.filter(function(o){return new Date(o.follow_up_date)<=today;});
    var kpis=[
      {lbl:'Ponuky spolu', val:total, hint:(byStatus.draft||0)+' rozprac. · '+(byStatus.sent||0)+' odoslané', cls:''},
      {lbl:'Potvrdené', val:confirmed, hint:'konverzia '+conv+' %', cls:'accent'},
      {lbl:'Zazmluvnená hodnota', val:eur(contractedSum), hint:contracts.length+' zmlúv', cls:''},
      {lbl:'Nezaplatené depozity', val:unpaid.length, hint:eur(unpaidSum)+' čaká'+(overdue.length?(' · '+overdue.length+' po termíne'):''), cls:(overdue.length?'warn':'')},
      {lbl:'Neuhradené vyúčt. faktúry', val:eur(finalsUnpaidSum), hint:finalsUnpaid.length+' ks'+(finalsOverdue.length?(' · '+finalsOverdue.length+' po termíne'):' čaká'), cls:(finalsOverdue.length?'warn':'')},
      {lbl:'Follow-upy dnes', val:fupsDue.length, hint:fups.length+' naplánovaných', cls:(fupsDue.length?'warn':'')},
      {lbl:'Newsletter', val:dashCache.subs, hint:'odberateľov', cls:''}
    ];
    document.getElementById('dashKpis').innerHTML=kpis.map(function(k){ return '<div class="kpi '+k.cls+'"><div class="lbl">'+k.lbl+'</div><div class="val">'+k.val+'</div><div class="hint">'+k.hint+'</div></div>'; }).join('');
    var up=offers.filter(function(o){ return o.event_date && new Date(o.event_date)>=today; }).sort(function(a,b){return new Date(a.event_date)-new Date(b.event_date);}).slice(0,6);
    document.getElementById('dashUpcoming').innerHTML=up.length?up.map(function(o){ var dt=new Date(o.event_date).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'}); return '<div class="li"><span class="t" style="cursor:pointer" onclick="dashOpenOffer(\''+o.id+'\')">'+esc(o.client||o.title||'—')+'</span><span class="muted">'+dt+'</span></div>'; }).join(''):'<div class="empty">Žiadne nadchádzajúce podujatia s dátumom.</div>';
    var depSorted=unpaid.slice().sort(function(a,b){ var ao=a.due_date&&new Date(a.due_date)<today?0:1, bo=b.due_date&&new Date(b.due_date)<today?0:1; if(ao!==bo) return ao-bo; return (a.due_date||'9999')<(b.due_date||'9999')?-1:1; });
    document.getElementById('dashDeposits').innerHTML=unpaid.length?depSorted.slice(0,6).map(function(d){ var ov=d.due_date&&new Date(d.due_date)<today; var due=d.due_date?('<span class="muted">spl. '+new Date(d.due_date).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit'})+'</span> '):''; return '<div class="li"><span>'+esc(d.client||d.title||'—')+' '+due+'</span><span class="pill '+(ov?'unpaid':'unpaid')+'" style="'+(ov?'background:#f6dede;color:#9a3b3b':'')+'">'+(ov?'po termíne · ':'')+(d.amount!=null?eur(d.amount):'neuhr.')+'</span></div>'; }).join(''):'<div class="empty">Všetky depozity uhradené 🎉</div>';
    var fupSorted=fups.slice().sort(function(a,b){return new Date(a.follow_up_date)-new Date(b.follow_up_date);});
    document.getElementById('dashFollowups').innerHTML=fupSorted.length?fupSorted.slice(0,8).map(function(o){ var fd=new Date(o.follow_up_date); var ov=fd<=today; var dt=fd.toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'}); return '<div class="li"><span class="t" style="cursor:pointer" onclick="dashOpenOffer(\''+o.id+'\')">'+(ov?'🔴 ':'⏰ ')+esc(o.client||o.title||'—')+'</span><span class="muted" style="'+(ov?'color:#9a3b3b;font-weight:600':'')+'">'+dt+'</span></div>'; }).join(''):'<div class="empty">Žiadne naplánované follow-upy. Nastavíš ich v „Moje ponuky".</div>';
    var viewed=offers.filter(function(o){return o._views;}).sort(function(a,b){return new Date(b._lastView)-new Date(a._lastView);});
    document.getElementById('dashViewed').innerHTML=viewed.length?viewed.slice(0,8).map(function(o){ var hot=(o.status==='sent'||o.status==='draft'); var lv=new Date(o._lastView).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'}); return '<div class="li"><span class="t" style="cursor:pointer" onclick="dashOpenOffer(\''+o.id+'\')">'+(hot?'🔥 ':'👁 ')+esc(o.client||o.title||'—')+'</span><span class="muted">'+o._views+'× otvorené · '+lv+'</span></div>'; }).join(''):'<div class="empty">Zatiaľ nikto neotvoril zdieľanú ponuku. Pošli klientovi link cez „Zdieľať".</div>';
    var soon=new Date(today); soon.setDate(soon.getDate()+3);
    var deals=dashCache.deals||[];
    var contractDealIds={}; docs.forEach(function(x){ if(x.type==='contract'&&x.deal_id) contractDealIds[x.deal_id]=true; });
    var approvedNoContract=deals.filter(function(dl){ return dl.status==='approved' && !contractDealIds[dl.id]; });
    function evSoon(arr){ return arr.filter(function(x){ if(!x.event_date) return false; var d=new Date(x.event_date); return d>=today && d<=soon; }); }
    var evCount=evSoon(deals).length+evSoon(offers).length;
    var alerts=[];
    if(overdue.length) alerts.push({ic:'🔴',txt:overdue.length+'× záloha po splatnosti ('+eur(overdue.reduce(function(a,d){return a+Number(d.amount||0);},0))+')',go:"showDocs('deposit_invoice')"});
    if(finalsOverdue.length) alerts.push({ic:'🔴',txt:finalsOverdue.length+'× vyúčt. faktúra po splatnosti ('+eur(finalsOverdueSum)+')',go:"showDocs('final_invoice')"});
    if(approvedNoContract.length) alerts.push({ic:'📝',txt:approvedNoContract.length+'× schválená akcia bez zmluvy',go:"showDeals()"});
    if(evCount) alerts.push({ic:'📅',txt:evCount+'× podujatie do 3 dní',go:"showCalendar()"});
    if(fupsDue.length) alerts.push({ic:'⏰',txt:fupsDue.length+'× follow-up po termíne',go:"cloudList()"});
    var ac=document.getElementById('dashAlertsCard');
    if(alerts.length){ ac.style.display=''; document.getElementById('dashAlerts').innerHTML=alerts.map(function(a){ return '<div class="li" style="cursor:pointer" onclick="'+a.go+'"><span>'+a.ic+' '+esc(a.txt)+'</span><span class="muted">otvoriť ›</span></div>'; }).join(''); }
    else { ac.style.display='none'; }
    var maxv=Math.max(pipeline.draft,pipeline.sent,pipeline.confirmed,1);
    var pal={draft:'#caa84e',sent:'#5a8fc4',confirmed:'#5aa86a'}, lab={draft:'Rozpracované',sent:'Odoslané',confirmed:'Potvrdené'};
    document.getElementById('dashPipeline').innerHTML=['draft','sent','confirmed'].map(function(s){ return '<div class="bar"><span style="width:96px;color:#7a7260">'+lab[s]+'</span><div class="track"><div class="fill" style="width:'+Math.round(pipeline[s]/maxv*100)+'%;background:'+pal[s]+'"></div></div><span style="width:96px;text-align:right;color:#5f5848">'+eur(pipeline[s])+'</span></div>'; }).join('');
    var recent=offers.slice(0,6);
    document.getElementById('dashRecent').innerHTML=recent.length?recent.map(function(o){ var dt=new Date(o.updated_at).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit'}); var s=o.status||'draft'; return '<div class="li"><span class="t" style="cursor:pointer" onclick="dashOpenOffer(\''+o.id+'\')">'+esc(o.title||o.client||'Ponuka')+'</span><span><span class="pill '+s+'">'+({draft:'Rozprac.',sent:'Odoslané',confirmed:'Potvrdené'}[s]||s)+'</span> <span class="muted">'+dt+'</span></span></div>'; }).join(''):'<div class="empty">Zatiaľ žiadne ponuky.</div>';
  }
  window.dashNewOffer=function(){ document.getElementById('dashView').classList.remove('open'); try{ showSelector(); }catch(e){ try{document.getElementById('view-selector').style.display='block';}catch(_){} } };
  window.dashOpenOffer=function(id){ document.getElementById('dashView').classList.remove('open'); cloudOpen(id); };
  window.dashRefresh=function(){
    try{
      if(dashCache && Array.isArray(dashCache.documents) && Array.isArray(docCache)){
        var byId={}; docCache.forEach(function(x){ byId[x.id]=x; });
        dashCache.documents.forEach(function(d,i){
          var u=byId[d.id]; if(!u) return;
          if(u.amount!==undefined) dashCache.documents[i].amount=u.amount;
          if(u.status!==undefined) dashCache.documents[i].status=u.status;
          if(u.due_date!==undefined) dashCache.documents[i].due_date=u.due_date;
        });
      }
      if(typeof dashRender==='function'){ dashRender(); }
    }catch(e){}
  };

  /* ---------- KLIENTSKE PRIEČINKY ---------- */
  window.showFolders = async function(){
    if(!dashCache.offers.length && !dashCache.documents.length){
      var of=await sbc.from('offers').select('id,title,client,status,amount,event_date,updated_at').order('updated_at',{ascending:false});
      var dc=await sbc.from('documents').select('id,type,title,client,amount,status,created_at').order('created_at',{ascending:false});
      dashCache.offers=((of&&of.data)||[]).filter(function(o){return o.status!=='cancelled';}); dashCache.documents=(dc&&dc.data)||[];
    }
    foldersRender();
    document.getElementById('foldersPanel').style.display='block';
  };
  window.foldersRender = function(){
    var q=(document.getElementById('folderSearch').value||'').toLowerCase();
    var map={};
    function key(c){ return (c&&c.trim())?c.trim():'Bez klienta'; }
    dashCache.offers.forEach(function(o){ var k=key(o.client); (map[k]=map[k]||{offers:[],docs:[]}).offers.push(o); });
    dashCache.documents.forEach(function(d){ var k=key(d.client); (map[k]=map[k]||{offers:[],docs:[]}).docs.push(d); });
    var names=Object.keys(map).sort(), html='';
    names.forEach(function(n){
      if(q && n.toLowerCase().indexOf(q)<0) return;
      var f=map[n], cnt=f.offers.length+f.docs.length;
      var unpaid=f.docs.filter(function(d){return d.type==='deposit_invoice'&&d.status!=='paid';}).length;
      html+='<div class="folder"><div class="fhead" onclick="this.parentNode.classList.toggle(\'open\')">'
        +'<span class="fname">📁 '+esc(n)+(unpaid?(' <span class="mini unpaid">'+unpaid+' nezapl.</span>'):'')+'</span>'
        +'<span class="fcount">'+cnt+' položiek</span></div><div class="fitems">';
      f.offers.forEach(function(o){ html+='<div class="fitem"><span class="t" onclick="dashOpenOffer(\''+o.id+'\')"><span class="ic offer">Ponuka</span>'+esc(o.title||'—')+'</span><span style="font-size:11px;color:#a59b85">'+esc(o.status||'')+'</span></div>'; });
      f.docs.forEach(function(d){ html+='<div class="fitem"><span class="t" onclick="docOpen(\''+d.id+'\')"><span class="ic '+d.type+'">'+(d.type==='contract'?'Zmluva':'Depozit')+'</span>'+esc(d.title||'Dokument')+'</span>'+(d.type==='deposit_invoice'?('<span class="mini '+(d.status==='paid'?'paid':'unpaid')+'">'+(d.status==='paid'?'Uhr.':'Neuhr.')+'</span>'):'')+'</div>'; });
      html+='</div></div>';
    });
    document.getElementById('folderRows').innerHTML = html || '<div class="empty">Žiadni klienti.</div>';
  };

  /* ---------- MARKETINGOVÝ KALENDÁR ---------- */
  var calY=null, calM=null, calEvents=[], calBookings=[];
  var CAT={promo:{c:'#c87b3a',l:'Promo akcia'},guest:{c:'#5aa86a',l:'Pre hostí'},campaign:{c:'#5a8fc4',l:'Marketing / kampaň'},social:{c:'#7a5ad8',l:'Social (LinkedIn/IG)'},internal:{c:'#8a7caa',l:'Interné'},booking:{c:'#b8a06a',l:'Klientske podujatie'}};
  var PLAT={linkedin:{c:'#0a66c2',l:'LinkedIn'},instagram:{c:'#c13584',l:'Instagram'},facebook:{c:'#1877f2',l:'Facebook'},other:{c:'#7a5ad8',l:'Social'}};
  function evColor(e){ if(e.category==='social'){ var p=PLAT[e.platform]||PLAT.other; return p.c; } return (CAT[e.category]||CAT.promo).c; }
  function evPrefix(e){ if(e.category==='social'){ return ((PLAT[e.platform]||PLAT.other).l)+': '; } return e.time?(e.time+' '):''; }
  window.evtTogglePlatform=function(){ document.getElementById('evtPlatformRow').style.display = (document.getElementById('evtCat').value==='social')?'':'none'; };
  window.evtToggleRecur=function(){ var v=document.getElementById('evtRecur').value; document.getElementById('evtUntilRow').style.display=v?'':'none'; document.getElementById('evtRecurDays').style.display=(v==='custom')?'':'none'; };
  function addMonthsISO(iso,m){ var d=new Date(iso); d.setMonth(d.getMonth()+m); return isoD(d); }
  function expandRecur(startISO, untilISO, type, days){
    var out=[], s=new Date(startISO), u=new Date(untilISO); if(isNaN(s)||isNaN(u)||u<s) return out;
    if(type==='monthly'){ var dm=new Date(s); while(dm<=u){ out.push(isoD(dm)); dm.setMonth(dm.getMonth()+1); } return out; }
    var d=new Date(s);
    while(d<=u){
      var wd=d.getDay(), inc=false;
      if(type==='daily') inc=true;
      else if(type==='workdays') inc=(wd>=1&&wd<=5);
      else if(type==='weekly') inc=(wd===s.getDay());
      else if(type==='custom') inc=(days.indexOf(wd)>=0);
      if(inc) out.push(isoD(d));
      d.setDate(d.getDate()+1);
    }
    return out;
  }
  function isoD(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  window.showCalendar = async function(){
    if(calY==null){ var n=new Date(); calY=n.getFullYear(); calM=n.getMonth(); }
    document.getElementById('calView').classList.add('open');
    try{ document.getElementById('dashView').classList.remove('open'); document.getElementById('view-selector').style.display='none'; document.getElementById('view-offer').style.display='none'; }catch(e){}
    document.getElementById('calAddBtn').style.display=(myRole==='admin'||myRole==='sales'||myRole==='revenue')?'':'none';
    await calRender();
  };
  window.calPrev=function(){ calM--; if(calM<0){calM=11;calY--;} calRender(); };
  window.calNext=function(){ calM++; if(calM>11){calM=0;calY++;} calRender(); };
  window.calToday=function(){ var n=new Date(); calY=n.getFullYear(); calM=n.getMonth(); calRender(); };
  async function calRender(){
    var first=new Date(calY,calM,1);
    var months=['Január','Február','Marec','Apríl','Máj','Jún','Júl','August','September','Október','November','December'];
    document.getElementById('calLabel').textContent=months[calM]+' '+calY;
    var dow=(first.getDay()+6)%7;
    var gridStart=new Date(calY,calM,1-dow);
    var gridEnd=new Date(gridStart); gridEnd.setDate(gridStart.getDate()+41);
    var sISO=isoD(gridStart), eISO=isoD(gridEnd);
    try{ var ev=await sbc.from('calendar_events').select('id,title,category,platform,status,recur_group,start_date,end_date,time,location,note').lte('start_date',eISO);
      calEvents=(ev.data||[]).filter(function(e){ var en=e.end_date||e.start_date; return en>=sISO && e.start_date<=eISO; }); }catch(e){ calEvents=[]; }
    try{ var bk=await sbc.from('offers').select('id,client,title,event_date,status').gte('event_date',sISO).lte('event_date',eISO);
      calBookings=(bk.data||[]).filter(function(o){return o.event_date && o.status!=='cancelled';}); }catch(e){ calBookings=[]; }
    document.getElementById('calLegend').innerHTML=Object.keys(CAT).map(function(k){ return '<span class="lg"><span class="dot" style="background:'+CAT[k].c+'"></span>'+CAT[k].l+'</span>'; }).join('');
    function eventsOn(iso){ var list=[];
      calEvents.forEach(function(e){ var en=e.end_date||e.start_date; if(e.start_date<=iso && iso<=en) list.push({type:'evt',e:e}); });
      calBookings.forEach(function(o){ if(o.event_date===iso) list.push({type:'book',o:o}); });
      return list; }
    var todayISO=isoD(new Date()), html='';
    for(var i=0;i<42;i++){
      var d=new Date(gridStart); d.setDate(gridStart.getDate()+i);
      var iso=isoD(d), out=(d.getMonth()!==calM), evs=eventsOn(iso), chips='';
      evs.slice(0,4).forEach(function(it){
        if(it.type==='evt'){ var dn=(it.e.status==='done'); chips+='<div class="ev" style="background:'+evColor(it.e)+(dn?';opacity:.5':'')+'" onclick="event.stopPropagation();evtOpen(\''+it.e.id+'\')">'+(dn?'✓ ':'')+esc(evPrefix(it.e))+esc(it.e.title)+'</div>'; }
        else { chips+='<div class="ev" style="background:'+CAT.booking.c+'" onclick="event.stopPropagation();calOpenBooking(\''+it.o.id+'\')">'+esc(it.o.client||it.o.title||'Podujatie')+'</div>'; }
      });
      if(evs.length>4) chips+='<div class="more">+'+(evs.length-4)+' ďalšie</div>';
      html+='<div class="cell'+(out?' out':'')+(iso===todayISO?' today':'')+'" onclick="evtOpen(null,\''+iso+'\')"><span class="dn">'+d.getDate()+'</span>'+chips+'</div>';
    }
    document.getElementById('calGrid').innerHTML=html;
  }
  window.calOpenBooking=function(id){ document.getElementById('calView').classList.remove('open'); cloudOpen(id); };
  window.evtOpen=function(id, dateISO){
    if(myRole!=='admin' && myRole!=='sales' && myRole!=='revenue') return;
    document.getElementById('evtMsg').textContent='';
    if(id){
      var e=calEvents.find(function(x){return x.id===id;}); if(!e) return;
      document.getElementById('evtTitle').textContent='Upraviť akciu';
      document.getElementById('evtId').value=e.id;
      document.getElementById('evtName').value=e.title||'';
      document.getElementById('evtCat').value=e.category||'promo';
      document.getElementById('evtPlatform').value=e.platform||'linkedin';
      document.getElementById('evtStart').value=e.start_date||'';
      document.getElementById('evtEnd').value=e.end_date||'';
      document.getElementById('evtTime').value=e.time||'';
      document.getElementById('evtLoc').value=e.location||'';
      document.getElementById('evtNote').value=e.note||'';
      document.getElementById('evtDone').checked=(e.status==='done');
      window.__evtRecurGroup=e.recur_group||null;
      document.getElementById('evtDelBtn').style.display='';
    } else {
      document.getElementById('evtTitle').textContent='Nová akcia';
      document.getElementById('evtId').value='';
      document.getElementById('evtName').value='';
      document.getElementById('evtCat').value='promo';
      document.getElementById('evtPlatform').value='linkedin';
      document.getElementById('evtStart').value=dateISO||isoD(new Date());
      document.getElementById('evtEnd').value='';
      document.getElementById('evtTime').value=''; document.getElementById('evtLoc').value=''; document.getElementById('evtNote').value='';
      document.getElementById('evtDone').checked=false;
      window.__evtRecurGroup=null;
      document.getElementById('evtDelBtn').style.display='none';
    }
    var editing=!!document.getElementById('evtId').value;
    document.getElementById('evtRecur').value=''; document.getElementById('evtRecur').disabled=editing;
    document.getElementById('evtUntil').value='';
    Array.prototype.forEach.call(document.querySelectorAll('#evtRecurDays .rd'),function(s){s.classList.remove('on');});
    evtToggleRecur();
    evtTogglePlatform();
    document.getElementById('evtModal').classList.add('open');
    document.getElementById('evtName').focus();
  };
  window.hideEvt=function(){ document.getElementById('evtModal').classList.remove('open'); };
  window.evtSave=async function(){
    var id=document.getElementById('evtId').value;
    var row={ title:document.getElementById('evtName').value.trim(), category:document.getElementById('evtCat').value,
      platform:(document.getElementById('evtCat').value==='social'?document.getElementById('evtPlatform').value:null),
      start_date:document.getElementById('evtStart').value||null, end_date:document.getElementById('evtEnd').value||null,
      time:document.getElementById('evtTime').value.trim()||null, location:document.getElementById('evtLoc').value.trim()||null, note:document.getElementById('evtNote').value.trim()||null,
      status:(document.getElementById('evtDone').checked?'done':'planned') };
    var msg=document.getElementById('evtMsg');
    if(!row.title){ msg.textContent='Zadajte názov akcie.'; return; }
    if(!row.start_date){ msg.textContent='Zadajte dátum (Od).'; return; }
    if(row.end_date && row.end_date<row.start_date){ msg.textContent='„Do" nemôže byť pred „Od".'; return; }
    var recur=document.getElementById('evtRecur').value;
    if(!id && recur){
      var until=document.getElementById('evtUntil').value||addMonthsISO(row.start_date,3);
      var days=[]; Array.prototype.forEach.call(document.querySelectorAll('#evtRecurDays .rd.on'),function(s){ days.push(parseInt(s.getAttribute('data-d'),10)); });
      if(recur==='custom' && !days.length){ msg.textContent='Vyber aspoň jeden deň v týždni.'; return; }
      var dates=expandRecur(row.start_date, until, recur, days);
      if(dates.length>366) dates=dates.slice(0,366);
      if(!dates.length){ msg.textContent='Pre zvolené opakovanie nevychádza žiadny termín.'; return; }
      var gid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(''+Date.now()+Math.random());
      var rrows=dates.map(function(ds){ var rr={}; for(var k in row) rr[k]=row[k]; rr.start_date=ds; rr.end_date=null; rr.recur_group=gid; return rr; });
      var resR=await sbc.from('calendar_events').insert(rrows);
      if(resR.error){ msg.textContent=resR.error.message; return; }
      hideEvt(); toast('Séria '+rrows.length+' akcií uložená ✓'); calRender(); return;
    }
    var res = id ? await sbc.from('calendar_events').update(row).eq('id',id) : await sbc.from('calendar_events').insert(row);
    if(res.error){ msg.textContent=res.error.message; return; }
    hideEvt(); toast('Akcia uložená ✓'); calRender();
  };
  window.evtDelete=async function(){
    var id=document.getElementById('evtId').value; if(!id) return;
    var grp=window.__evtRecurGroup, delAll=false;
    if(grp){ delAll=confirm('Toto je opakovaná akcia.\n\nOK = zmazať CELÚ sériu\nZrušiť = zmazať len túto jednu'); }
    else { if(!confirm('Zmazať túto akciu?')) return; }
    var res = (grp && delAll) ? await sbc.from('calendar_events').delete().eq('recur_group',grp) : await sbc.from('calendar_events').delete().eq('id',id);
    if(res.error){ document.getElementById('evtMsg').textContent=res.error.message; return; }
    hideEvt(); toast(delAll?'Séria zmazaná':'Akcia zmazaná'); calRender();
  };

  /* ---------- AI ASISTENT DOPYTU ---------- */
  window.showInquiry = async function(){
    if(myRole!=='admin' && myRole!=='sales' && myRole!=='revenue'){ alert('Asistent je dostupný pre obchod/admin.'); return; }
    document.getElementById('aiPanel').style.display='block';
    try{ var r=await sbc.from('app_settings').select('value').eq('key','pricelist').maybeSingle(); if(r&&r.data) document.getElementById('aiPricelist').value=r.data.value||''; }catch(e){}
  };
  window.aiSavePricelist = async function(){
    var v=document.getElementById('aiPricelist').value;
    var res=await sbc.from('app_settings').upsert({key:'pricelist', value:v, updated_at:new Date().toISOString()});
    if(res.error){ alert(res.error.message); return; } toast('Cenník uložený ✓');
  };
  window.aiGenerate = async function(){
    var inquiry=document.getElementById('aiInquiry').value.trim();
    if(!inquiry){ alert('Vlož dopyt klienta.'); return; }
    var btn=document.getElementById('aiGenBtn'); var old=btn.textContent; btn.disabled=true; btn.textContent='Generujem…';
    document.getElementById('aiResult').innerHTML='<div class="aiload">AI pripravuje kalkuláciu a e-mail… (pár sekúnd)</div>';
    try{
      var pricelist=document.getElementById('aiPricelist').value||'';
      var r=await sbc.functions.invoke('inquiry-assist',{ body:{ inquiry:inquiry, pricelist:pricelist } });
      var err=null, data=null;
      if(r.error){ try{ err=(await r.error.context.json()).error; }catch(e){ err=r.error.message; } }
      else { data=r.data; if(data && data.error) err=data.error; }
      if(err){ document.getElementById('aiResult').innerHTML='<div class="aierr">'+esc(err)+'</div>'; }
      else { aiRender(data||{}); }
    }catch(e){ document.getElementById('aiResult').innerHTML='<div class="aierr">'+esc(String(e))+'</div>'; }
    btn.disabled=false; btn.textContent=old;
  };
  function aiRender(d){
    if(d.raw){ document.getElementById('aiResult').innerHTML='<label>Výstup AI</label><textarea rows="14">'+esc(d.raw)+'</textarea>'; return; }
    window.__aiCalc=d;
    var rows=(d.calc||[]).map(function(c){ return '<tr><td>'+esc(c.item||'')+(c.estimate?' <span class="est">odhad</span>':'')+'</td><td style="text-align:right">'+(c.qty!=null?c.qty:'')+(c.unit?(' '+esc(c.unit)):'')+'</td><td style="text-align:right">'+(c.unitPrice!=null?eur(c.unitPrice):'')+'</td><td style="text-align:right">'+(c.total!=null?eur(c.total):'')+'</td></tr>'; }).join('');
    var html='';
    if(d.summary) html+='<div class="aisum">'+esc(d.summary)+'</div>';
    html+='<label>Kalkulácia</label><table class="aitab"><thead><tr><th>Položka</th><th style="text-align:right">Množstvo</th><th style="text-align:right">Cena/j.</th><th style="text-align:right">Spolu</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4">—</td></tr>')+'</tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:600">Spolu</td><td style="text-align:right;font-weight:600">'+(d.grandTotal!=null?eur(d.grandTotal):'')+'</td></tr></tfoot></table>';
    html+='<div class="airow"><button class="mini" onclick="aiCopyCalc()">Kopírovať kalkuláciu</button></div>';
    html+='<label>Sprievodný e-mail</label><textarea id="aiEmail" rows="13">'+esc(d.email||'')+'</textarea>';
    html+='<div class="airow"><button class="mini" onclick="aiCopyEmail()">Kopírovať e-mail</button></div>';
    html+='<div class="airow" style="font-size:11px;color:#a59b85">Tip: kalkuláciu aj text si môžeš upraviť pred odoslaním. Ceny označené „odhad" over podľa cenníka.</div>';
    document.getElementById('aiResult').innerHTML=html;
  }
  window.aiCopyEmail=function(){ var t=(document.getElementById('aiEmail')||{}).value||''; navigator.clipboard.writeText(t).then(function(){toast('E-mail skopírovaný ✓');},function(){prompt('Skopírujte e-mail:',t);}); };
  window.aiCopyCalc=function(){ var d=window.__aiCalc||{}; var lines=(d.calc||[]).map(function(c){ return (c.item||'')+'\t'+(c.qty!=null?c.qty:'')+' '+(c.unit||'')+'\t'+(c.unitPrice!=null?(c.unitPrice+' €'):'')+'\t'+(c.total!=null?(c.total+' €'):''); }); lines.unshift('Položka\tMnožstvo\tCena/j.\tSpolu'); lines.push('Spolu\t\t\t'+(d.grandTotal!=null?(d.grandTotal+' €'):'')); var t=lines.join('\n'); navigator.clipboard.writeText(t).then(function(){toast('Kalkulácia skopírovaná ✓');},function(){prompt('Skopírujte kalkuláciu:',t);}); };

  /* ---------- AKCIE (workflow) ---------- */
  var DST={dopyt:{l:'Dopyt',c:'#9a917d'},offer_draft:{l:'Rozpracovaná ponuka',c:'#caa84e'},offer_sent:{l:'Ponuka odoslaná',c:'#5a8fc4'},approved:{l:'Schválené',c:'#4a86c8'},contract_signed:{l:'Zmluva podpísaná',c:'#7a6ac4'},deposit_paid:{l:'Záloha uhradená',c:'#3a9b6a'},realized:{l:'Realizované',c:'#2a7b4a'},closed:{l:'Ukončené',c:'#5f5848'},cancelled:{l:'Zrušené',c:'#b06a6a'}};
  var dealCache=[], curDeal=null;
  window.showDeals=async function(){
    var res=await sbc.from('deals').select('id,title,client,event_date,status,updated_at').order('updated_at',{ascending:false});
    if(res.error){ alert(res.error.message); return; }
    dealCache=res.data||[]; dealsRender();
    try{ document.getElementById('dealView').classList.remove('open'); }catch(e){}
    document.getElementById('dealsPanel').style.display='block';
  };
  window.dealsRender=function(){
    var q=(document.getElementById('dealSearch').value||'').toLowerCase();
    var fs=document.getElementById('dealFilterStatus').value, html='';
    dealCache.forEach(function(d){
      if(fs && d.status!==fs) return;
      if(q && (((d.title||'')+' '+(d.client||'')).toLowerCase().indexOf(q)<0)) return;
      var st=DST[d.status]||DST.dopyt;
      var dt=d.event_date?new Date(d.event_date).toLocaleDateString('sk-SK',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
      html+='<div class="drow2" onclick="openDeal(\''+d.id+'\')"><div style="flex:1"><div class="nm">'+esc(d.title||d.client||'Akcia')+'</div><div class="mt">'+esc(d.client||'')+' · '+dt+'</div></div><span class="dst" style="background:'+st.c+'">'+st.l+'</span></div>';
    });
    document.getElementById('dealRows').innerHTML=html||'<div class="empty">Žiadne akcie. Vytvor novú, alebo pri ponuke klikni „→ Akcia".</div>';
  };
  window.newDeal=async function(){
    var res=await sbc.from('deals').insert({title:'Nová akcia',status:'dopyt'}).select('id').single();
    if(res.error){ alert(res.error.message); return; }
    openDeal(res.data.id);
  };
  window.createDealFromOffer=async function(offerId){
    var of=await sbc.from('offers').select('id,title,client,event_date,deal_id').eq('id',offerId).single();
    if(of.error){ alert(of.error.message); return; }
    if(of.data.deal_id){ openDeal(of.data.deal_id); return; }
    var ins=await sbc.from('deals').insert({title:of.data.title||of.data.client||'Akcia', client:of.data.client, event_date:of.data.event_date||null, status:'offer_draft'}).select('id').single();
    if(ins.error){ alert(ins.error.message); return; }
    await sbc.from('offers').update({deal_id:ins.data.id}).eq('id',offerId);
    try{ await sbc.from('documents').update({deal_id:ins.data.id}).eq('offer_id',offerId); }catch(e){}
    try{ document.getElementById('cloudPanel').style.display='none'; }catch(e){}
    openDeal(ins.data.id);
  };
  window.openDeal=async function(id){
    var dr=await sbc.from('deals').select('*').eq('id',id).single();
    if(dr.error){ alert(dr.error.message); return; }
    curDeal=dr.data;
    var ofs=await sbc.from('offers').select('id,title,client,status,template').eq('deal_id',id).order('updated_at',{ascending:false});
    var dcs=await sbc.from('documents').select('id,type,title,doc_number,status').eq('deal_id',id).order('created_at',{ascending:false});
    dealRenderView(curDeal, (ofs&&ofs.data)||[], (dcs&&dcs.data)||[]);
    try{ document.getElementById('dealsPanel').style.display='none'; document.getElementById('dashView').classList.remove('open'); document.getElementById('calView').classList.remove('open'); document.getElementById('view-selector').style.display='none'; document.getElementById('view-offer').style.display='none'; }catch(e){}
    document.getElementById('dealView').classList.add('open');
  };
  function dealStatusBadgeUpd(){ var s=document.getElementById('dvStatus').value, st=DST[s]||DST.dopyt, b=document.getElementById('dealStatusBadge'); b.textContent=st.l; b.style.background=st.c; }
  window.dealStatusBadgeUpd=dealStatusBadgeUpd;
  function dealRenderView(d, offers, docs){
    document.getElementById('dvTitle').value=d.title||'';
    document.getElementById('dvClient').value=d.client||'';
    document.getElementById('dvDate').value=d.event_date||'';
    document.getElementById('dvResp').value=d.responsible||'';
    document.getElementById('dvStatus').value=d.status||'dopyt';
    document.getElementById('dvNote').value=d.note||'';
    dealStatusBadgeUpd();
    window.__dealOffers=offers;
    document.getElementById('dvOffers').innerHTML = offers.length? offers.map(function(o){ return '<div class="li2"><span class="lk" onclick="dealOpen(\''+o.id+'\')"><span class="ic2 offer">Ponuka</span>'+esc(o.title||o.client||'Ponuka')+'</span><button onclick="dealOpen(\''+o.id+'\')">Otvoriť</button></div>'; }).join('') : '<div class="empty">Žiadna ponuka. Otvor ponuku a v lište klikni „→ Akcia".</div>';
    document.getElementById('dvDocs').innerHTML = docs.length? docs.map(function(x){ var num=x.doc_number?((x.type==='deposit_invoice'?'VS ':'č. ')+esc(x.doc_number)+' · '):''; var paid=(x.type==='deposit_invoice')?(' <span class="ic2" style="'+(x.status==='paid'?'background:#d8eddb;color:#2a6b32':'background:#f3dede;color:#9a3b3b')+'">'+(x.status==='paid'?'Uhradené':'Neuhradené')+'</span>'):''; return '<div class="li2"><span class="lk" onclick="docOpen(\''+x.id+'\')"><span class="ic2 '+x.type+'">'+(x.type==='contract'?'Zmluva':'Depozit')+'</span>'+num+esc(x.title||'Dokument')+paid+'</span><button onclick="docOpen(\''+x.id+'\')">PDF</button></div>'; }).join('') : '<div class="empty">Žiadne dokumenty. Otvor ponuku → „Uložiť zmluvu / depozit" (priradí sa k tejto akcii).</div>';
  }
  window.dealField=async function(field,value){
    if(!curDeal) return;
    var patch={updated_at:new Date().toISOString()}; patch[field]=value;
    var res=await sbc.from('deals').update(patch).eq('id',curDeal.id);
    if(res.error){ toast('Chyba: '+res.error.message); return; }
    curDeal[field]=value; toast('Uložené ✓');
  };
  window.dealOpen=function(offerId){ document.getElementById('dealView').classList.remove('open'); cloudOpen(offerId); };
  window.dealOpenOffer=function(){ var ofs=window.__dealOffers||[]; if(!ofs.length){ alert('K tejto akcii nie je priradená ponuka. Otvor/vytvor ponuku a v lište klikni „→ Akcia".'); return; } dealOpen(ofs[0].id); };
  window.dealMarkDone=function(){ document.getElementById('dvStatus').value='closed'; dealField('status','closed'); dealStatusBadgeUpd(); };
  window.dealDuplicate=async function(){ if(!curDeal) return; var ins=await sbc.from('deals').insert({title:(curDeal.title||'Akcia')+' (kópia)', client:curDeal.client, responsible:curDeal.responsible, status:'dopyt', note:curDeal.note}).select('id').single(); if(ins.error){ alert(ins.error.message); return; } toast('Akcia zduplikovaná ✓'); openDeal(ins.data.id); };
  window.dealDelete=async function(){ if(!curDeal) return; if(!confirm('Zmazať túto akciu? Ponuky a dokumenty zostanú zachované, len sa odpoja.')) return; var res=await sbc.from('deals').delete().eq('id',curDeal.id); if(res.error){ alert(res.error.message); return; } document.getElementById('dealView').classList.remove('open'); showDeals(); };

  /* ---------- SIDEBAR + GLOBÁLNE VYHĽADÁVANIE ---------- */
  window.toggleSideNav=function(){
    var s=document.getElementById('sideNav'); s.classList.toggle('open');
    if(s.classList.contains('open')){
      var salesOn=(myRole==='admin'||myRole==='sales'||myRole==='revenue');
      Array.prototype.forEach.call(document.querySelectorAll('#sideNavList .sales-only'),function(el){ el.style.display=salesOn?'':'none'; });
      var fcOn=true;
      var finOn=(myRole==='admin'||myRole==='sales'||myRole==='finance'||myRole==='revenue');
      Array.prototype.forEach.call(document.querySelectorAll('#sideNavList .fin-only'),function(el){ el.style.display=finOn?'':'none'; });
      document.getElementById('navRevSec').style.display=fcOn?'':'none';
      document.getElementById('navForecastBtn').style.display=fcOn?'':'none';
      document.getElementById('navAdminSec').style.display=(myRole==='admin')?'':'none';
      document.getElementById('navAdminBtn').style.display=(myRole==='admin')?'':'none';
      Array.prototype.forEach.call(document.querySelectorAll('#sideNavList button[data-nav]'),function(el){ el.classList.toggle('active', el.getAttribute('data-nav')===window.__activeSection); });
      var gi=document.getElementById('gsearch'); gi.value=''; document.getElementById('gresults').classList.remove('show'); document.getElementById('sideNavList').style.display=''; setTimeout(function(){ gi.focus(); },50);
    }
  };
  window.navGo=function(where){
    window.__activeSection=where;
    document.getElementById('sideNav').classList.remove('open');
    switch(where){
      case 'deals': showDeals(); break;
      case 'dash': showDashboard(); break;
      case 'offers': cloudList(); break;
      case 'contracts': showDocs('contract'); break;
      case 'invoices': showDocs('deposit_invoice'); break;
      case 'final_invoices': showDocs('final_invoice'); break;
      case 'docs': showDocs(''); break;
      case 'forecast': showForecast(); break;
      case 'clients': showFolders(); break;
      case 'calendar': showCalendar(); break;
      case 'templates': dashNewOffer(); break;
      case 'newsletter': showNewsletter(); break;
      case 'ai': showInquiry(); break;
      case 'admin': showAdmin(); break;
      case 'email': showEmailModal(); break;
      case 'pwd': showPwdModal(); break;
      case 'signout': cloudSignOut(); break;
    }
  };
  var gsTimer=null;
  window.gsearch=function(){
    if(gsTimer) clearTimeout(gsTimer);
    gsTimer=setTimeout(gsearchRun, 250);
  };
  async function gsearchRun(){
    var q=(document.getElementById('gsearch').value||'').trim();
    var res=document.getElementById('gresults'), nav=document.getElementById('sideNavList');
    if(q.length<2){ res.classList.remove('show'); nav.style.display=''; return; }
    nav.style.display='none'; res.classList.add('show'); res.innerHTML='<div class="empty">Hľadám…</div>';
    var like='%'+q.replace(/[%,]/g,' ')+'%';
    var d,o,dc;
    try{ d=await sbc.from('deals').select('id,title,client').or('title.ilike.'+like+',client.ilike.'+like+',responsible.ilike.'+like).limit(8); }catch(e){ d={data:[]}; }
    try{ o=await sbc.from('offers').select('id,title,client,reference').or('title.ilike.'+like+',client.ilike.'+like+',reference.ilike.'+like).limit(8); }catch(e){ o={data:[]}; }
    try{ dc=await sbc.from('documents').select('id,type,title,client,doc_number,reference').or('title.ilike.'+like+',client.ilike.'+like+',doc_number.ilike.'+like+',reference.ilike.'+like).limit(10); }catch(e){ dc={data:[]}; }
    var html='';
    if(d&&d.data&&d.data.length){ html+='<div class="rg">Akcie</div>'+d.data.map(function(x){ return '<div class="ri" onclick="gOpen(\'deal\',\''+x.id+'\')">'+esc(x.title||x.client||'Akcia')+'<div class="m">'+esc(x.client||'')+'</div></div>'; }).join(''); }
    if(o&&o.data&&o.data.length){ html+='<div class="rg">Ponuky</div>'+o.data.map(function(x){ return '<div class="ri" onclick="gOpen(\'offer\',\''+x.id+'\')">'+esc(x.title||x.client||'Ponuka')+'<div class="m">'+esc(((x.reference||'')+' '+(x.client||'')).trim())+'</div></div>'; }).join(''); }
    if(dc&&dc.data&&dc.data.length){ html+='<div class="rg">Dokumenty</div>'+dc.data.map(function(x){ var n=x.doc_number?((x.type==='deposit_invoice'?'VS ':'č. ')+x.doc_number+' · '):''; return '<div class="ri" onclick="gOpen(\'doc\',\''+x.id+'\')">'+(x.type==='contract'?'Zmluva':'Depozit')+': '+esc(x.title||x.client||'')+'<div class="m">'+esc(n+(x.client||''))+'</div></div>'; }).join(''); }
    res.innerHTML = html || '<div class="empty">Nič sa nenašlo pre „'+esc(q)+'".</div>';
  }
  window.gOpen=function(kind,id){
    document.getElementById('sideNav').classList.remove('open');
    document.getElementById('gsearch').value=''; document.getElementById('gresults').classList.remove('show'); document.getElementById('sideNavList').style.display='';
    if(kind==='deal') openDeal(id);
    else if(kind==='offer') cloudOpen(id);
    else if(kind==='doc') docOpen(id);
  };

  /* ---------- KONTEXTOVÉ TLAČIDLÁ + KLÁVESOVÉ SKRATKY ---------- */
  function ctxSave(on, tpl){
    var canC=(myRole==='admin'||myRole==='sales'||myRole==='revenue');
    var supportsDoc = !!(on && tpl && ['mice','corp','acc','sport','wedding'].indexOf(tpl)>=0);
    var a=document.getElementById('cloudSaveBtn'), b=document.getElementById('btnSaveContract'), c=document.getElementById('btnSaveDeposit');
    if(a) a.style.display=(on && canC)?'':'none';
    if(b) b.style.display=(supportsDoc && canC)?'':'none';
    if(c) c.style.display=(supportsDoc && canC)?'':'none';
  }
  function syncCtxSave(){
    var vo=document.getElementById('view-offer');
    var on = !!(vo && getComputedStyle(vo).display!=='none' && typeof __current!=='undefined' && __current);
    ctxSave(on, on?__current:null);
  }
  window.syncCtxSave=syncCtxSave;
  (function(){ var vo=document.getElementById('view-offer'); if(vo && window.MutationObserver){ new MutationObserver(function(){ syncCtxSave(); }).observe(vo,{attributes:true,attributeFilter:['style']}); } })();
  document.addEventListener('keydown', function(e){
    if((e.metaKey||e.ctrlKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); var s=document.getElementById('sideNav'); if(!s.classList.contains('open')){ toggleSideNav(); } else { var g=document.getElementById('gsearch'); if(g) g.focus(); } }
    else if(e.key==='Escape'){ var s2=document.getElementById('sideNav'); if(s2 && s2.classList.contains('open')) s2.classList.remove('open'); }
  });

  /* ---------- FORECAST (revenue) ---------- */
  var fcMONTHS=3;
  var fcINQW=[0.1,0.3,0.4];
  var fcRO=false;
  var fcTab='forecast';
  var fcHelpOpen=false;
  window.fcToggleHelp=function(){ fcHelpOpen=!fcHelpOpen; var el=document.getElementById('fcHelpBody'); if(el) el.style.display=fcHelpOpen?'block':'none'; };
  /* Predvyplnené konštanty: PY (2025) + Plan (mi 0=Jún,1=Júl,2=August). Ručný vstup ich vždy prebije. */
  var fcDefaults={
   '0.4.PY':137202,'0.4.PLAN':350550, '1.4.PY':195239,'1.4.PLAN':349016, '2.4.PY':353436,'2.4.PLAN':504070,
   '0.5.PY':30465,
   '0.7.PY':245458,'0.7.PLAN':497365, '1.7.PY':254434,'1.7.PLAN':438462, '2.7.PY':422555,'2.7.PLAN':598598,
   '0.8.PLAN':244920,
   '0.9.PY':125704,'0.9.PLAN':186233, '1.9.PY':505,'1.9.PLAN':15300, '2.9.PY':78869,'2.9.PLAN':58869,
   '0.13.PY':27996,'0.13.PLAN':51534, '1.13.PY':0,'1.13.PLAN':6434, '2.13.PY':13203,'2.13.PLAN':21983,
   '0.17.PY':50936,'0.17.PLAN':101117, '1.17.PY':70800,'1.17.PLAN':137785, '2.17.PY':109563,'2.17.PLAN':181789,
   '0.18.PY':72000,'0.18.PLAN':279000,
   '0.25.PY':162,'0.25.PLAN':166, '0.26.PY':5181,'0.26.PLAN':4405, '0.27.PY':1706,'0.27.PLAN':2026,
   '0.28.PY':3429,'0.28.PLAN':4600, '0.29.PY':24,'0.29.PLAN':46, '0.30.PY':112,'0.30.PLAN':173,
   '0.32.PY':16857,'0.32.PLAN':42244, '0.33.PY':7000,'0.33.PLAN':5691, '0.34.PY':6916,'0.34.PLAN':3599
  };
  var fcState={ date:'', labels:['Jún','Júl','August'], inp:Object.assign({},fcDefaults), pick:{}, sm:[['Apríl',0,0],['Máj',0,0],['Jún (forecast)',0,0]], otb:{otb:0,budget:0}, weights:{tent:0.85,inq:[0.1,0.3,0.4]} };
  var fcROWS=[
   {r:4,l:'Rooms',inp:['PY','PLAN','TODAY'],k:'std'},
   {r:5,l:'Room_OTB',ind:1,inp:['PY','TODAY'],k:'r5'},
   {r:6,l:'Predpokladaný Pick-up (forecast)',ind:1,inp:['TODAY'],k:'r6'},
   {r:7,l:'Food & Beverages Revenue Total (FnB + MICE FnB)',inp:['PY','PLAN','TODAY'],k:'std'},
   {r:8,l:'FnB',ind:1,inp:['PLAN'],k:'r8'},
   {r:9,l:'MICE FnB',ind:1,inp:['PY','PLAN','TODAY'],k:'std'},
   {r:10,l:'MICE FnB_OTB (DEF)',ind:2,inp:['TODAY'],k:'r10'},
   {r:11,l:'MICE FnB_pick up (TENT)',ind:2,inp:['TODAY'],k:'r11'},
   {r:12,l:'MICE FnB_pick up (INQ)',ind:2,inp:['TODAY'],k:'r12'},
   {r:13,l:'Rental MICE',inp:['PY','PLAN','TODAY'],k:'std'},
   {r:14,l:'Rental MICE_OTB (DEF)',ind:1,inp:['TODAY'],k:'r14'},
   {r:15,l:'Rental MICE_pick up (TENT)',ind:1,inp:['TODAY'],k:'r15'},
   {r:16,l:'Rental MICE_pick up (INQ)',ind:1,inp:['TODAY'],k:'r16'},
   {r:17,l:'Other Revenue (sundry, additional, parking)',inp:['PY','PLAN','TODAY'],k:'std'},
   {r:18,l:'Všetky strediská (+Daily Rev Pick up forecast)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:19,l:'Total ACT',inp:[],k:'t',tot:1},
   {r:20,l:'Total DEF (def status + OTB accomodation)',inp:[],k:'t',tot:1},
   {r:21,l:'Pre Janku: OTB acc, DEF, TENT(85%), INQ(10%)',inp:[],k:'t',tot:1},
   {r:22,l:'Total ACT + DEF, OTB, +Pick up (Forecast)',inp:[],k:'t',tot:1},
   {r:23,l:'Sales Revenue (Accom+MICE rental,FnB)_DEF',inp:[],k:'t',tot:1},
   {sec:'Prevádzkové ukazovatele'},
   {r:25,l:'Number of rooms in hotel program',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:26,l:'Rooms Available (minus House use & OOO)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:27,l:'Rooms occupied (sold)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:28,l:'Number of guests (all)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:29,l:'Occupancy // rooms (%)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:30,l:'ADR / rooms',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:31,l:'RevPAR',inp:[],k:'revpar',tot:1},
   {r:35,l:'Uplynuté dni v mesiaci (pre RevPAR)',inp:['TODAY'],k:'novar'},
   {r:32,l:'Conference room rental (4003)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:33,l:'Equipment rental MICE (4004,4008)',inp:['PY','PLAN','TODAY'],k:'novar'},
   {r:34,l:'Miscellaneous MICE / others (4005,4009,4010)',inp:['PY','PLAN','TODAY'],k:'novar'}
  ];
  function fcNum(x){ x=parseFloat(x); return isFinite(x)?x:0; }
  function fcGi(mi,r,c){ return fcNum(fcState.inp[mi+'.'+r+'.'+c]); }
  function fcFmt(x){ if(x===''||x===null||x===undefined) return ''; return Math.round(fcNum(x)).toLocaleString('sk-SK'); }
  function fcPct(x){ if(x===''||x===null||x===undefined) return ''; return Math.round(fcNum(x)*100)+'%'; }
  function fcCompute(mi){
   var WT=fcState.weights||{}; var tw=(WT.tent!=null?WT.tent:0.85); var w=((WT.inq&&WT.inq[mi]!=null)?WT.inq[mi]:fcINQW[mi])||0.1; var B={},C={},D={};
   [4,7,9,13,17,18,25,26,27,28,29,30,32,33,34].forEach(function(r){B[r]=fcGi(mi,r,'PY');C[r]=fcGi(mi,r,'PLAN');D[r]=fcGi(mi,r,'TODAY');});
   B[5]=fcGi(mi,5,'PY'); D[5]=fcGi(mi,5,'TODAY'); D[6]=fcGi(mi,6,'TODAY'); C[8]=fcGi(mi,8,'PLAN');
   D[10]=fcGi(mi,10,'TODAY');D[11]=fcGi(mi,11,'TODAY');D[12]=fcGi(mi,12,'TODAY');
   D[14]=fcGi(mi,14,'TODAY');D[15]=fcGi(mi,15,'TODAY');D[16]=fcGi(mi,16,'TODAY');
   B[8]=B[7]-B[9]; D[8]=D[7]-D[9];
   B[19]=B[4]+B[7]+B[13]+B[17]; C[19]=C[4]+C[7]+C[13]+C[17]; D[19]=D[4]+D[7]+D[13]+D[17];
   B[20]=B[19];C[20]=C[19];D[20]=D[4]+D[5]+D[7]+D[13]+D[17]+D[10]+D[14];
   B[21]=B[19];C[21]=C[19];D[21]=D[4]+D[5]+D[7]+D[10]+tw*D[11]+w*D[12]+D[13]+D[14]+tw*D[15]+w*D[16]+D[17];
   B[22]=B[19];C[22]=C[19];D[22]=D[4]+D[5]+D[6]+D[7]+D[10]+tw*D[11]+w*D[12]+D[13]+D[14]+tw*D[15]+w*D[16]+D[17]+D[18];
   B[23]=B[4]+B[9]+B[13]; C[23]=C[4]+C[9]+C[13]; D[23]=D[4]+D[5]+D[9]+D[10]+D[13]+D[14];
   function vr(d,c,b){return {E:d-c,F:c?(d-c)/c:0,G:d-b,H:b?(d-b)/b:0};}
   var ce={};
   [4,7,9,13,17,19,20,23].forEach(function(r){var o=vr(D[r],C[r],B[r]);ce[r]={B:B[r],C:C[r],D:D[r],E:o.E,F:o.F,G:o.G,H:o.H};});
   ce[5]={B:B[5],C:'',D:D[5]};ce[5].E=(D[4]-C[4])+D[5];ce[5].F=C[4]?ce[5].E/C[4]:0;ce[5].G=D[5]+D[4]-B[4];ce[5].H=B[4]?ce[5].G/B[4]:0;
   ce[6]={B:'',C:'',D:D[6]};ce[6].E=(D[4]+D[5]+D[6])-C[4];ce[6].F=C[4]?ce[6].E/C[4]:0;ce[6].G=(D[6]+D[5]+D[4])-B[4];ce[6].H=B[4]?ce[6].G/B[4]:0;
   var o8=vr(D[8],C[8],B[8]);ce[8]={B:B[8],C:C[8],D:D[8],E:o8.E,F:o8.F,G:o8.G,H:o8.H};
   ce[10]={B:'',C:'',D:D[10]};ce[10].E=(D[10]+D[9])-C[9];ce[10].F=C[9]?ce[10].E/C[9]:0;ce[10].G=D[10]+D[9]-B[9];ce[10].H=B[9]?ce[10].G/B[9]:0;
   ce[11]={B:'',C:'',D:D[11]};ce[11].E=D[11]+D[10]+D[9]-C[9];ce[11].F=C[9]?ce[11].E/C[9]:0;ce[11].G=D[11]+D[10]+D[9]-B[9];ce[11].H=B[9]?ce[11].G/B[9]:0;
   ce[12]={B:'',C:'',D:D[12]};ce[12].E=D[12]+D[9]+D[10]+D[11]-C[9];ce[12].F=C[9]?ce[12].E/C[9]:0;ce[12].G=D[12]+D[10]+D[9]-B[9];ce[12].H=B[9]?ce[12].G/B[9]:0;
   ce[14]={B:'',C:'',D:D[14]};ce[14].E=D[14]+D[13]-C[13];ce[14].F=C[13]?ce[14].E/C[13]:0;ce[14].G=D[14]+D[13]-B[13];ce[14].H=B[13]?ce[14].G/B[13]:0;
   ce[15]={B:'',C:'',D:D[15]};ce[15].E=D[15]+D[14]+D[13]-C[13];ce[15].F=C[13]?ce[15].E/C[13]:0;ce[15].G=D[15]+D[14]+D[13]-B[13];ce[15].H=B[13]?ce[15].G/B[13]:0;
   ce[16]={B:'',C:'',D:D[16]};ce[16].E=D[16]+D[14]+D[13]+D[15]-C[13];ce[16].F=C[13]?ce[16].E/C[13]:0;ce[16].G=D[16]+D[14]+D[13]-B[13];ce[16].H=B[13]?ce[16].G/B[13]:0;
   ce[18]={B:B[18],C:C[18],D:D[18]};
   ce[21]={B:B[21],C:C[21],D:D[21]};ce[21].E=D[21]-C[21];ce[21].F=C[21]?ce[21].E/C[21]:0;ce[21].G=D[21]-B[21];ce[21].H=B[21]?ce[21].G/B[21]:0;
   ce[22]={B:B[22],C:C[22],D:D[22]};ce[22].E=D[22]-C[19];ce[22].F=C[19]?ce[22].E/C[19]:0;ce[22].G=D[22]-B[19];ce[22].H=B[19]?ce[22].G/B[19]:0;
   [25,26,27,28,29,30,32,33,34].forEach(function(r){ce[r]={B:B[r],C:C[r],D:D[r]};});
   var el=fcNum(fcState.inp[mi+'.35.TODAY'])||21;
   ce[31]={B:B[26]?B[4]/B[26]:0,C:'',D:(D[26]>0)?D[4]/((D[26]/30)*el):0};
   ce[35]={B:'',C:'',D:el};
   return ce;
  }
  function fcCellInput(mi,r,c){ var k=mi+'.'+r+'.'+c; var v=fcState.inp[k]; return '<input class="fi mono" inputmode="decimal" data-fk="'+k+'" value="'+(v===undefined?'':v)+'"/>'; }
  function fcCellCalc(v,isPct,key){ var s=isPct?fcPct(v):fcFmt(v); return '<td class="calc mono'+(fcNum(v)<0?' neg':'')+'"'+(key?(' data-c="'+key+'"'):'')+'>'+s+'</td>'; }
  function fcRenderMain(){
   var comp=[]; for(var mi=0;mi<fcMONTHS;mi++) comp.push(fcCompute(mi));
   var sP=0,sD=0,sB=0;
   for(var mk=0;mk<fcMONTHS;mk++){ var t=comp[mk][22]||{}; sP+=fcNum(t.C); sD+=fcNum(t.D); sB+=fcNum(t.B); }
   var dv=sD-sP, dvp=sP?dv/sP*100:0, pyp=sB?(sD-sB)/sB*100:0;
   function ek(x){ return Math.round(x).toLocaleString('sk-SK')+' €'; }
   var started=sD>0;
   var dvCls=dv>=0?'pos':'neg2';
   var h='<div class="bkpis">'
     +'<div class="bkpi"><div class="l">Plán · 3 mesiace</div><div class="v">'+ek(sP)+'</div><div class="s">rozpočet (budget)</div></div>'
     +'<div class="bkpi accent"><div class="l">Forecast · 3 mesiace</div><div class="v">'+(started?ek(sD):'—')+'</div><div class="s">'+(started?'as of today + pick-up':'doplň „As of today"')+'</div></div>'
     +'<div class="bkpi"><div class="l">Odchýlka vs plán</div><div class="v '+(started?dvCls:'')+'">'+(started?((dv>=0?'+':'')+ek(dv)):'—')+'</div><div class="s">'+(started?((dv>=0?'+':'')+dvp.toFixed(1)+' %'):'čaká na dáta')+'</div></div>'
     +'<div class="bkpi"><div class="l">vs minulý rok</div><div class="v '+(started&&sB?(sD-sB>=0?'pos':'neg2'):'')+'">'+(started&&sB?((pyp>=0?'+':'')+pyp.toFixed(1)+' %'):'—')+'</div><div class="s">PY '+ek(sB)+'</div></div>'
     +'</div>';
   var WT=fcState.weights||{tent:0.85,inq:[0.1,0.3,0.4]};
   var tentP=Math.round((WT.tent!=null?WT.tent:0.85)*100), iq=(WT.inq||[0.1,0.3,0.4]).map(function(x){return Math.round((x||0)*100);});
   h+='<div class="fchelp"><div class="fchelp-bar">'
     +'<button type="button" class="fchbtn" onclick="fcToggleHelp()">ⓘ Ako forecast funguje</button>'
     +'<span class="fcw">Váhy pick-up: TENT <input data-fw="tent" value="'+tentP+'">% · INQ <input data-fw="inq0" value="'+(iq[0]||0)+'"> <input data-fw="inq1" value="'+(iq[1]||0)+'"> <input data-fw="inq2" value="'+(iq[2]||0)+'">% <span style="color:#a59b85">(mes. 1·2·3)</span></span>'
     +'</div><div id="fcHelpBody" class="fchelp-body" style="display:'+(fcHelpOpen?'block':'none')+'">'
     +'<b>Forecast = čo je dnes na knihách, vážené podľa istoty rezervácie:</b><br>'
     +'• <b>DEF</b> (potvrdené) × 100 %&nbsp;&nbsp;•&nbsp; <b>TENT</b> (predbežné) × '+tentP+' %&nbsp;&nbsp;•&nbsp; <b>INQ</b> (dopyt) × '+(iq[0]||10)+'–'+(iq[2]||40)+' %<br>'
     +'Zadávaš stĺpec <b>„As of today"</b> po strediskách (DEF / TENT / INQ). Appka to zváži a sčíta do <b>Forecastu</b> – riadok „Total ACT + DEF, OTB, +Pick up".<br>'
     +'<b>Odchýlka vs Plán</b> = trafíš budget? &nbsp;·&nbsp; <b>vs PY</b> = rastieš oproti vlaňajšku?<br>'
     +'<span style="color:#8a8170">Pri výbere mesiaca sa <b>Plán</b> natiahne z budgetu a <b>Rooms PY</b> z reálnych čísel 2025. Ostatné PY (F&amp;B, MICE, Other) si doplň ručne – v účtovníctve sú na inej báze než forecast.</span><br>'
     +'<i>Príklad (izby):</i> plán 350k €; dnes na knihách 200k DEF + 50k TENT + 100k INQ → forecast = 200k + 0,85×50k + 0,10×100k = <b>252,5k €</b> → −28 % pod plán, treba dotlačiť predaj.'
     +'</div></div>';
   h+='<h3 class="fch">Mesačný forecast</h3><table><thead><tr><th class="lbl">Položka</th>';
   for(var mi=0;mi<fcMONTHS;mi++){ h+='<th class="grp" colspan="7">'+fcMonthSelect(mi)+'</th>'; }
   h+='</tr><tr><th class="lbl"></th>';
   for(var mi=0;mi<fcMONTHS;mi++){ h+='<th class="grp">PY</th><th>Plan</th><th>As of today</th><th>Var ABS plan</th><th>Var % plan</th><th>Var ABS PY</th><th>Var % PY</th>'; }
   h+='</tr></thead><tbody>';
   fcROWS.forEach(function(row){
    if(row.sec){ h+='<tr class="sec"><td class="lbl">'+row.sec+'</td>'; for(var mi=0;mi<fcMONTHS;mi++) h+='<td colspan="7"></td>'; h+='</tr>'; return; }
    var indc = row.ind===2?'ind2':(row.ind===1?'ind1':'');
    h+='<tr class="'+(row.tot?'tot':'')+'"><td class="lbl '+indc+'">'+row.l+'</td>';
    for(var mi=0;mi<fcMONTHS;mi++){
     var ce=comp[mi][row.r]||{};
     var inputCols={PY:'B',PLAN:'C',TODAY:'D'};
     ['B','C','D'].forEach(function(col,idx){
       var isInput=false, cKey=null;
       (row.inp||[]).forEach(function(ic){ if(inputCols[ic]===col){isInput=true;cKey=ic;} });
       var grp = idx===0?' grp':'';
       if(isInput){ h+='<td class="'+grp+'">'+fcCellInput(mi,row.r,cKey)+'</td>'; }
       else { var val=ce[col]; if(val===undefined) val=''; h+='<td class="calc mono'+(fcNum(val)<0?' neg':'')+grp+'" data-c="m'+mi+'r'+row.r+'c'+col+'">'+fcFmt(val)+'</td>'; }
     });
     if(row.k==='novar'){ h+='<td colspan="4" class="calc"></td>'; }
     else { h+=fcCellCalc(ce.E,false,'m'+mi+'r'+row.r+'cE')+fcCellCalc(ce.F,true,'m'+mi+'r'+row.r+'cF')+fcCellCalc(ce.G,false,'m'+mi+'r'+row.r+'cG')+fcCellCalc(ce.H,true,'m'+mi+'r'+row.r+'cH'); }
    }
    h+='</tr>';
   });
   h+='</tbody></table>'; return h;
  }
  function fcRenderPick(){
   var h='<h3 class="fch">Pick-up (PW vs AW)</h3><table><thead><tr><th class="lbl">Položka</th>';
   for(var mi=0;mi<fcMONTHS;mi++) h+='<th class="grp">'+fcState.labels[mi]+' PW</th><th>AW</th><th>Var</th>';
   h+='</tr></thead><tbody>';
   var pr=[['ind','Počet izieb individual',true],['blk','Počet izieb v bloku',true],['sum','Počet izieb spolu',false],['rind','Revenue individual',true],['rblk','Revenue z bloku',true],['rsum','Revenue spolu',false]];
   pr.forEach(function(p){
    h+='<tr class="'+(p[2]?'':'tot')+'"><td class="lbl">'+p[1]+'</td>';
    for(var mi=0;mi<fcMONTHS;mi++){
     var pw=fcNum(fcState.pick[mi+'.'+p[0]+'.PW']), aw=fcNum(fcState.pick[mi+'.'+p[0]+'.AW']);
     if(p[0]==='sum'){ pw=fcNum(fcState.pick[mi+'.ind.PW'])+fcNum(fcState.pick[mi+'.blk.PW']); aw=fcNum(fcState.pick[mi+'.ind.AW'])+fcNum(fcState.pick[mi+'.blk.AW']); }
     if(p[0]==='rsum'){ pw=fcNum(fcState.pick[mi+'.rind.PW'])+fcNum(fcState.pick[mi+'.rblk.PW']); aw=fcNum(fcState.pick[mi+'.rind.AW'])+fcNum(fcState.pick[mi+'.rblk.AW']); }
     if(p[2]){ h+='<td class="grp"><input class="fi mono" data-fpk="'+mi+'.'+p[0]+'.PW" value="'+(fcState.pick[mi+'.'+p[0]+'.PW']||'')+'"/></td><td><input class="fi mono" data-fpk="'+mi+'.'+p[0]+'.AW" value="'+(fcState.pick[mi+'.'+p[0]+'.AW']||'')+'"/></td>'; }
     else { h+='<td class="calc mono grp" data-c="pk'+mi+p[0]+'PW">'+fcFmt(pw)+'</td><td class="calc mono" data-c="pk'+mi+p[0]+'AW">'+fcFmt(aw)+'</td>'; }
     h+=fcCellCalc(aw-pw,false,'pk'+mi+p[0]+'V');
    }
    h+='</tr>';
   });
   h+='</tbody></table>'; return h;
  }
  function fcRenderSummary(){
   var h='<h3 class="fch">Mesačný súhrn</h3><table><thead><tr><th class="lbl">Mesiac</th><th>Revenue Plan</th><th>Revenue So far</th><th>Variance</th><th>%</th></tr></thead><tbody>';
   var tp=0,ts=0;
   fcState.sm.forEach(function(row,i){
    var plan=fcNum(row[1]), so=fcNum(row[2]); tp+=plan; ts+=so;
    h+='<tr><td class="lbl"><input data-fsm="'+i+'.0" value="'+row[0]+'" style="width:150px;text-align:left" class="fi"/></td>';
    h+='<td><input class="fi mono" data-fsm="'+i+'.1" value="'+(row[1]||'')+'"/></td>';
    h+='<td><input class="fi mono" data-fsm="'+i+'.2" value="'+(row[2]||'')+'"/></td>';
    h+=fcCellCalc(so-plan,false,'smV'+i)+fcCellCalc(plan?(so-plan)/plan:0,true,'smP'+i)+'</tr>';
   });
   h+='<tr class="tot"><td class="lbl">TOTAL</td><td class="calc mono" data-c="smTP">'+fcFmt(tp)+'</td><td class="calc mono" data-c="smTS">'+fcFmt(ts)+'</td>'+fcCellCalc(ts-tp,false,'smTV')+fcCellCalc(tp?(ts-tp)/tp:0,true,'smTPp')+'</tr>';
   h+='</tbody></table>';
   var otb=fcNum(fcState.otb.otb), bud=fcNum(fcState.otb.budget);
   h+='<h3 class="fch">OTB vs Budget</h3><table><thead><tr><th>OTB</th><th>Budget</th><th>Variance</th><th>%</th></tr></thead><tbody><tr>';
   h+='<td><input class="fi mono" data-fotb="otb" value="'+(fcState.otb.otb||'')+'"/></td><td><input class="fi mono" data-fotb="budget" value="'+(fcState.otb.budget||'')+'"/></td>';
   h+=fcCellCalc(otb-bud,false,'otbV')+fcCellCalc(bud?(otb-bud)/bud:0,true,'otbP')+'</tr></tbody></table>';
   return h;
  }
  function fcSet(key,val,isPct){ var el=document.querySelector('#fcWrap [data-c="'+key+'"]'); if(!el) return; el.textContent=(isPct?fcPct(val):fcFmt(val)); if(fcNum(val)<0) el.classList.add('neg'); else el.classList.remove('neg'); }
  function fcUpdateCalcs(){
   var inputCols={PY:'B',PLAN:'C',TODAY:'D'};
   for(var mi=0;mi<fcMONTHS;mi++){
    var ce=fcCompute(mi);
    fcROWS.forEach(function(row){
     if(row.sec) return;
     var ic={}; (row.inp||[]).forEach(function(x){ ic[inputCols[x]]=true; });
     ['B','C','D'].forEach(function(col){ if(!ic[col]){ var v=(ce[row.r]||{})[col]; fcSet('m'+mi+'r'+row.r+'c'+col,(v===undefined?'':v),false); } });
     if(row.k!=='novar'){ var c=ce[row.r]||{}; fcSet('m'+mi+'r'+row.r+'cE',c.E,false); fcSet('m'+mi+'r'+row.r+'cF',c.F,true); fcSet('m'+mi+'r'+row.r+'cG',c.G,false); fcSet('m'+mi+'r'+row.r+'cH',c.H,true); }
    });
   }
   var pr=[['ind',true],['blk',true],['sum',false],['rind',true],['rblk',true],['rsum',false]];
   for(var mi2=0;mi2<fcMONTHS;mi2++){ (function(mi){
    pr.forEach(function(p){
     var pw=fcNum(fcState.pick[mi+'.'+p[0]+'.PW']), aw=fcNum(fcState.pick[mi+'.'+p[0]+'.AW']);
     if(p[0]==='sum'){ pw=fcNum(fcState.pick[mi+'.ind.PW'])+fcNum(fcState.pick[mi+'.blk.PW']); aw=fcNum(fcState.pick[mi+'.ind.AW'])+fcNum(fcState.pick[mi+'.blk.AW']); }
     if(p[0]==='rsum'){ pw=fcNum(fcState.pick[mi+'.rind.PW'])+fcNum(fcState.pick[mi+'.rblk.PW']); aw=fcNum(fcState.pick[mi+'.rind.AW'])+fcNum(fcState.pick[mi+'.rblk.AW']); }
     if(!p[1]){ fcSet('pk'+mi+p[0]+'PW',pw,false); fcSet('pk'+mi+p[0]+'AW',aw,false); }
     fcSet('pk'+mi+p[0]+'V',aw-pw,false);
    });
   })(mi2); }
   var tp=0,ts=0;
   fcState.sm.forEach(function(row,i){ var plan=fcNum(row[1]), so=fcNum(row[2]); tp+=plan; ts+=so; fcSet('smV'+i,so-plan,false); fcSet('smP'+i,plan?(so-plan)/plan:0,true); });
   fcSet('smTP',tp,false); fcSet('smTS',ts,false); fcSet('smTV',ts-tp,false); fcSet('smTPp',tp?(ts-tp)/tp:0,true);
   var otb=fcNum(fcState.otb.otb), bud=fcNum(fcState.otb.budget);
   fcSet('otbV',otb-bud,false); fcSet('otbP',bud?(otb-bud)/bud:0,true);
  }
  /* Celoročný budget 2026 (zdroj: Budget_2026_final, hárok Summary, mesiace Jan–Dec) */
  var fcBudget2026={
   months:['Jan','Feb','Mar','Apr','Máj','Jún','Júl','Aug','Sep','Okt','Nov','Dec'],
   rev:[
    {l:'Rooms (ubytovanie)', m:[959298,1007316,489321,366806,371449,376860,389434,558960,452094,472629,450919,1017061]},
    {l:'F&B', m:[559605,728036,534407,466777,474045,497365,438462,598598,613083,691108,743064,906643]},
    {l:'Wellness', m:[97892,114179,80520,75076,63869,74807,97367,126899,91340,105157,101635,137916]},
    {l:'MICE', m:[12030,27078,46814,66479,53343,51534,6434,21982,43198,44198,45814,25977]},
    {l:'Ostatné (sundry)', m:[19678,19778,8878,4328,6811,6431,6431,7431,6936,6941,7311,18411]}
   ],
   total:[1648503,1896387,1159940,979466,969517,1006996,938127,1313870,1206651,1320033,1348742,2106008],
   stats:{
    avail:[4938,4236,5053,4920,4540,4405,4602,4633,4495,4695,4565,5279],
    sold:[2860,2708,2173,2116,1423,1451,1634,2390,1783,1876,1759,3167],
    guests:[7718,9905,5268,4880,5106,6154,8108,10220,7138,8301,8075,11642],
    occ:[0.59,0.73,0.43,0.43,0.50,0.52,0.54,0.68,0.58,0.57,0.56,0.61],
    adr:[311,318,211,160,172,173,158,170,178,177,177,299],
    revpar:[183,226,91,69,76,80,76,109,93,92,90,182]
   }
  };
  /* --- Prepojenie budget → Plan vo forecaste podľa kalendárneho mesiaca --- */
  var fcMonthsFull=['Január','Február','Marec','Apríl','Máj','Jún','Júl','August','September','Október','November','December'];
  /* Rooms PY – reálne 2025 mesačne (účet 1000 Accommodation, overené proti forecastu) */
  var fcPYrooms2025=[647172,761534,329198,183775,229854,137202,192200,353436,207613,317581,308912,659134];
  function fcMonthIdx(label){ var i=fcMonthsFull.indexOf((label||'').trim()); return i<0?0:i; }
  function fcMonthSelect(mi){
   var cur=fcMonthIdx(fcState.labels[mi]);
   var o='<select data-fmonth="'+mi+'" title="Mesiac – Plan sa natiahne z budgetu 2026" style="background:#26221b;color:#f0e8d6;border:1px solid #4a4234;border-radius:5px;padding:3px 6px;font:inherit">';
   for(var k=0;k<12;k++) o+='<option value="'+k+'"'+(k===cur?' selected':'')+'>'+fcMonthsFull[k]+'</option>';
   return o+'</select>';
  }
  // Mapovanie forecast riadku → hodnota budgetu pre daný mesiac (m = 0..11)
  function fcBudgetPlan(r,m){
   var B=fcBudget2026,S=B.stats;
   switch(r){
    case 4:  return B.rev[0].m[m];                // Rooms (ubytovanie)
    case 7:  return B.rev[1].m[m];                // F&B total
    case 13: return B.rev[3].m[m];                // Rental MICE
    case 17: return B.rev[2].m[m]+B.rev[4].m[m];  // Other = Wellness + Sundry
    case 26: return S.avail[m];                   // Izby k dispozícii
    case 27: return S.sold[m];                    // Izby predané
    case 28: return S.guests[m];                  // Hostia
    case 29: return Math.round(S.occ[m]*100);     // Obsadenosť %
    case 30: return S.adr[m];                     // ADR
    default: return null;
   }
  }
  function fcLoadBudgetCol(mi,m){ [4,7,13,17,26,27,28,29,30].forEach(function(r){ var v=fcBudgetPlan(r,m); if(v!=null) fcState.inp[mi+'.'+r+'.PLAN']=v; }); }
  function fcLoadPYCol(mi,m){ fcState.inp[mi+'.4.PY']=fcPYrooms2025[m]; [5,7,9,13,17,18,25,26,27,28,29,30,32,33,34].forEach(function(r){ delete fcState.inp[mi+'.'+r+'.PY']; }); }
  window.fcSetMonth=function(mi,m){ mi=+mi; m=+m; if(fcRO) return; fcState.labels[mi]=fcMonthsFull[m]; fcLoadBudgetCol(mi,m); fcLoadPYCol(mi,m); fcRenderAll(); toast(fcMonthsFull[m]+': Plán z budgetu + Rooms PY 2025'); };
  window.fcLoadBudgetAll=function(){ if(fcRO) return; for(var mi=0;mi<fcMONTHS;mi++){ var m=fcMonthIdx(fcState.labels[mi]); fcLoadBudgetCol(mi,m); fcLoadPYCol(mi,m); } fcRenderAll(); toast('Plán z budgetu + Rooms PY (všetky 3 mesiace)'); };
  function fcRenderBudget(){
   var B=fcBudget2026, M=B.months, N=12, i;
   function sum(a){ var t=0; for(var j=0;j<a.length;j++) t+=(a[j]||0); return t; }
   function ek(x){ return Math.round(x).toLocaleString('sk-SK')+' €'; }
   var s=B.stats, rrev=B.rev[0].m, totYr=sum(B.total);
   var occYr=sum(s.sold)/sum(s.avail), adrYr=sum(rrev)/sum(s.sold), revparYr=sum(rrev)/sum(s.avail);
   var bi=0,wi=0; for(i=1;i<N;i++){ if(B.total[i]>B.total[bi]) bi=i; if(B.total[i]<B.total[wi]) wi=i; }
   function qs(k){ return (k%3===0)?' qsep':''; }
   var h='<h3 class="fch">Budget 2026 – celý rok</h3>';
   h+='<div class="bkpis">'
     +'<div class="bkpi accent"><div class="l">Total Revenue 2026</div><div class="v">'+ek(totYr)+'</div><div class="s">priemer '+ek(totYr/12)+' / mes.</div></div>'
     +'<div class="bkpi"><div class="l">Najsilnejší mesiac</div><div class="v">'+fcMonthsFull[bi]+'</div><div class="s">'+ek(B.total[bi])+'</div></div>'
     +'<div class="bkpi"><div class="l">Najslabší mesiac</div><div class="v">'+fcMonthsFull[wi]+'</div><div class="s">'+ek(B.total[wi])+'</div></div>'
     +'<div class="bkpi"><div class="l">Obsadenosť (rok)</div><div class="v">'+(occYr*100).toFixed(0)+' %</div><div class="s">ADR '+ek(adrYr)+' · RevPAR '+ek(revparYr)+'</div></div>'
     +'</div>';
   h+='<div class="fcnote" style="margin:0 0 12px">Oficiálny budget 2026 (zdroj: Budget_2026, hárok Summary). Mesačne, so súčtom za celý rok.</div>'
     +'<table><thead><tr><th class="lbl">Položka (EUR)</th>';
   for(i=0;i<N;i++) h+='<th class="'+(i%3===0?'qsep':'')+'">'+M[i]+'</th>';
   h+='<th class="yr">Rok 2026</th></tr></thead><tbody>';
   B.rev.forEach(function(r){
    var c=''; for(var k=0;k<N;k++) c+='<td class="calc mono'+qs(k)+'">'+fcFmt(r.m[k])+'</td>';
    h+='<tr><td class="lbl">'+r.l+'</td>'+c+'<td class="calc mono yr">'+fcFmt(sum(r.m))+'</td></tr>';
   });
   var ct=''; for(i=0;i<N;i++) ct+='<td class="calc mono'+qs(i)+'">'+fcFmt(B.total[i])+'</td>';
   h+='<tr class="tot"><td class="lbl">Total Revenue</td>'+ct+'<td class="calc mono yr">'+fcFmt(totYr)+'</td></tr>';
   h+='<tr class="sec"><td class="lbl">Prevádzkové ukazovatele</td><td colspan="'+(N+1)+'"></td></tr>';
   function pct(x){ return (x*100).toFixed(1)+' %'; }
   function num(x){ return Math.round(x).toLocaleString('sk-SK'); }
   function statRow(label,arr,yr,fmt){ var c=''; for(var k=0;k<N;k++) c+='<td class="calc mono'+qs(k)+'">'+fmt(arr[k])+'</td>'; return '<tr><td class="lbl">'+label+'</td>'+c+'<td class="calc mono yr">'+fmt(yr)+'</td></tr>'; }
   h+=statRow('Obsadenosť %', s.occ, occYr, pct);
   h+=statRow('ADR (priem. cena izby)', s.adr, adrYr, ek);
   h+=statRow('RevPAR', s.revpar, revparYr, ek);
   h+=statRow('Izby k dispozícii', s.avail, sum(s.avail), num);
   h+=statRow('Izby predané', s.sold, sum(s.sold), num);
   h+=statRow('Hostia (sleepers)', s.guests, sum(s.guests), num);
   h+='</tbody></table>'; return h;
  }
  function fcRenderAll(){
   var tabs='<div class="fctabs">'
     +'<button type="button" class="fctab'+(fcTab==='forecast'?' on':'')+'" onclick="fcSetTab(\'forecast\')">Forecast</button>'
     +'<button type="button" class="fctab'+(fcTab==='budget'?' on':'')+'" onclick="fcSetTab(\'budget\')">Budget</button>'
     +'</div>';
   var body = (fcTab==='budget') ? fcRenderBudget() : (fcRenderMain()+fcRenderPick()+fcRenderSummary());
   document.getElementById('fcWrap').innerHTML=tabs+body; fcAttach();
  }
  window.fcSetTab=function(t){ fcTab=t; fcRenderAll(); };
  function fcAttach(){
   var W=document.getElementById('fcWrap');
   if(fcRO){ W.querySelectorAll('input,select').forEach(function(el){ el.disabled=true; el.style.background='#f3efe6'; }); return; }
   W.querySelectorAll('[data-fmonth]').forEach(function(el){ el.onchange=function(){ fcSetMonth(el.getAttribute('data-fmonth'), el.value); }; });
   W.querySelectorAll('[data-fw]').forEach(function(el){ el.onchange=function(){ var k=el.getAttribute('data-fw'); var v=fcNum(el.value)/100; if(!fcState.weights) fcState.weights={tent:0.85,inq:[0.1,0.3,0.4]}; if(k==='tent') fcState.weights.tent=v; else { if(!fcState.weights.inq) fcState.weights.inq=[0.1,0.3,0.4]; fcState.weights.inq[+k.slice(3)]=v; } fcRenderAll(); }; });
   W.querySelectorAll('[data-fk]').forEach(function(el){ el.oninput=function(){ fcState.inp[el.getAttribute('data-fk')]=el.value; fcUpdateCalcs(); }; });
   W.querySelectorAll('[data-flab]').forEach(function(el){ el.oninput=function(){ fcState.labels[+el.getAttribute('data-flab')]=el.value; }; });
   W.querySelectorAll('[data-fpk]').forEach(function(el){ el.oninput=function(){ fcState.pick[el.getAttribute('data-fpk')]=el.value; fcUpdateCalcs(); }; });
   W.querySelectorAll('[data-fsm]').forEach(function(el){ el.oninput=function(){ var p=el.getAttribute('data-fsm').split('.'); fcState.sm[+p[0]][+p[1]]=el.value; fcUpdateCalcs(); }; });
   W.querySelectorAll('[data-fotb]').forEach(function(el){ el.oninput=function(){ fcState.otb[el.getAttribute('data-fotb')]=el.value; fcUpdateCalcs(); }; });
  }
  var fcRt=null; function fcRecalc(){ if(fcRt) clearTimeout(fcRt); fcRt=setTimeout(fcRenderAll,140); }
  function fcMonday(d){ var x=new Date(d); var g=(x.getDay()+6)%7; x.setDate(x.getDate()-g); return x.toISOString().slice(0,10); }
  window.showForecast=async function(){
   fcRO = !(myRole==='admin' || myRole==='revenue');
   try{ document.getElementById('fcSaveBtn').style.display=fcRO?'none':''; document.getElementById('fcNewBtn').style.display=fcRO?'none':''; var bb=document.getElementById('fcBudgetBtn'); if(bb) bb.style.display=fcRO?'none':''; document.getElementById('fcRoNote').style.display=fcRO?'':'none'; }catch(e){}
   try{ document.getElementById('dashView').classList.remove('open'); }catch(e){}
   try{ document.getElementById('calView').classList.remove('open'); }catch(e){}
   try{ document.getElementById('dealView').classList.remove('open'); }catch(e){}
   try{ document.getElementById('view-selector').style.display='none'; document.getElementById('view-offer').style.display='none'; }catch(e){}
   document.getElementById('fcView').classList.add('open');
   await fcLoad();
  };
  window.fcClose=function(){ document.getElementById('fcView').classList.remove('open'); };
  window.fcLoad=async function(){
   var msg=document.getElementById('fcMsg');
   var r=await sbc.from('forecasts').select('*').order('forecast_date',{ascending:false}).limit(1);
   if(r.error){ msg.textContent='Chyba: '+r.error.message; return; }
   if(r.data && r.data.length){ var f=r.data[0], d=f.data||{}; if(d.labels) fcState.labels=d.labels; fcState.inp=Object.assign({},fcDefaults,d.inp||{}); fcState.pick=d.pick||{}; if(d.sm) fcState.sm=d.sm; fcState.otb=d.otb||{otb:0,budget:0}; fcState.weights=d.weights||{tent:0.85,inq:[0.1,0.3,0.4]}; fcState.date=f.forecast_date; document.getElementById('fcDate').value=f.forecast_date; msg.textContent='Načítaný týždeň '+f.forecast_date; }
   else { msg.textContent='Zatiaľ žiadny forecast – PY a Plan sú predvyplnené, doplň „As of today" a ulož.'; fcState.inp=Object.assign({},fcDefaults); document.getElementById('fcDate').value=fcMonday(new Date()); fcState.date=document.getElementById('fcDate').value; }
   fcRenderAll();
  };
  window.fcNew=function(){ var m=fcMonday(new Date()); document.getElementById('fcDate').value=m; fcState.date=m; document.getElementById('fcMsg').textContent='Nový týždeň '+m+' – uprav hodnoty a ulož (predošlé ostávajú ako východisko).'; fcRenderAll(); };
  window.fcSave=async function(){
   var date=document.getElementById('fcDate').value||fcMonday(new Date()); fcState.date=date;
   var data={labels:fcState.labels,inp:fcState.inp,pick:fcState.pick,sm:fcState.sm,otb:fcState.otb,weights:fcState.weights};
   var ex=await sbc.from('forecasts').select('id').eq('forecast_date',date).limit(1);
   var res;
   if(ex.data && ex.data.length){ res=await sbc.from('forecasts').update({data:data,updated_at:new Date().toISOString()}).eq('id',ex.data[0].id); }
   else { res=await sbc.from('forecasts').insert({forecast_date:date,title:'Forecast '+date,data:data}); }
   var msg=document.getElementById('fcMsg');
   if(res.error){ msg.textContent='Chyba: '+res.error.message; } else { msg.textContent='Uložené ✓ ('+date+')'; try{ toast('Forecast uložený ✓'); }catch(e){} }
  };

  /* ---------- BOOT ---------- */
  (async function(){
    var params=new URLSearchParams(location.search);
    if(params.get('newsletter')==='1'){ renderNewsletterSignup(); return; }
    var shareTok=params.get('share');
    if(shareTok){ try{ await renderShared(shareTok); }catch(e){ document.getElementById('sharedBadge').textContent='Chyba pri načítaní ponuky.'; } return; }
    try{ var s=await sbc.auth.getSession(); setAuthUI(!!(s.data&&s.data.session), s.data&&s.data.session?s.data.session.user.email:null); }
    catch(e){ setAuthUI(false); }
  })();
})();
