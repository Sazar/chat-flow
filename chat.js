let fd = {};
let maxItems = 11;

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
    pastel: { nameBg:'#ffccf2', nameText:'#2b2140', bubbleBg:'#f7f0ff', bubbleBg2:'#efe7ff', bubbleText:'#3b2b58' },
    night: { nameBg:'#8b5cf6', nameText:'#ffffff', bubbleBg:'#121827', bubbleBg2:'#0f172a', bubbleText:'#eef2ff' },
    candy: { nameBg:'#ff7ab6', nameText:'#ffffff', bubbleBg:'#1f2937', bubbleBg2:'#111827', bubbleText:'#f9fafb' }
  };

  const t = themes[theme] || themes.monster;
  const useCustom = !!fd.useNameBarColor;

  root.style.setProperty('--theme-name-bg', t.nameBg);
  root.style.setProperty('--theme-name-text', t.nameText);
  root.style.setProperty('--theme-bubble-bg', t.bubbleBg);
  root.style.setProperty('--theme-bubble-bg-2', t.bubbleBg2);
  root.style.setProperty('--theme-bubble-text', t.bubbleText);
  root.style.setProperty('--theme-accent', t.nameBg);
  root.style.setProperty('--theme-accent-2', t.bubbleBg2);

  root.style.setProperty('--name-bg', useCustom && fd.nameBg ? fd.nameBg : t.nameBg);
  root.style.setProperty('--name-text', t.nameText);
  root.style.setProperty('--bubble-bg', t.bubbleBg);
  root.style.setProperty('--bubble-bg-2', t.bubbleBg2);
  root.style.setProperty('--bubble-text', t.bubbleText);
  root.style.setProperty('--accent', t.nameBg);
  root.style.setProperty('--accent-2', t.bubbleBg2);
}

function badgeIcons(badges){
  return (badges || []).map(b => {
    const url = typeof b === 'string' ? b : b.url;
    return url ? `<img class="badge" src="${esc(url)}" alt="" onerror="this.remove()">` : '';
  }).join('');
}

function emoteUrlFromFragment(fragment){
  const id = fragment?.emote?.id;
  if (!id) return '';
  const animated = Array.isArray(fragment?.emote?.format) && fragment.emote.format.includes('animated');
  const fmt = animated ? 'animated' : 'static';
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/${fmt}/light/3.0`;
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
    const start = em.start ?? em.startIndex;
    const end = em.end ?? em.endIndex;
    if (start === undefined || end === undefined) continue;
    const s = Number(start), e = Number(end);
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    const altText = chars.slice(s, e + 1).join('');
    map.set(s, { end: e, html: `<img class="emote" src="${esc(url)}" alt="${esc(altText || 'emote')}" onerror="this.remove()">` });
  }

  if (!map.size) return null;

  let out = '', i = 0;
  while (i < chars.length) {
    if (map.has(i)) {
      const { end, html } = map.get(i);
      out += html;
      i = end + 1;
    } else {
      out += esc(chars[i++]);
    }
  }
  return out.replace(/\n/g, '<br>');
}

function parseTestEmotes(text){
  const tokens = [
    ['Kappa', '25'],
    ['LUL', '425618'],
    ['PogChamp', '88'],
    ['BibleThump', '33'],
    ['ResidentSleeper', '245'],
    ['monkaS', '200607'],
    ['KEKW', '62835']
  ];

  let out = esc(String(text || ''));
  for (const [word, id] of tokens) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    out = out.replace(re, `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0" alt="${word}" onerror="this.remove()">`);
  }
  return out.replace(/\n/g, '<br>');
}

function renderText(data, isTest = false){
  const rawText = String(data.text || data.messageRaw || data.message?.text || '');
  if (isTest) return parseTestEmotes(rawText);

  const fromDirect = renderFromPositions(rawText, data?.emotes, (em) => {
    if (em.urls) return em.urls['2'] || em.urls['1'] || em.urls['4'] || Object.values(em.urls)[0] || '';
    if (em.id) return `https://static-cdn.jtvnw.net/emoticons/v2/${em.id}/default/dark/3.0`;
    return '';
  });
  if (fromDirect) return fromDirect;

  const fromFragments = renderFragments(data.message || data);
  if (fromFragments) return fromFragments;

  return esc(rawText).replace(/\n/g, '<br>');
}

function eventMark(type){
  return '<span class="event-mark event-big"></span><span class="event-stack"><span class="event-mark event-sm event-top"></span><span class="event-mark event-sm event-bottom"></span></span>';
}

function addItem({type='chat', name='viewer', text='', badges=[], color='', alt=false, kind='', data=null, isTest=false}) {
  const feed = document.getElementById('feed');
  const el = document.createElement('div');
  el.className = `item ${type === 'event' ? 'event' : ''} ${alt ? 'alt' : ''}`;
  const body = renderText(data || { text }, isTest);

  el.innerHTML = type === 'event'
    ? `<div class="topline"><span class="icon">${eventMark(kind)}</span><span class="name" style="color:${esc(color || 'inherit')}">${esc(name)}</span><span class="kind">${esc(kind)}</span></div>`
    : `<div class="topline"><span class="name" style="color:${esc(color || 'inherit')}">${esc(name)}</span><span class="badges">${badgeIcons(badges)}</span></div><div class="bubble">${body}</div>`;

  feed.appendChild(el);
  while (feed.children.length > maxItems) feed.removeChild(feed.firstElementChild);
}

function testSequence(){
  const TEST_BADGES = [
    'https://static-cdn.jtvnw.net/badges/v1/a3259b9d-5cfb-420a-ab9c-f8579d35c883/1',
    'https://static-cdn.jtvnw.net/badges/v1/963b2afc-d913-41ab-b07d-67f74854c710/1'
  ];

  const seq = [
    {type:'chat', name:'HS_Hero', text:"I'm dying of laughter Kappa LUL PogChamp", badges: TEST_BADGES},
    {type:'event', name:'ApexAce', text:'new subscriber! Kappa', kind:'SUB'},
    {type:'chat', name:'RocketRacer', text:'So close! BibleThump ResidentSleeper', badges: TEST_BADGES},
    {type:'event', name:'PixelPirate', text:'a follow PogChamp', kind:'FOLLOW'},
    {type:'chat', name:'SpeedrunSultan', text:'This game is intense monkaS KEKW', badges: TEST_BADGES},
    {type:'event', name:'OverwatchOutlaw', text:'raid avec 12 Kappa', kind:'RAID'}
  ];

  seq.forEach((it, i) => setTimeout(() => {
    addItem({
      type: it.type,
      name: it.name,
      text: it.text,
      badges: it.badges || [],
      color: fd.nameText || '#111',
      alt: i % 2 === 1,
      kind: it.kind || '',
      data: { text: it.text },
      isTest: true
    });
  }, i * 750));
}

window.addEventListener('onWidgetLoad', (obj) => {
  fd = obj.detail.fieldData || {};
  maxItems = Math.max(1, parseInt(fd.maxItems || 11, 10));
  applyThemeVars();
  if (fd.testMessages) setTimeout(testSequence, 300);
});

window.addEventListener('onEventReceived', (obj) => {
  const listener = obj.detail.listener;
  const event = obj.detail.event || {};
  const data = event.data || event;

  if (listener === 'message') {
    if (fd.hideCommands && String(data.text || '').startsWith('!')) return;
    addItem({
      type:'chat',
      name: data.displayName || data.nick || data.name || 'viewer',
      text: data.text || data.messageRaw || '',
      badges: data.badges || [],
      color: data.displayColor || data.color || fd.nameText || '#111',
      alt: false,
      data,
      isTest: false
    });
    return;
  }

  if (listener === 'follower-latest') addItem({ type:'event', name:event.name || 'Someone', text:'a follow', kind:'FOLLOW', color:fd.nameText || '#111', badges: [], data: { text: 'a follow' }, isTest:false });
  if (listener === 'subscriber-latest') addItem({ type:'event', name:event.name || 'Someone', text:'new subscriber!', kind:'SUB', color:fd.nameText || '#111', badges: [], data: { text: 'new subscriber!' }, isTest:false });
  if (listener === 'cheer-latest') addItem({ type:'event', name:event.name || 'Someone', text:`a cheer ${event.amount || ''}`, kind:'CHEER', color:fd.nameText || '#111', badges: [], data: { text: `a cheer ${event.amount || ''}` }, isTest:false });
  if (listener === 'raid-latest') addItem({ type:'event', name:event.name || 'Someone', text:`raid avec ${event.amount || ''}`, kind:'RAID', color:fd.nameText || '#111', badges: [], data: { text: `raid avec ${event.amount || ''}` }, isTest:false });
  if (listener === 'tip-latest') addItem({ type:'event', name:event.name || 'Someone', text:`a tip ${event.amount || ''}`, kind:'TIP', color:fd.nameText || '#111', badges: [], data: { text: `a tip ${event.amount || ''}` }, isTest:false });
});
