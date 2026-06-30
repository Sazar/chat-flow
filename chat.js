let fd = {};
let maxItems = 11;
let thirdPartyEmotes = {};
let widgetLoaded = false;
let eventQueue = [];
let eventQueueBusy = false;

var WIDGET_BASE_WIDTH = 600;

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function resolveNameColor(twitchColor) {
  if (fd.useTwitchColor === true && twitchColor) return twitchColor;
  return fd.nameText || 'inherit';
}

function getEventAnimClass(){
  var anim = String(fd.eventAnim || 'slide').toLowerCase();
  var valid = ['slide','pop','bounce','flip','glow','zoomleft','swing','stamp','wave'];
  return 'anim-' + (valid.includes(anim) ? anim : 'slide');
}

function getEventQueueDelay(){
  var n = parseInt(fd.eventQueueDelay, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function isHorizontalLayout(){
  var feed = document.getElementById('feed');
  return feed && feed.classList.contains('layout-horizontal');
}

/**
 * En mode horizontal, le feed est position:fixed dans l'iframe SE (600px CSS).
 * SE applique transform:scale en dehors de l'iframe — donc le feed doit faire
 * exactement WIDGET_BASE_WIDTH (600px CSS) pour couvrir toute la zone SE.
 *
 * widgetWidth (field) représente la largeur réelle de la zone configurée dans SE.
 * scale SE implicite = widgetWidth / WIDGET_BASE_WIDTH
 * Pour que le feed couvre la zone : feedWidth_CSS = widgetWidth / scale_SE = WIDGET_BASE_WIDTH
 *
 * => On force toujours 100vw (= 600px dans l'iframe SE).
 * => En preview locale (window.innerWidth > WIDGET_BASE_WIDTH), on applique widgetWidth directement.
 *
 * Mais le vrai problème n'est PAS la largeur du feed — c'est que les items
 * doivent s'étirer (flex:1 1 0) pour remplir toute la ligne. C'est géré en CSS.
 */
function fixHorizontalFeedWidth(){
  var feed = document.getElementById('feed');
  if (!feed || !feed.classList.contains('layout-horizontal')) return;

  var root = document.documentElement;

  // Dans l'iframe SE : window.innerWidth = 600px = WIDGET_BASE_WIDTH
  // 100vw couvre exactement la zone SE (SE applique le scale en dehors)
  var cssWidth = '100vw';

  // En preview locale hors SE (window.innerWidth > WIDGET_BASE_WIDTH)
  var targetWidth = parseInt(fd.widgetWidth, 10);
  if (!isNaN(targetWidth) && targetWidth > 0 && window.innerWidth > WIDGET_BASE_WIDTH + 10) {
    cssWidth = targetWidth + 'px';
  }

  root.style.setProperty('--h-feed-width', cssWidth);
}

function applyThemeVars(){
  var w = document.getElementById('widget');
  var theme = String(fd.theme || 'monster').toLowerCase();
  w.className = 'theme-' + theme;
  var root = document.documentElement;
  root.style.setProperty('--scale', fd.scale || 1);
  if (fd.fontFamily) root.style.setProperty('--font', fd.fontFamily);
  root.style.setProperty('--highlight-color', fd.highlightColor || '#f59e0b');
  var themes = {
    monster: { nameBg:'#befe2b', nameText:'#111111', bubbleBg:'#2b2d39', bubbleBg2:'#242633', bubbleText:'#f6fbff' },
    pastel:  { nameBg:'#ffccf2', nameText:'#2b2140', bubbleBg:'#f7f0ff', bubbleBg2:'#efe7ff', bubbleText:'#3b2b58' },
    night:   { nameBg:'#8b5cf6', nameText:'#ffffff', bubbleBg:'#121827', bubbleBg2:'#0f172a', bubbleText:'#eef2ff' },
    candy:   { nameBg:'#ff7ab6', nameText:'#ffffff', bubbleBg:'#1f2937', bubbleBg2:'#111827', bubbleText:'#f9fafb' }
  };
  var t = themes[theme] || themes.monster;
  var useCustom = !!fd.useNameBarColor;
  w.style.setProperty('--name-bg',   useCustom && fd.nameBg   ? fd.nameBg   : t.nameBg);
  w.style.setProperty('--name-text', useCustom && fd.nameText ? fd.nameText : t.nameText);
  root.style.setProperty('--bubble-bg',   t.bubbleBg);
  root.style.setProperty('--bubble-bg-2', t.bubbleBg2);
  root.style.setProperty('--bubble-text', t.bubbleText);

  var feed = document.getElementById('feed');
  if (feed) {
    var layout = String(fd.chatLayout || 'vertical').toLowerCase();
    if (layout === 'horizontal') {
      feed.classList.add('layout-horizontal');
      setTimeout(fixHorizontalFeedWidth, 0);
    } else {
      feed.classList.remove('layout-horizontal');
      feed.style.width = '';
      document.documentElement.style.removeProperty('--h-feed-width');
    }
  }
}

function badgeIcons(badges){
  if (!Array.isArray(badges)) return '';
  return badges.map(function(b){
    var url = typeof b === 'string' ? b : b.image_url_1x || b.imageUrl1x || b.url || b.image || '';
    return url ? '<img class="badge" src="' + esc(url) + '" alt="" onerror="this.remove()">' : '';
  }).join('');
}

function emoteUrlFromFragment(fragment){
  var id = fragment && fragment.emote && fragment.emote.id;
  if (!id) return '';
  var animated = Array.isArray(fragment.emote.format) && fragment.emote.format.includes('animated');
  return 'https://static-cdn.jtvnw.net/emoticons/v2/' + id + '/' + (animated ? 'animated' : 'static') + '/light/3.0';
}

function renderFragments(message){
  var fr = message && message.fragments;
  if (!Array.isArray(fr) || !fr.length) return null;
  return fr.map(function(part){
    if (part.type === 'emote') {
      var url = emoteUrlFromFragment(part);
      return url ? '<img class="emote" src="' + esc(url) + '" alt="' + esc(part.text||'emote') + '" onerror="this.remove()">' : esc(part.text||'');
    }
    return esc(part.text||'');
  }).join('').replace(/\n/g,'<br>');
}

function renderFromPositions(text, emotes, getUrl){
  var chars = Array.from(String(text||''));
  var map = new Map();
  (emotes||[]).forEach(function(em){
    var url = getUrl(em); if (!url) return;
    var s = Number(em.start!==undefined?em.start:em.startIndex);
    var e = Number(em.end!==undefined?em.end:em.endIndex);
    if (isNaN(s)||isNaN(e)) return;
    map.set(s,{end:e,html:'<img class="emote" src="'+esc(url)+'" alt="'+esc(chars.slice(s,e+1).join('')||'emote')+'" onerror="this.remove()">'});
  });
  if (!map.size) return null;
  var out='',i=0;
  while(i<chars.length){
    if(map.has(i)){var en=map.get(i);out+=en.html;i=en.end+1;}else out+=esc(chars[i++]);
  }
  return out.replace(/\n/g,'<br>');
}

async function loadThirdPartyEmotes(channelId){
  if(!channelId) return;
  try{
    var r=await fetch('https://7tv.io/v3/users/twitch/'+channelId);
    if(r.ok){var d=await r.json();((d&&d.emote_set&&d.emote_set.emotes)||[]).forEach(function(e){
      if(!e.name||!e.data||!e.data.host||!e.data.host.url) return;
      var files=e.data.host.files||[];var f=files.find(function(x){return x.name==='1x.webp';})||files[0];
      if(f) thirdPartyEmotes[e.name]='https:'+e.data.host.url+'/'+f.name;
    });}
  }catch(e){}
  try{
    var rb=await fetch('https://api.betterttv.net/3/cached/users/twitch/'+channelId);
    if(rb.ok){var db=await rb.json();(db.channelEmotes||[]).concat(db.sharedEmotes||[]).forEach(function(e){
      if(e.code&&e.id) thirdPartyEmotes[e.code]='https://cdn.betterttv.net/emote/'+e.id+'/1x';
    });}
  }catch(e){}
  try{
    var rff=await fetch('https://api.frankerfacez.com/v1/room/id/'+channelId);
    if(rff.ok){var dff=await rff.json();Object.values(dff.sets||{}).forEach(function(set){
      (set.emoticons||[]).forEach(function(e){if(e.name&&e.urls&&e.urls['1']) thirdPartyEmotes[e.name]=e.urls['1'];});
    });}
  }catch(e){}
}

function injectThirdPartyText(text){
  return String(text||'').split(/(\s+)/).map(function(tok){
    if (/^\s+$/.test(tok)) return tok;
    return thirdPartyEmotes[tok] ? '<img class="emote" src="'+esc(thirdPartyEmotes[tok])+'" alt="'+esc(tok)+'" onerror="this.remove()">' : esc(tok);
  }).join('').replace(/\n/g,'<br>');
}

function parseTestEmotes(text){
  var tokens=[['Kappa','25'],['LUL','425618'],['PogChamp','88'],['BibleThump','33'],['ResidentSleeper','245'],['monkaS','200607'],['KEKW','62835']];
  var out=esc(String(text||''));
  tokens.forEach(function(p){
    out=out.replace(new RegExp('\\b'+p[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'), '<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/'+p[1]+'/default/dark/3.0" alt="'+p[0]+'" onerror="this.remove()">');
  });
  return out.replace(/\n/g,'<br>');
}

function normalizeMentionTarget(){
  return String(fd.mentionTarget || '').trim().replace(/^@+/, '').toLowerCase();
}
function shouldHighlightMessage(text){
  if (fd.highlightMentions === false) return false;
  var target = normalizeMentionTarget();
  if (!target) return false;
  return new RegExp('(^|[^\\w])@' + target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?=$|[^\\w])','i').test(String(text || ''));
}
function highlightMentionText(html){
  var target = normalizeMentionTarget();
  if (!target) return html;
  var re = new RegExp('(^|[^\\w])@(' + target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')(?=$|[^\\w])','ig');
  return html.replace(re,'$1<span class="mention-tag">@$2</span>');
}
function trimReplyText(text){
  return String(text || '').replace(/\s+/g,' ').trim().slice(0, 110);
}

function extractReplyMeta(data){
  if (isHorizontalLayout()) return null;
  if (fd.showReplies === false) return null;
  var tags = data.tags || (data.message && data.message.tags) || null;
  if (tags && typeof tags === 'object') {
    var tu = tags['reply-parent-display-name'] || tags['reply-parent-user-login'] || tags['replyParentDisplayName'] || tags['replyParentUserLogin'] || '';
    var tt = tags['reply-parent-msg-body'] || tags['replyParentMsgBody'] || tags['reply-parent-message'] || '';
    if (tu || tt) return { user: tu || '?', text: trimReplyText(tt) };
  }
  var flatUser =
    data.replyParentDisplayName ||
    data.replyParentUserDisplayName ||
    data.replyParentUserLogin ||
    data.replyParentUserName ||
    data.replyParentName ||
    data['reply-parent-display-name'] ||
    data['reply-parent-user-login'] || '';
  var flatText =
    data.replyParentMessageBody ||
    data.replyParentMsgBody ||
    data.replyParentMessage ||
    data.replyParentText ||
    data['reply-parent-msg-body'] || '';
  if (flatUser || flatText) return { user: flatUser || '?', text: trimReplyText(flatText) };
  var r = data.reply || (data.message && data.message.reply) || null;
  if (r) {
    var u = r.parentDisplayName || r.parentUserDisplayName || r.parentUserLogin || r.parentUserName || r.parentName || '';
    var t = r.parentMessageBody || r.parentMsgBody || r.parentMessage || r.parentText || r.body || r.text || '';
    if (u || t) return { user: u || '?', text: trimReplyText(t) };
  }
  return null;
}

function buildReplyHtml(reply){
  if (!reply) return '';
  return '<div class="reply-ref"><div class="reply-ref-body">'+
    '<div class="reply-ref-top">\u21a9 En r\u00e9ponse \u00e0 <span class="reply-ref-user">'+esc(reply.user)+'</span></div>'+
    '<div class="reply-ref-text">'+esc(reply.text || '')+'</div>'+
    '</div></div>';
}

function renderText(data, isTest, applyMentionHighlight){
  var rawText=String(data.text||data.messageRaw||(data.message&&data.message.text)||'');
  var html;
  if(isTest){
    html = parseTestEmotes(rawText);
  } else {
    var fromDirect=renderFromPositions(rawText,data&&data.emotes,function(em){
      if(em.urls) return em.urls['2']||em.urls['1']||em.urls['4']||Object.values(em.urls)[0]||'';
      if(em.id) return 'https://static-cdn.jtvnw.net/emoticons/v2/'+em.id+'/default/dark/3.0';
      return '';
    });
    if(fromDirect) html = fromDirect;
    else {
      var fromFragments=renderFragments(data.message||data);
      html = fromFragments || injectThirdPartyText(rawText);
    }
  }
  if(applyMentionHighlight) html = highlightMentionText(html);
  return html;
}

var PRIME_B64 = 'data:image/svg+xml;base64,' + btoa('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.609 13.5616L21.8382 11.1263C22.0182 9.2137 22.1082 8.25739 21.781 7.86207C21.604 7.64823 21.3633 7.5172 21.106 7.4946C20.6303 7.45282 20.0329 8.1329 18.8381 9.49307C18.2202 10.1965 17.9113 10.5482 17.5666 10.6027C17.3757 10.6328 17.1811 10.6018 17.0047 10.5131C16.6865 10.3529 16.4743 9.91812 16.0499 9.04851L13.8131 4.46485C13.0112 2.82162 12.6102 2 12 2C11.3898 2 10.9888 2.82162 10.1869 4.46486L7.95007 9.04852C7.5257 9.91812 7.31351 10.3529 6.99526 10.5131C6.81892 10.6018 6.62434 10.6328 6.43337 10.6027C6.08872 10.5482 5.77977 10.1965 5.16187 9.49307C3.96708 8.1329 3.36968 7.45282 2.89399 7.4946C2.63666 7.5172 2.39598 7.64823 2.21899 7.86207C1.8918 8.25739 1.9818 9.2137 2.16181 11.1263L2.391 13.5616C2.76865 17.5742 2.95748 19.5805 4.14009 20.7902C5.32271 22 7.09517 22 10.6401 22H13.3599C16.9048 22 18.6773 22 19.8599 20.7902C21.0425 19.5805 21.2313 17.5742 21.609 13.5616Z" fill="#00b4ff"/></svg>');

var EVENT_ICONS = {
  FOLLOW:String.fromCodePoint(0x1F49C), SUB:String.fromCodePoint(0x2B50), SUB_T2:String.fromCodePoint(0x1F31F), SUB_T3:String.fromCodePoint(0x1F48E),
  RESUB:String.fromCodePoint(0x2B50), RESUB_T2:String.fromCodePoint(0x1F31F), RESUB_T3:String.fromCodePoint(0x1F48E),
  SUB_PRIME:null, RESUB_PRIME:null, GIFT:String.fromCodePoint(0x1F381), CGIFT:String.fromCodePoint(0x1F381), CHEER:String.fromCodePoint(0x1F48E),
  RAID:String.fromCodePoint(0x2694)+String.fromCodePoint(0xFE0F), TIP:String.fromCodePoint(0x1F4B8)
};

function kindLabel(kind){
  return {SUB:'SUB',SUB_T2:'SUB T2',SUB_T3:'SUB T3',SUB_PRIME:'PRIME',RESUB:'RESUB',RESUB_T2:'RESUB T2',RESUB_T3:'RESUB T3',RESUB_PRIME:'PRIME',FOLLOW:'FOLLOW',GIFT:'GIFT',CGIFT:'GIFT',CHEER:'CHEER',RAID:'RAID',TIP:'TIP'}[kind]||kind;
}
function kindTierClass(kind){
  if(kind==='SUB_T2'||kind==='RESUB_T2') return 'tier2';
  if(kind==='SUB_T3'||kind==='RESUB_T3') return 'tier3';
  if(kind==='SUB_PRIME'||kind==='RESUB_PRIME') return 'prime';
  return '';
}

function createEventEl(name,kind,desc,message,isTest){
  var isPrime=(kind==='SUB_PRIME'||kind==='RESUB_PRIME');
  var el=document.createElement('div');
  el.className='item event '+getEventAnimClass();
  var topline=document.createElement('div');
  topline.className='topline';
  var iconSpan=document.createElement('span');
  iconSpan.className='ev-icon';
  if(isPrime){ var img=document.createElement('img'); img.src=PRIME_B64; img.className='ev-icon-img'; img.alt='Prime'; iconSpan.appendChild(img); }
  else { iconSpan.textContent=EVENT_ICONS[kind]||String.fromCodePoint(0x2728); }
  var nameSpan=document.createElement('span'); nameSpan.className='ev-name'; nameSpan.textContent=name;
  var descSpan=document.createElement('span'); descSpan.className='ev-desc'; descSpan.textContent=desc;
  topline.appendChild(iconSpan); topline.appendChild(nameSpan); topline.appendChild(descSpan);
  var showKind=(fd.showEventKind===undefined)?true:(fd.showEventKind===true);
  if(showKind){
    var wrap=document.createElement('span');
    var tc=kindTierClass(kind);
    wrap.className='ev-kind-wrap' + (tc==='tier3' ? ' t3-wrap' : '');
    var kindSpan=document.createElement('span');
    kindSpan.className='ev-kind'+(tc?' '+tc:'');
    kindSpan.textContent=kindLabel(kind);
    wrap.appendChild(kindSpan);
    topline.appendChild(wrap);
  }
  el.appendChild(topline);
  if(message&&message.trim()){
    var bubble=document.createElement('div');
    bubble.className='bubble';
    bubble.innerHTML=isTest?parseTestEmotes(message):renderText({text:message},false,false);
    el.appendChild(bubble);
  }
  return el;
}

function removeOldestIfNeeded(feed){
  while(feed.children.length > maxItems){
    var old = feed.firstElementChild;
    if(!old) break;
    old.classList.add('removing');
    setTimeout(function(node){ if(node && node.parentNode) node.parentNode.removeChild(node); }.bind(null, old), 340);
    break;
  }
}

function addItem(opts){
  var feed=document.getElementById('feed');
  var el;
  if(opts.type==='event'){
    el=createEventEl(opts.name||'viewer',opts.kind||'',opts.desc||'',opts.message||'',opts.isTest||false);
  } else {
    var rawText = String((opts.data&&opts.data.text)||opts.text||'');
    var doMention = shouldHighlightMessage(rawText);
    var reply = isHorizontalLayout() ? null : (opts.reply || null);
    el=document.createElement('div');
    el.className='item'+(opts.alt?' alt':'')+(doMention?' mention':'')+(reply?' reply':'');
    var body=renderText(opts.data||{text:opts.text||''},opts.isTest||false,doMention);
    el.innerHTML='<div class="topline"><span class="name" style="color:'+esc(opts.color||'inherit')+'">'+esc(opts.name||'viewer')+'</span><span class="badges">'+badgeIcons(opts.badges||[])+'</span></div><div class="bubble">'+buildReplyHtml(reply)+body+'</div>';
  }
  feed.appendChild(el);
  removeOldestIfNeeded(feed);
  el.scrollIntoView({behavior:'smooth',block:'end'});
}

function enqueueEvent(opts){
  var delay = getEventQueueDelay();
  if (delay <= 0) {
    addItem(opts);
    return;
  }
  eventQueue.push(opts);
  processEventQueue();
}

function processEventQueue(){
  if (eventQueueBusy || !eventQueue.length) return;
  eventQueueBusy = true;
  var next = eventQueue.shift();
  addItem(next);
  setTimeout(function(){
    eventQueueBusy = false;
    processEventQueue();
  }, getEventQueueDelay());
}

function testSequence(){
  var TB=[{url:'https://static-cdn.jtvnw.net/badges/v1/a3259b9d-5cfb-420a-ab9c-f8579d35c883/1'},{url:'https://static-cdn.jtvnw.net/badges/v1/963b2afc-d913-41ab-b07d-67f74854c710/1'}];
  var seq=[
    {type:'chat',name:'HS_Hero',text:"I'm dying Kappa LUL",badges:TB,twitchColor:'#FF4500'},
    {type:'event',name:'ApexAce',kind:'SUB',desc:"s'abonne pour le 1er mois !"},
    {type:'chat',name:'Viewer42',text:'@streamer trop fort !',badges:[],twitchColor:'#9147ff'},
    {type:'chat',name:'NightOwl',text:"C'est tellement vrai lol",reply:{user:'HS_Hero',text:"I'm dying Kappa LUL"},badges:TB,twitchColor:'#a855f7'},
    {type:'event',name:'PrimeGuy',kind:'SUB_PRIME',desc:"s'abonne avec Prime pour le 1er mois !"},
    {type:'event',name:'NightOwl',kind:'RESUB_T2',desc:'se r\u00e9abonne pour le 6\u00e8me mois !',message:'Toujours l\u00e0 PogChamp'},
    {type:'event',name:'LegendPro',kind:'SUB_T3',desc:"s'abonne pour le 1er mois !",message:'Le meilleur stream Kappa'},
    {type:'event',name:'OldPrime',kind:'RESUB_PRIME',desc:'se r\u00e9abonne avec Prime pour le 3\u00e8me mois !'},
    {type:'chat',name:'RocketRacer',text:'So close! BibleThump',badges:TB,twitchColor:'#1E90FF'},
    {type:'event',name:'PixelPirate',kind:'FOLLOW',desc:'vient de follow la cha\u00eene !'}
  ];
  seq.forEach(function(it,i){
    setTimeout(function(){
      var payload={type:it.type,name:it.name,kind:it.kind||'',desc:it.desc||'',message:it.message||'',reply:it.reply||null,color:resolveNameColor(it.twitchColor||''),alt:i%2===1,data:{text:it.text||''},badges:it.badges||[],isTest:true};
      if(it.type==='event') enqueueEvent(payload); else addItem(payload);
    },i*300);
  });
}

window.addEventListener('onWidgetLoad',function(obj){
  widgetLoaded=true;
  fd=(obj.detail&&obj.detail.fieldData)||{};
  maxItems=Math.max(1,parseInt(fd.maxItems||11,10));
  applyThemeVars();
  var ch=obj.detail&&obj.detail.channel;
  if(ch&&ch.providerId) loadThirdPartyEmotes(ch.providerId);
  if(fd.testMessages) setTimeout(testSequence,300);
});
window.addEventListener('load',function(){ setTimeout(function(){ if(!widgetLoaded){ applyThemeVars(); testSequence(); } },500); });
window.addEventListener('resize', fixHorizontalFeedWidth);
window.addEventListener('onEventReceived',function(obj){
  var listener=obj.detail.listener, event=(obj.detail.event)||{}, data=event.data||event;
  if(listener==='message'){
    if(fd.hideCommands&&String(data.text||'').startsWith('!')) return;
    var tc=(fd.useTwitchColor===true)?(data.displayColor||data.color||''):'';
    addItem({type:'chat',name:data.displayName||data.nick||data.name||'viewer',badges:data.badges||[],color:resolveNameColor(tc),data:data,reply:extractReplyMeta(data),isTest:false});
    return;
  }
  var evName=event.name||data.displayName||data.name||'Someone';
  if(listener==='follower-latest') enqueueEvent({type:'event',name:evName,kind:'FOLLOW',desc:'vient de follow la cha\u00eene !'});
  if(listener==='subscriber-latest'){
    var isBulk=data.bulkGifted===true, isGifted=data.gifted===true, sender=data.sender||'', tierRaw=data.tier||data.subPlan||'', isPrime=(tierRaw==='Prime'||tierRaw==='prime'||data.prime===true), subMsg=data.message||'';
    var tierSuffix=isPrime?'_PRIME':tierRaw==='3000'?'_T3':tierRaw==='2000'?'_T2':'';
    if(isBulk){ var qty=data.amount||1; enqueueEvent({type:'event',name:sender||evName,kind:'CGIFT',desc:'offre '+qty+' sub'+(qty>1?'s':'')+' \u00e0 la communaut\u00e9 !'}); }
    else if(isGifted){ var recipient=data.name||data.displayName||''; enqueueEvent({type:'event',name:sender||evName,kind:'GIFT',desc:recipient?'offre un sub gift \u00e0 '+recipient+' !':'offre un sub gift !'}); }
    else {
      var months=parseInt(data.months||data.streak||data.amount||event.amount||1,10); if(isNaN(months)||months<1) months=1;
      var isResub=months>1, kind=(isResub?'RESUB':'SUB')+tierSuffix;
      var monthStr=isPrime ? (isResub?'se r\u00e9abonne avec Prime pour le '+months+'\u00e8me mois':"s'abonne avec Prime pour le 1er mois") : (isResub?'se r\u00e9abonne pour le '+months+'\u00e8me mois':"s'abonne pour le 1er mois");
      enqueueEvent({type:'event',name:evName,kind:kind,desc:monthStr+' !',message:subMsg});
    }
  }
  if(listener==='cheer-latest') enqueueEvent({type:'event',name:evName,kind:'CHEER',desc:'a envoy\u00e9 '+(data.amount||event.amount||'')+' bits !'});
  if(listener==='raid-latest'){ var viewers=data.amount||data.viewers||event.amount||0; enqueueEvent({type:'event',name:evName,kind:'RAID',desc:'d\u00e9barque avec '+viewers+' viewer'+(viewers>1?'s':'')+' !'}); }
  if(listener==='tip-latest'){ var tipAmount=data.amount||event.amount||'', currency=data.currency||event.currency||'EUR'; enqueueEvent({type:'event',name:evName,kind:'TIP',desc:'a fait un don de '+tipAmount+' '+currency+' !',message:data.message||''}); }
});
