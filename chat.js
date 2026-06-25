let fd = {};
let maxItems = 11;
let thirdPartyEmotes = {};

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/*
  resolveNameColor :
  - useTwitchColor COCHE  + couleur Twitch dispo => couleur Twitch
  - useTwitchColor DECOCHE ou pas de couleur Twitch => fd.nameText
  fd.nameText est toujours le fallback final.
*/
function resolveNameColor(twitchColor) {
  if (fd.useTwitchColor === true && twitchColor) return twitchColor;
  return fd.nameText || 'inherit';
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

  root.style.setProperty('--theme-name-bg',      t.nameBg);
  root.style.setProperty('--theme-name-text',     t.nameText);
  root.style.setProperty('--theme-bubble-bg',     t.bubbleBg);
  root.style.setProperty('--theme-bubble-bg-2',   t.bubbleBg2);
  root.style.setProperty('--theme-bubble-text',   t.bubbleText);
  root.style.setProperty('--theme-accent',        t.nameBg);
  root.style.setProperty('--theme-accent-2',      t.bubbleBg2);

  root.style.setProperty('--name-bg',     useCustom && fd.nameBg   ? fd.nameBg   : t.nameBg);
  root.style.setProperty('--name-text',   useCustom && fd.nameText ? fd.nameText : t.nameText);
  root.style.setProperty('--bubble-bg',   t.bubbleBg);
  root.style.setProperty('--bubble-bg-2', t.bubbleBg2);
  root.style.setProperty('--bubble-text', t.bubbleText);
  root.style.setProperty('--accent',      t.nameBg);
  root.style.setProperty('--accent-2',    t.bubbleBg2);
}

/* ---- BADGES ---- */
function badgeIcons(badges){
  if (!Array.isArray(badges)) return '';
  return badges.map(function(b){
    var url = typeof b === 'string' ? b
      : b.image_url_1x || b.imageUrl1x || b.url || b.image || '';
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
      return url ? '<img class="emote" src="' + esc(url) + '" alt="' + esc(part.text || 'emote') + '" onerror="this.remove()">' : esc(part.text || '');
    }
    return esc(part.text || '');
  }).join('').replace(/\n/g, '<br>');
}

function renderFromPositions(text, emotes, getUrl){
  var chars = Array.from(String(text || ''));
  var map = new Map();
  (emotes || []).forEach(function(em){
    var url = getUrl(em);
    if (!url) return;
    var s = Number(em.start !== undefined ? em.start : em.startIndex);
    var e = Number(em.end   !== undefined ? em.end   : em.endIndex);
    if (isNaN(s) || isNaN(e)) return;
    var altText = chars.slice(s, e + 1).join('');
    map.set(s, { end: e, html: '<img class="emote" src="' + esc(url) + '" alt="' + esc(altText || 'emote') + '" onerror="this.remove()">' });
  });
  if (!map.size) return null;
  var out = '', i = 0;
  while (i < chars.length) {
    if (map.has(i)) { var entry = map.get(i); out += entry.html; i = entry.end + 1; }
    else out += esc(chars[i++]);
  }
  return out.replace(/\n/g, '<br>');
}

/* ---- EMOTES 3RD PARTY (7TV / BTTV / FFZ) ---- */
async function loadThirdPartyEmotes(channelId){
  if (!channelId) return;
  try {
    var r = await fetch('https://7tv.io/v3/users/twitch/' + channelId);
    if (r.ok) {
      var d = await r.json();
      ((d && d.emote_set && d.emote_set.emotes) || []).forEach(function(e){
        if (!e.name || !e.data || !e.data.host || !e.data.host.url) return;
        var files = e.data.host.files || [];
        var f = files.find(function(x){ return x.name === '1x.webp'; }) || files[0];
        if (f) thirdPartyEmotes[e.name] = 'https:' + e.data.host.url + '/' + f.name;
      });
    }
  } catch(e){}
  try {
    var rb = await fetch('https://api.betterttv.net/3/cached/users/twitch/' + channelId);
    if (rb.ok) {
      var db = await rb.json();
      (db.channelEmotes || []).concat(db.sharedEmotes || []).forEach(function(e){
        if (e.code && e.id) thirdPartyEmotes[e.code] = 'https://cdn.betterttv.net/emote/' + e.id + '/1x';
      });
    }
  } catch(e){}
  try {
    var rff = await fetch('https://api.frankerfacez.com/v1/room/id/' + channelId);
    if (rff.ok) {
      var dff = await rff.json();
      Object.values(dff.sets || {}).forEach(function(set){
        (set.emoticons || []).forEach(function(e){
          if (e.name && e.urls && e.urls['1']) thirdPartyEmotes[e.name] = e.urls['1'];
        });
      });
    }
  } catch(e){}
}

/* ---- RENDU TEXTE ---- */
function injectThirdParty(html){
  return html.replace(/([^<>\s]+)/g, function(tok){
    if (thirdPartyEmotes[tok])
      return '<img class="emote" src="' + esc(thirdPartyEmotes[tok]) + '" alt="' + esc(tok) + '" onerror="this.remove()">';
    return tok;
  });
}

function parseTestEmotes(text){
  var tokens = [
    ['Kappa','25'],['LUL','425618'],['PogChamp','88'],
    ['BibleThump','33'],['ResidentSleeper','245'],['monkaS','200607'],['KEKW','62835']
  ];
  var out = esc(String(text || ''));
  tokens.forEach(function(pair){
    var re = new RegExp('\\b' + pair[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b','g');
    out = out.replace(re, '<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/' + pair[1] + '/default/dark/3.0" alt="' + pair[0] + '" onerror="this.remove()">');
  });
  return out.replace(/\n/g,'<br>');
}

function renderText(data, isTest){
  var rawText = String(data.text || data.messageRaw || (data.message && data.message.text) || '');
  if (isTest) return parseTestEmotes(rawText);
  var fromDirect = renderFromPositions(rawText, data && data.emotes, function(em){
    if (em.urls) return em.urls['2'] || em.urls['1'] || em.urls['4'] || Object.values(em.urls)[0] || '';
    if (em.id)   return 'https://static-cdn.jtvnw.net/emoticons/v2/' + em.id + '/default/dark/3.0';
    return '';
  });
  if (fromDirect) return injectThirdParty(fromDirect);
  var fromFragments = renderFragments(data.message || data);
  if (fromFragments) return injectThirdParty(fromFragments);
  return injectThirdParty(esc(rawText).replace(/\n/g,'<br>'));
}

/* ---- ICONES EVENEMENTS ---- */
var EVENT_ICONS = {
  FOLLOW: String.fromCodePoint(0x1F49C),
  SUB:    String.fromCodePoint(0x2B50),
  RESUB:  String.fromCodePoint(0x2B50),
  GIFT:   String.fromCodePoint(0x1F381),
  CHEER:  String.fromCodePoint(0x1F48E),
  RAID:   String.fromCodePoint(0x2694) + String.fromCodePoint(0xFE0F),
  TIP:    String.fromCodePoint(0x1F4B8),
};

/* ---- CREATION ELEMENT EVENT (une seule barre) ---- */
function createEventEl(name, kind, desc) {
  var icon = EVENT_ICONS[kind] || String.fromCodePoint(0x2728);

  var el = document.createElement('div');
  el.className = 'item event';

  var topline = document.createElement('div');
  topline.className = 'topline';

  var iconSpan = document.createElement('span');
  iconSpan.className = 'ev-icon';
  iconSpan.textContent = icon;

  var nameSpan = document.createElement('span');
  nameSpan.className = 'ev-name';
  nameSpan.textContent = name;

  var descSpan = document.createElement('span');
  descSpan.className = 'ev-desc';
  descSpan.textContent = desc;

  topline.appendChild(iconSpan);
  topline.appendChild(nameSpan);
  topline.appendChild(descSpan);
  el.appendChild(topline);

  return el;
}

/* ---- AJOUT ITEM + SCROLL ---- */
function addItem(opts) {
  var type   = opts.type   || 'chat';
  var name   = opts.name   || 'viewer';
  var desc   = opts.desc   || '';
  var text   = opts.text   || '';
  var badges = opts.badges || [];
  var color  = opts.color  || 'inherit';
  var alt    = opts.alt    || false;
  var kind   = opts.kind   || '';
  var data   = opts.data   || null;
  var isTest = opts.isTest || false;

  var feed = document.getElementById('feed');
  var el;

  if (type === 'event') {
    el = createEventEl(name, kind, desc);
  } else {
    el = document.createElement('div');
    el.className = 'item' + (alt ? ' alt' : '');
    var body = renderText(data || { text: text }, isTest);
    el.innerHTML =
      '<div class="topline">'
      + '<span class="name" style="color:' + esc(color) + '">' + esc(name) + '</span>'
      + '<span class="badges">' + badgeIcons(badges) + '</span>'
      + '</div>'
      + '<div class="bubble">' + body + '</div>';
  }

  feed.appendChild(el);
  while (feed.children.length > maxItems) feed.removeChild(feed.firstElementChild);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/* ---- SEQUENCE DE TEST ---- */
function testSequence(){
  var TEST_BADGES = [
    { url: 'https://static-cdn.jtvnw.net/badges/v1/a3259b9d-5cfb-420a-ab9c-f8579d35c883/1' },
    { url: 'https://static-cdn.jtvnw.net/badges/v1/963b2afc-d913-41ab-b07d-67f74854c710/1' }
  ];
  var seq = [
    { type:'chat',  name:'HS_Hero',        text:"I'm dying of laughter Kappa LUL PogChamp", badges: TEST_BADGES, twitchColor:'#FF4500' },
    { type:'event', name:'ApexAce',        kind:'SUB',    desc:"vient de s'abonner !" },
    { type:'chat',  name:'RocketRacer',    text:'So close! BibleThump ResidentSleeper',    badges: TEST_BADGES, twitchColor:'#1E90FF' },
    { type:'event', name:'PixelPirate',    kind:'FOLLOW', desc:'vient de follow la chaine !' },
    { type:'chat',  name:'SpeedrunSultan', text:'This game is intense monkaS KEKW',        badges: TEST_BADGES, twitchColor:'#9ACD32' },
    { type:'event', name:'MegaRaider',     kind:'RAID',   desc:'debarque avec 42 viewers !' },
    { type:'event', name:'GiftKing',       kind:'GIFT',   desc:'offre 5 abonnements a la communaute !' },
    { type:'event', name:'BitsDude',       kind:'CHEER',  desc:'a envoye 500 bits !' },
  ];
  seq.forEach(function(it, i){
    setTimeout(function(){
      var color = resolveNameColor(it.twitchColor || '');
      addItem({ type:it.type, name:it.name, kind:it.kind||'', desc:it.desc||'',
                color:color, alt: i % 2 === 1,
                data:{ text: it.text || '' }, badges: it.badges||[], isTest:true });
    }, i * 800);
  });
}

/* ---- STREAMELEMENTS EVENTS ---- */
window.addEventListener('onWidgetLoad', function(obj){
  fd = (obj.detail && obj.detail.fieldData) || {};
  maxItems = Math.max(1, parseInt(fd.maxItems || 11, 10));
  applyThemeVars();
  var ch = obj.detail && obj.detail.channel;
  if (ch && ch.providerId) loadThirdPartyEmotes(ch.providerId);
  if (fd.testMessages) setTimeout(testSequence, 300);
});

window.addEventListener('onEventReceived', function(obj){
  var listener = obj.detail.listener;
  var event    = (obj.detail.event) || {};
  var data     = event.data || event;

  if (listener === 'message') {
    if (fd.hideCommands && String(data.text || '').startsWith('!')) return;
    /*
      On passe la couleur Twitch UNIQUEMENT si useTwitchColor est coche.
      resolveNameColor gere le choix final.
    */
    var twitchColor = (fd.useTwitchColor === true)
      ? (data.displayColor || data.color || '')
      : '';
    addItem({
      type:   'chat',
      name:   data.displayName || data.nick || data.name || 'viewer',
      badges: data.badges || [],
      color:  resolveNameColor(twitchColor),
      data:   data,
      isTest: false
    });
    return;
  }

  var evName = event.name || data.displayName || data.name || 'Someone';

  if (listener === 'follower-latest') {
    addItem({ type:'event', name:evName, kind:'FOLLOW', desc:'vient de follow la chaine !' });
  }

  if (listener === 'subscriber-latest') {
    var months = data.months || data.streak || data.amount || 1;
    var isResub = months > 1;
    var tierRaw = data.tier || data.subPlan || '';
    var tier = tierRaw === '3000' ? ' [Tier 3]' : tierRaw === '2000' ? ' [Tier 2]' : '';
    var userMsg = data.message ? ' - "' + data.message + '"' : '';
    var desc = isResub
      ? 'se reabonne pour le ' + months + 'eme mois !' + tier + userMsg
      : "vient de s'abonner !" + tier + userMsg;
    addItem({ type:'event', name:evName, kind: isResub ? 'RESUB' : 'SUB', desc:desc });
  }

  if (listener === 'subgift-latest') {
    var recipient = data.recipient || data.recipientDisplayName || '';
    var giftDesc = recipient
      ? 'offre un abonnement a ' + recipient + ' !'
      : 'offre un abonnement a la communaute !';
    addItem({ type:'event', name:evName, kind:'GIFT', desc:giftDesc });
  }

  if (listener === 'cheer-latest') {
    var amount = data.amount || event.amount || '';
    addItem({ type:'event', name:evName, kind:'CHEER', desc:'a envoye ' + amount + ' bits !' });
  }

  if (listener === 'raid-latest') {
    var viewers = data.amount || data.viewers || event.amount || 0;
    addItem({ type:'event', name:evName, kind:'RAID',
      desc:'debarque avec ' + viewers + ' viewer' + (viewers > 1 ? 's' : '') + ' !' });
  }

  if (listener === 'tip-latest') {
    var tipAmount = data.amount || event.amount || '';
    var currency  = data.currency || event.currency || 'EUR';
    var tipMsg    = data.message ? ' - "' + data.message + '"' : '';
    addItem({ type:'event', name:evName, kind:'TIP',
      desc:'a fait un don de ' + tipAmount + ' ' + currency + ' !' + tipMsg });
  }
});
