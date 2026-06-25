let fd = {};
let maxItems = 11;
let thirdPartyEmotes = {};

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function applyThemeVars(){
  const w = document.getElementById('widget');
  const theme = String(fd.theme || 'monster').toLowerCase();
  w.className = `theme-${theme}`;

  const root = document.documentElement;
  root.style.setProperty('--scale', fd.scale || 1);
  if (fd.fontFamily) root.style.setProperty('--font', fd.fontFamily);

  const themes = {
    monster: { nameBg:'#befe2b', nameText:'#111111', bubbleBg:'#2b2d39', bubbleBg2:'#242633', bubbleText:'#f6fbff' },
    pastel:  { nameBg:'#ffccf2', nameText:'#2b2140', bubbleBg:'#f7f0ff', bubbleBg2:'#efe7ff', bubbleText:'#3b2b58' },
    night:   { nameBg:'#8b5cf6', nameText:'#ffffff', bubbleBg:'#121827', bubbleBg2:'#0f172a', bubbleText:'#eef2ff' },
    candy:   { nameBg:'#ff7ab6', nameText:'#ffffff', bubbleBg:'#1f2937', bubbleBg2:'#111827', bubbleText:'#f9fafb' }
  };

  const t = themes[theme] || themes.monster;
  const useCustom = !!fd.useNameBarColor;

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
  return badges.map(b => {
    const url = typeof b === 'string' ? b
      : b.image_url_1x || b.imageUrl1x || b.url || b.image || '';
    return url ? `<img class="badge" src="${esc(url)}" alt="" onerror="this.remove()">` : '';
  }).join('');
}

/* ---- EMOTES TWITCH ---- */
function emoteUrlFromFragment(fragment){
  const id = fragment?.emote?.id;
  if (!id) return '';
  const animated = Array.isArray(fragment?.emote?.format) && fragment.emote.format.includes('animated');
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/${animated ? 'animated' : 'static'}/light/3.0`;
}

function renderFragments(message){
  const fr = message?.fragments;
  if (!Array.isArray(fr) || !fr.length) return null;
  return fr.map(part => {
    if (part.type === 'emote') {
      const url = emoteUrlFromFragment(part);
      return url ? `<img class="emote" src="${esc(url)}" alt="${esc(part.text || 'emote')}" onerror="this.remove()">` : esc(part.text || '');
    }
    return esc(part.text || '');
  }).join('').replace(/\n/g, '<br>');
}

function renderFromPositions(text, emotes, getUrl){
  const chars = [...String(text || '')];
  const map = new Map();
  for (const em of (emotes || [])) {
    const url = getUrl(em);
    if (!url) continue;
    const s = Number(em.start ?? em.startIndex);
    const e = Number(em.end   ?? em.endIndex);
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    const altText = chars.slice(s, e + 1).join('');
    map.set(s, { end: e, html: `<img class="emote" src="${esc(url)}" alt="${esc(altText || 'emote')}" onerror="this.remove()">` });
  }
  if (!map.size) return null;
  let out = '', i = 0;
  while (i < chars.length) {
    if (map.has(i)) { const { end, html } = map.get(i); out += html; i = end + 1; }
    else out += esc(chars[i++]);
  }
  return out.replace(/\n/g, '<br>');
}

/* ---- EMOTES 3RD PARTY (7TV / BTTV / FFZ) ---- */
async function loadThirdPartyEmotes(channelId){
  if (!channelId) return;
  try {
    const r = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
    if (r.ok) {
      const d = await r.json();
      (d?.emote_set?.emotes || []).forEach(e => {
        if (!e.name || !e.data?.host?.url) return;
        const files = e.data.host.files || [];
        const f = files.find(x => x.name === '1x.webp') || files[0];
        if (f) thirdPartyEmotes[e.name] = `https:${e.data.host.url}/${f.name}`;
      });
    }
  } catch(_){}
  try {
    const r = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
    if (r.ok) {
      const d = await r.json();
      [...(d.channelEmotes||[]), ...(d.sharedEmotes||[])].forEach(e => {
        if (e.code && e.id) thirdPartyEmotes[e.code] = `https://cdn.betterttv.net/emote/${e.id}/1x`;
      });
    }
  } catch(_){}
  try {
    const r = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
    if (r.ok) {
      const d = await r.json();
      Object.values(d.sets || {}).forEach(set => {
        (set.emoticons || []).forEach(e => {
          if (e.name && e.urls?.['1']) thirdPartyEmotes[e.name] = e.urls['1'];
        });
      });
    }
  } catch(_){}
}

/* ---- RENDU TEXTE ---- */
function injectThirdParty(html){
  return html.replace(/([^<>\s]+)/g, tok => {
    if (thirdPartyEmotes[tok])
      return `<img class="emote" src="${esc(thirdPartyEmotes[tok])}" alt="${esc(tok)}" onerror="this.remove()">`;
    return tok;
  });
}

function parseTestEmotes(text){
  const tokens = [
    ['Kappa','25'],['LUL','425618'],['PogChamp','88'],
    ['BibleThump','33'],['ResidentSleeper','245'],['monkaS','200607'],['KEKW','62835']
  ];
  let out = esc(String(text || ''));
  for (const [word, id] of tokens) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'g');
    out = out.replace(re, `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0" alt="${word}" onerror="this.remove()">`);
  }
  return out.replace(/\n/g,'<br>');
}

function renderText(data, isTest = false){
  const rawText = String(data.text || data.messageRaw || data.message?.text || '');
  if (isTest) return parseTestEmotes(rawText);
  const fromDirect = renderFromPositions(rawText, data?.emotes, em => {
    if (em.urls) return em.urls['2'] || em.urls['1'] || em.urls['4'] || Object.values(em.urls)[0] || '';
    if (em.id)   return `https://static-cdn.jtvnw.net/emoticons/v2/${em.id}/default/dark/3.0`;
    return '';
  });
  if (fromDirect) return injectThirdParty(fromDirect);
  const fromFragments = renderFragments(data.message || data);
  if (fromFragments) return injectThirdParty(fromFragments);
  return injectThirdParty(esc(rawText).replace(/\n/g,'<br>'));
}

/* ---- ICÔNES ÉVÉNEMENTS ---- */
const EVENT_ICONS = {
  FOLLOW:  '🩷',
  SUB:     '⭐',
  RESUB:   '⭐',
  GIFT:    '🎁',
  CHEER:   '💎',
  RAID:    '⚔️',
  TIP:     '💸',
};

/* ---- AJOUT ITEM + SCROLL ---- */
/*
  type  : 'chat' | 'event'
  name  : pseudo affiché
  desc  : texte descriptif affiché dans la bulle (events uniquement)
  kind  : clé de EVENT_ICONS
  text  : texte brut du message (chat uniquement, pour renderText)
  badges, color, alt, data, isTest
*/
function addItem({type='chat', name='viewer', desc='', text='', badges=[], color='', alt=false, kind='', data=null, isTest=false}) {
  const feed = document.getElementById('feed');
  const el   = document.createElement('div');
  el.className = `item ${type === 'event' ? 'event' : ''} ${alt ? 'alt' : ''}`.trim();
  const nameColor = color || 'inherit';
  const icon = EVENT_ICONS[kind] || '✨';

  if (type === 'event') {
    // Topline : icône + pseudo + badge type
    // Bulle : texte descriptif de l'event
    el.innerHTML =
      `<div class="topline">
        <span class="ev-icon">${icon}</span>
        <span class="name" style="color:${esc(nameColor)}">${esc(name)}</span>
        <span class="kind">${esc(kind)}</span>
      </div>
      <div class="bubble ev-bubble">${esc(desc)}</div>`;
  } else {
    const body = renderText(data || { text }, isTest);
    el.innerHTML =
      `<div class="topline">
        <span class="name" style="color:${esc(nameColor)}">${esc(name)}</span>
        <span class="badges">${badgeIcons(badges)}</span>
      </div>
      <div class="bubble">${body}</div>`;
  }

  feed.appendChild(el);
  while (feed.children.length > maxItems) feed.removeChild(feed.firstElementChild);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/* ---- SÉQUENCE DE TEST ---- */
function testSequence(){
  const TEST_BADGES = [
    { url: 'https://static-cdn.jtvnw.net/badges/v1/a3259b9d-5cfb-420a-ab9c-f8579d35c883/1' },
    { url: 'https://static-cdn.jtvnw.net/badges/v1/963b2afc-d913-41ab-b07d-67f74854c710/1' }
  ];
  const nameColor = fd.nameText || '#111';
  const seq = [
    { type:'chat',  name:'HS_Hero',        text:"I'm dying of laughter Kappa LUL PogChamp",   badges: TEST_BADGES },
    { type:'event', name:'ApexAce',        kind:'SUB',    desc:"vient de s'abonner !"                        },
    { type:'chat',  name:'RocketRacer',    text:'So close! BibleThump ResidentSleeper',         badges: TEST_BADGES },
    { type:'event', name:'PixelPirate',    kind:'FOLLOW', desc:'vient de follow la chaîne !'                },
    { type:'chat',  name:'SpeedrunSultan', text:'This game is intense monkaS KEKW',             badges: TEST_BADGES },
    { type:'event', name:'MegaRaider',     kind:'RAID',   desc:'débarque avec 42 viewers !'                 },
    { type:'event', name:'GiftKing',       kind:'GIFT',   desc:'offre 5 abonnements à la communauté !'      },
    { type:'event', name:'BitsDude',       kind:'CHEER',  desc:'a envoyé 500 bits !'                        },
  ];
  seq.forEach((it, i) => setTimeout(() => {
    addItem({ ...it, color: nameColor, alt: i % 2 === 1, data: { text: it.text || '' }, isTest: true });
  }, i * 800));
}

/* ---- STREAMELEMENTS EVENTS ---- */
window.addEventListener('onWidgetLoad', obj => {
  fd = obj.detail.fieldData || {};
  maxItems = Math.max(1, parseInt(fd.maxItems || 11, 10));
  applyThemeVars();
  const ch = obj.detail.channel;
  if (ch?.providerId) loadThirdPartyEmotes(ch.providerId);
  if (fd.testMessages) setTimeout(testSequence, 300);
});

window.addEventListener('onEventReceived', obj => {
  const listener = obj.detail.listener;
  const event    = obj.detail.event || {};
  const data     = event.data || event;
  const nameColor = data.displayColor || data.color || fd.nameText || 'inherit';

  /* --- Messages chat --- */
  if (listener === 'message') {
    if (fd.hideCommands && String(data.text || '').startsWith('!')) return;
    addItem({
      type:   'chat',
      name:   data.displayName || data.nick || data.name || 'viewer',
      badges: data.badges || [],
      color:  nameColor,
      data,
      isTest: false
    });
    return;
  }

  const evName  = event.name || data.displayName || data.name || 'Someone';
  const evColor = fd.nameText || 'inherit';

  /* --- Follow --- */
  if (listener === 'follower-latest') {
    addItem({ type:'event', name:evName, kind:'FOLLOW', color:evColor,
      desc: 'vient de follow la chaîne !' });
  }

  /* --- Sub / Resub --- */
  if (listener === 'subscriber-latest') {
    const months = data.months || data.streak || data.amount || 1;
    const isResub = months > 1;
    const tierRaw = data.tier || data.subPlan || '';
    const tier = tierRaw === '3000' ? ' [Tier 3 👑]' : tierRaw === '2000' ? ' [Tier 2 ⭐]' : '';
    const userMsg = data.message ? ` — "${data.message}"` : '';
    const desc = isResub
      ? `se réabonne pour le ${months}ème mois !${tier}${userMsg}`
      : `vient de s'abonner !${tier}${userMsg}`;
    addItem({ type:'event', name:evName, kind: isResub ? 'RESUB' : 'SUB', color:evColor, desc });
  }

  /* --- Gift sub --- */
  if (listener === 'subgift-latest') {
    const recipient = data.recipient || data.recipientDisplayName || '';
    const desc = recipient
      ? `offre un abonnement à ${recipient} !`
      : 'offre un abonnement à la communauté !';
    addItem({ type:'event', name:evName, kind:'GIFT', color:evColor, desc });
  }

  /* --- Cheer / Bits --- */
  if (listener === 'cheer-latest') {
    const amount = data.amount || event.amount || '';
    addItem({ type:'event', name:evName, kind:'CHEER', color:evColor,
      desc: `a envoyé ${amount} bits !` });
  }

  /* --- Raid --- */
  if (listener === 'raid-latest') {
    const viewers = data.amount || data.viewers || event.amount || '';
    addItem({ type:'event', name:evName, kind:'RAID', color:evColor,
      desc: `débarque avec ${viewers} viewer${viewers > 1 ? 's' : ''} !` });
  }

  /* --- Tip / Don --- */
  if (listener === 'tip-latest') {
    const amount   = data.amount || event.amount || '';
    const currency = data.currency || event.currency || '€';
    const userMsg  = data.message ? ` — "${data.message}"` : '';
    addItem({ type:'event', name:evName, kind:'TIP', color:evColor,
      desc: `a fait un don de ${amount} ${currency} !${userMsg}` });
  }
});
