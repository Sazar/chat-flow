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
  // 7TV
  try {
    const r = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
    if (r.ok) {
      const d = await r.json();
      const emotes = d?.emote_set?.emotes || [];
      emotes.forEach(e => {
        if (!e.name || !e.data?.host?.url) return;
        const files = e.data.host.files || [];
        const f = files.find(x => x.name === '1x.webp') || files[0];
        if (f) thirdPartyEmotes[e.name] = `https:${e.data.host.url}/${f.name}`;
      });
    }
  } catch(_){}
  // BetterTTV
  try {
    const r = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
    if (r.ok) {
      const d = await r.json();
      [...(d.channelEmotes||[]), ...(d.sharedEmotes||[])].forEach(e => {
        if (e.code && e.id) thirdPartyEmotes[e.code] = `https://cdn.betterttv.net/emote/${e.id}/1x`;
      });
    }
  } catch(_){}
  // FrankerFaceZ
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
  // remplace les tokens texte par les emotes 3rd party si disponibles
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

/* ---- ICÔNE ÉVÉNEMENT ---- */
function eventMark(){
  return '<span class="event-mark event-big"></span><span class="event-stack"><span class="event-mark event-sm event-top"></span><span class="event-mark event-sm event-bottom"></span></span>';
}

/* ---- AJOUT ITEM + SCROLL ---- */
function addItem({type='chat', name='viewer', text='', badges=[], color='', alt=false, kind='', data=null, isTest=false}) {
  const feed = document.getElementById('feed');
  const el   = document.createElement('div');
  el.className = `item ${type === 'event' ? 'event' : ''} ${alt ? 'alt' : ''}`;
  const body  = renderText(data || { text }, isTest);
  const nameColor = color || 'inherit';

  el.innerHTML = type === 'event'
    ? `<div class="topline"><span class="icon">${eventMark()}</span><span class="name" style="color:${esc(nameColor)}">${esc(name)}</span><span class="kind">${esc(kind)}</span></div>`
    : `<div class="topline"><span class="name" style="color:${esc(nameColor)}">${esc(name)}</span><span class="badges">${badgeIcons(badges)}</span></div><div class="bubble">${body}</div>`;

  feed.appendChild(el);

  // Limite le nombre de messages
  while (feed.children.length > maxItems) feed.removeChild(feed.firstElementChild);

  // Scroll automatique vers le bas
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
    { type:'chat',  name:'HS_Hero',          text:"I'm dying of laughter Kappa LUL PogChamp", badges: TEST_BADGES },
    { type:'event', name:'ApexAce',           text:'new subscriber!',                           kind:'SUB'   },
    { type:'chat',  name:'RocketRacer',       text:'So close! BibleThump ResidentSleeper',      badges: TEST_BADGES },
    { type:'event', name:'PixelPirate',       text:'a follow',                                  kind:'FOLLOW'},
    { type:'chat',  name:'SpeedrunSultan',    text:'This game is intense monkaS KEKW',          badges: TEST_BADGES },
    { type:'event', name:'OverwatchOutlaw',   text:'raid avec 12',                              kind:'RAID'  }
  ];
  seq.forEach((it, i) => setTimeout(() => {
    addItem({ ...it, color: nameColor, alt: i % 2 === 1, data: { text: it.text }, isTest: true });
  }, i * 750));
}

/* ---- STREAMELEMENTS EVENTS ---- */
window.addEventListener('onWidgetLoad', obj => {
  fd = obj.detail.fieldData || {};
  maxItems = Math.max(1, parseInt(fd.maxItems || 11, 10));
  applyThemeVars();

  // Charge les emotes 3rd party via l'ID de chaîne SE
  const ch = obj.detail.channel;
  if (ch?.providerId) loadThirdPartyEmotes(ch.providerId);

  if (fd.testMessages) setTimeout(testSequence, 300);
});

window.addEventListener('onEventReceived', obj => {
  const listener = obj.detail.listener;
  const event    = obj.detail.event || {};
  const data     = event.data || event;
  const nameColor = data.displayColor || data.color || fd.nameText || 'inherit';

  if (listener === 'message') {
    if (fd.hideCommands && String(data.text || '').startsWith('!')) return;
    addItem({
      type: 'chat',
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
  if (listener === 'follower-latest')   addItem({ type:'event', name:evName, kind:'FOLLOW', color:evColor, data:{ text:'' } });
  if (listener === 'subscriber-latest') addItem({ type:'event', name:evName, kind:'SUB',    color:evColor, data:{ text:'' } });
  if (listener === 'cheer-latest')      addItem({ type:'event', name:evName, kind:`CHEER ${event.amount||''}`,  color:evColor, data:{ text:'' } });
  if (listener === 'raid-latest')       addItem({ type:'event', name:evName, kind:`RAID ${event.amount||''}`,   color:evColor, data:{ text:'' } });
  if (listener === 'tip-latest')        addItem({ type:'event', name:evName, kind:`TIP ${event.amount||''}${event.currency||''}`, color:evColor, data:{ text:'' } });
});
