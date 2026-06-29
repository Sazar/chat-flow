let fd = {};
let maxItems = 11;
let thirdPartyEmotes = {};
let widgetLoaded = false;

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function resolveNameColor(twitchColor) {
  if (fd.useTwitchColor === true && twitchColor) return twitchColor;
  return fd.nameText || 'inherit';
}

function getEventAnimClass(){
  var anim = String(fd.eventAnim || 'slide').toLowerCase();
  var valid = ['slide','pop','bounce','flip','glow'];
  return 'anim-' + (valid.includes(anim) ? anim : 'slide');
}

function applyThemeVars(){
  var w = document.getElementById('widget');
  var theme = String(fd.theme || 'monster').toLowerCase();
  w.className = 'theme-' + theme;
  var root = document.documentElement;
  root.style.setProperty('--scale', fd.scale || 1);
  if (fd.fontFamily) root.style.setProperty('--font', fd.fontFamily);
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
}

/* ---- BADGES ---- */
function badgeIcons(badges){
  if (!Array.isArray(badges)) return '';
  return badges.map(function(b){
    var url = typeof b === 'string' ? b : b.image_url_1x || b.imageUrl1x || b.url || b.image || '';
    return url ? '<img class="badge" src="' + esc(url) + '" alt="" onerror="this.remove()">' : '';
  }).join('');
}

/* ---- EMOTES TWITCH ---- */
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

/* ---- EMOTES 3RD PARTY ---- */
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

function injectThirdParty(html){
  return html.replace(/([^<>\s]+)/g,function(tok){
    if(thirdPartyEmotes[tok]) return '<img class="emote" src="'+esc(thirdPartyEmotes[tok])+'" alt="'+esc(tok)+'" onerror="this.remove()">';
    return tok;
  });
}

function parseTestEmotes(text){
  var tokens=[['Kappa','25'],['LUL','425618'],['PogChamp','88'],['BibleThump','33'],['ResidentSleeper','245'],['monkaS','200607'],['KEKW','62835']];
  var out=esc(String(text||''));
  tokens.forEach(function(p){
    out=out.replace(new RegExp('\\b'+p[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'),
      '<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/'+p[1]+'/default/dark/3.0" alt="'+p[0]+'" onerror="this.remove()">');
  });
  return out.replace(/\n/g,'<br>');
}

/* ---- MENTIONS ---- */
function hasMention(text){
  return /@\w+/.test(String(text||''));
}
function highlightMentionText(html){
  return html.replace(/@(\w+)/g,'<span class="mention-tag">@$1</span>');
}

function renderText(data, isTest, applyMentionHighlight){
  var rawText=String(data.text||data.messageRaw||(data.message&&data.message.text)||'');
  var html;
  if(isTest){
    html = parseTestEmotes(rawText);
  } else {
    var fromDirect=renderFromPositions(rawText,data&&data.emotes,function(em){
      if(em.urls) return em.urls['2']||em.urls['1']||em.urls['4']||Object.values(em.urls)[0]||'';
      if(em.id)   return 'https://static-cdn.jtvnw.net/emoticons/v2/'+em.id+'/default/dark/3.0';
      return '';
    });
    if(fromDirect){ html = injectThirdParty(fromDirect); }
    else {
      var fromFragments=renderFragments(data.message||data);
      html = fromFragments ? injectThirdParty(fromFragments) : injectThirdParty(esc(rawText).replace(/\n/g,'<br>'));
    }
  }
  if(applyMentionHighlight) html = highlightMentionText(html);
  return html;
}

/* ---- ICONE PRIME base64 ---- */
var PRIME_B64 = 'data:image/svg+xml;base64,' + btoa('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.609 13.5616L21.8382 11.1263C22.0182 9.2137 22.1082 8.25739 21.781 7.86207C21.604 7.64823 21.3633 7.5172 21.106 7.4946C20.6303 7.45282 20.0329 8.1329 18.8381 9.49307C18.2202 10.1965 17.9113 10.5482 17.5666 10.6027C17.3757 10.6328 17.1811 10.6018 17.0047 10.5131C16.6865 10.3529 16.4743 9.91812 16.0499 9.04851L13.8131 4.46485C13.0112 2.82162 12.6102 2 12 2C11.3898 2 10.9888 2.82162 10.1869 4.46486L7.95007 9.04852C7.5257 9.91812 7.31351 10.3529 6.99526 10.5131C6.81892 10.6018 6.62434 10.6328 6.43337 10.6027C6.08872 10.5482 5.77977 10.1965 5.16187 9.49307C3.96708 8.1329 3.36968 7.45282 2.89399 7.4946C2.63666 7.5172 2.39598 7.64823 2.21899 7.86207C1.8918 8.25739 1.9818 9.2137 2.16181 11.1263L2.391 13.5616C2.76865 17.5742 2.95748 19.5805 4.14009 20.7902C5.32271 22 7.09517 22 10.6401 22H13.3599C16.9048 22 18.6773 22 19.8599 20.7902C21.0425 19.5805 21.2313 17.5742 21.609 13.5616Z" fill="#00b4ff"/></svg>');

/* ---- ICONES ---- */
var EVENT_ICONS = {
  FOLLOW:      String.fromCodePoint(0x1F49C),
  SUB:         String.fromCodePoint(0x2B50),
  SUB_T2:      String.fromCodePoint(0x1F31F),
  SUB_T3:      String.fromCodePoint(0x1F48E),
  RESUB:       String.fromCodePoint(0x2B50),
  RESUB_T2:    String.fromCodePoint(0x1F31F),
  RESUB_T3:    String.fromCodePoint(0x1F48E),
  SUB_PRIME:   null,
  RESUB_PRIME: null,
  GIFT:        String.fromCodePoint(0x1F381),
  CGIFT:       String.fromCodePoint(0x1F381),
  CHEER:       String.fromCodePoint(0x1F48E),
  RAID:        String.fromCodePoint(0x2694)+String.fromCodePoint(0xFE0F),
  TIP:         String.fromCodePoint(0x1F4B8),
};

function kindLabel(kind){
  return {SUB:'SUB',SUB_T2:'SUB T2',SUB_T3:'SUB T3',SUB_PRIME:'PRIME',
          RESUB:'RESUB',RESUB_T2:'RESUB T2',RESUB_T3:'RESUB T3',RESUB_PRIME:'PRIME',
          FOLLOW:'FOLLOW',GIFT:'GIFT',CGIFT:'GIFT',CHEER:'CHEER',RAID:'RAID',TIP:'TIP'}[kind]||kind;
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
  el.className='item event ' + getEventAnimClass();

  var topline=document.createElement('div');
  topline.className='topline';

  var iconSpan=document.createElement('span');
  iconSpan.className='ev-icon';
  if(isPrime){
    var img=document.createElement('img');
    img.src=PRIME_B64;
    img.className='ev-icon-img';
    img.alt='Prime';
    iconSpan.appendChild(img);
  } else {
    iconSpan.textContent=EVENT_ICONS[kind]||String.fromCodePoint(0x2728);
  }

  var nameSpan=document.createElement('span');
  nameSpan.className='ev-name';
  nameSpan.textContent=name;

  var descSpan=document.createElement('span');
  descSpan.className='ev-desc';
  descSpan.textContent=desc;

  topline.appendChild(iconSpan);
  topline.appendChild(nameSpan);
  topline.appendChild(descSpan);

  var showKind=(fd.showEventKind===undefined)?true:(fd.showEventKind===true);
  if(showKind){
    var kindSpan=document.createElement('span');
    var tc=kindTierClass(kind);
    kindSpan.className='ev-kind'+(tc?' '+tc:'');
    kindSpan.textContent=kindLabel(kind);
    topline.appendChild(kindSpan);
  }

  el.appendChild(topline);

  if(message&&message.trim()){
    var bubble=document.createElement('div');
    bubble.className='bubble';
    bubble.innerHTML=isTest?parseTestEmotes(message):injectThirdParty(esc(message).replace(/\n/g,'<br>'));
    el.appendChild(bubble);
  }
  return el;
}

/* ---- AJOUT ITEM ---- */
function addItem(opts){
  var feed=document.getElementById('feed');
  var el;
  if(opts.type==='event'){
    el=createEventEl(opts.name||'viewer',opts.kind||'',opts.desc||'',opts.message||'',opts.isTest||false);
  } else {
    var rawText = String((opts.data&&opts.data.text)||opts.text||'');
    var doMention = (fd.highlightMentions !== false) && hasMention(rawText);
    el=document.createElement('div');
    el.className='item'+(opts.alt?' alt':'')+(doMention?' mention':'');
    var body=renderText(opts.data||{text:opts.text||''},opts.isTest||false, doMention);
    el.innerHTML='<div class="topline"><span class="name" style="color:'+esc(opts.color||'inherit')+'">'+esc(opts.name||'viewer')+'</span><span class="badges">'+badgeIcons(opts.badges||[])+'</span></div><div class="bubble">'+body+'</div>';
  }
  feed.appendChild(el);
  while(feed.children.length>maxItems) feed.removeChild(feed.firstElementChild);
  el.scrollIntoView({behavior:'smooth',block:'end'});
}

/* ---- SEQUENCE DE TEST ---- */
function testSequence(){
  var TB=[{url:'https://static-cdn.jtvnw.net/badges/v1/a3259b9d-5cfb-420a-ab9c-f8579d35c883/1'},{url:'https://static-cdn.jtvnw.net/badges/v1/963b2afc-d913-41ab-b07d-67f74854c710/1'}];
  var seq=[
    {type:'chat',  name:'HS_Hero',     text:"I'm dying Kappa LUL",              badges:TB, twitchColor:'#FF4500'},
    {type:'event', name:'ApexAce',     kind:'SUB',         desc:"s'abonne pour le 1er mois !"},
    {type:'chat',  name:'Viewer42',    text:'@HS_Hero t\'es trop fort !',        badges:[], twitchColor:'#9147ff'},
    {type:'event', name:'PrimeGuy',    kind:'SUB_PRIME',   desc:"s'abonne avec Prime pour le 1er mois !"},
    {type:'event', name:'NightOwl',    kind:'RESUB_T2',    desc:'se réabonne pour le 6ème mois !', message:'Toujours là PogChamp'},
    {type:'event', name:'LegendPro',   kind:'SUB_T3',      desc:"s'abonne pour le 1er mois !",      message:'Le meilleur stream Kappa'},
    {type:'event', name:'OldPrime',    kind:'RESUB_PRIME', desc:'se réabonne avec Prime pour le 3ème mois !'},
    {type:'chat',  name:'RocketRacer', text:'So close! BibleThump',              badges:TB, twitchColor:'#1E90FF'},
    {type:'event', name:'PixelPirate', kind:'FOLLOW',      desc:'vient de follow la chaîne !'},
    {type:'event', name:'GiftKing',    kind:'CGIFT',       desc:'offre 5 sub gifts à la communauté !'},
  ];
  seq.forEach(function(it,i){
    setTimeout(function(){
      addItem({type:it.type,name:it.name,kind:it.kind||'',desc:it.desc||'',message:it.message||'',
        color:resolveNameColor(it.twitchColor||''),alt:i%2===1,
        data:{text:it.text||''},badges:it.badges||[],isTest:true});
    },i*900);
  });
}

/* ---- STREAMELEMENTS ---- */
window.addEventListener('onWidgetLoad',function(obj){
  widgetLoaded=true;
  fd=(obj.detail&&obj.detail.fieldData)||{};
  maxItems=Math.max(1,parseInt(fd.maxItems||11,10));
  applyThemeVars();
  var ch=obj.detail&&obj.detail.channel;
  if(ch&&ch.providerId) loadThirdPartyEmotes(ch.providerId);
  if(fd.testMessages) setTimeout(testSequence,300);
});

window.addEventListener('load',function(){
  setTimeout(function(){if(!widgetLoaded){applyThemeVars();testSequence();}},500);
});

window.addEventListener('onEventReceived',function(obj){
  var listener=obj.detail.listener;
  var event=(obj.detail.event)||{};
  var data=event.data||event;

  if(listener==='message'){
    if(fd.hideCommands&&String(data.text||'').startsWith('!')) return;
    var tc=(fd.useTwitchColor===true)?(data.displayColor||data.color||''):'';
    addItem({type:'chat',name:data.displayName||data.nick||data.name||'viewer',
      badges:data.badges||[],color:resolveNameColor(tc),data:data,isTest:false});
    return;
  }

  var evName=event.name||data.displayName||data.name||'Someone';

  if(listener==='follower-latest')
    addItem({type:'event',name:evName,kind:'FOLLOW',desc:'vient de follow la chaîne !'});

  if(listener==='subscriber-latest'){
    var isBulk=data.bulkGifted===true;
    var isGifted=data.gifted===true;
    var sender=data.sender||'';
    var tierRaw=data.tier||data.subPlan||'';
    var isPrime=(tierRaw==='Prime'||tierRaw==='prime'||data.prime===true);
    var subMsg=data.message||'';
    var tierSuffix=isPrime?'_PRIME':tierRaw==='3000'?'_T3':tierRaw==='2000'?'_T2':'';
    if(isBulk){
      var qty=data.amount||1;
      addItem({type:'event',name:sender||evName,kind:'CGIFT',
        desc:'offre '+qty+' sub'+(qty>1?'s':'')+' à la communauté !'});
    } else if(isGifted){
      var recipient=data.name||data.displayName||'';
      addItem({type:'event',name:sender||evName,kind:'GIFT',
        desc:recipient?'offre un sub gift à '+recipient+' !':'offre un sub gift !'});
    } else {
      var months=parseInt(data.months||data.streak||data.amount||event.amount||1,10);
      if(isNaN(months)||months<1) months=1;
      var isResub=months>1;
      var kind=(isResub?'RESUB':'SUB')+tierSuffix;
      var monthStr=isPrime
        ?(isResub?'se réabonne avec Prime pour le '+months+'ème mois':"s'abonne avec Prime pour le 1er mois")
        :(isResub?'se réabonne pour le '+months+'ème mois':"s'abonne pour le 1er mois");
      addItem({type:'event',name:evName,kind:kind,desc:monthStr+' !',message:subMsg});
    }
  }

  if(listener==='cheer-latest')
    addItem({type:'event',name:evName,kind:'CHEER',desc:'a envoyé '+(data.amount||event.amount||'')+' bits !'});

  if(listener==='raid-latest'){
    var viewers=data.amount||data.viewers||event.amount||0;
    addItem({type:'event',name:evName,kind:'RAID',desc:'débarque avec '+viewers+' viewer'+(viewers>1?'s':'')+' !'});
  }

  if(listener==='tip-latest'){
    var tipAmount=data.amount||event.amount||'';
    var currency=data.currency||event.currency||'EUR';
    addItem({type:'event',name:evName,kind:'TIP',
      desc:'a fait un don de '+tipAmount+' '+currency+' !',message:data.message||''});
  }
});
