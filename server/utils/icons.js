// Minimal, self-contained line-icon set (24x24, stroke-based, MIT-style generic pictograms).
// Social icons are deliberately generic pictograms (camera, play, paper-plane, etc.)
// rather than exact reproductions of trademarked brand logos.

const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2.1Z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.5 8.5 0 0 1-4-1l-4.4 1 1.2-4.2a8.4 8.4 0 0 1-1.2-4.3A8.4 8.4 0 0 1 12.6 3a8.4 8.4 0 0 1 8.4 8.5Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m3 6.5 9 6.5 9-6.5"/>',
  userplus: '<path d="M14.5 19.5a6 6 0 0 0-11 0"/><circle cx="9" cy="9.5" r="4"/><path d="M19 8v6M22 11h-6"/>',
  share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 10.7 7.2-4M8.4 13.3l7.2 4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.1 6.5L12 17.5l-5.8 3 1.1-6.5-4.8-4.6 6.6-.9Z"/>',
  camera: '<rect x="2.5" y="6.5" width="19" height="14" rx="3.5"/><circle cx="12" cy="13.5" r="3.8"/><path d="M8.2 6.5 9.6 4h4.8l1.4 2.5"/>',
  thumb: '<path d="M7 21H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3m0 10V11m0 10 5.4 1.3a2 2 0 0 0 2.4-1.1l2.7-6a2 2 0 0 0-1.8-2.8H15l.7-4.3A1.7 1.7 0 0 0 14 4.5L10 11H7"/>',
  briefcase: '<rect x="2.5" y="7.5" width="19" height="12" rx="2.2"/><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M2.5 12.5h19"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5"/>',
  music: '<path d="M9 18V5.5l11-2v12"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="15.5" r="2.6"/>',
  play: '<circle cx="12" cy="12" r="9.3"/><path d="M10 8.5v7l6-3.5Z"/>',
  send: '<path d="M21.5 2.5 11 13M21.5 2.5 15 21l-4-8-8-4Z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 4.5v17"/>',
  tag: '<path d="M12.6 3H6a3 3 0 0 0-3 3v6.6a2 2 0 0 0 .6 1.4l9.4 9.4a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8L13 3.6a2 2 0 0 0-1.4-.6Z"/><circle cx="8.5" cy="8.5" r="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  utensils: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M18 3c-2 0-3 2-3 5s1 3 3 3v10"/>',
  megaphone: '<path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H6l3.5 5V5L6 10H4.5A1.5 1.5 0 0 0 3 10.5Z"/><path d="M13 7.5a5 5 0 0 1 0 9M17 5a9 9 0 0 1 0 14"/>',
  box: '<path d="m3.3 7 8.7-4.5L20.7 7 12 11.5 3.3 7Z"/><path d="M3.3 7v10L12 21.5V11.5M20.7 7v10L12 21.5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.7l2 2.5H19.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z"/>',
  link: '<path d="M9.5 14.5 14.5 9.5M8 17H6a4.5 4.5 0 0 1 0-9h2M16 7h2a4.5 4.5 0 0 1 0 9h-2"/>',
};

// icon "type" -> icon key mapping used across the public card
const TYPE_ICON_MAP = {
  instagram: 'camera', facebook: 'thumb', linkedin: 'briefcase', x: 'at',
  tiktok: 'music', youtube: 'play', telegram: 'send', pinterest: 'pin',
  website: 'globe', location: 'pin', menu: 'utensils', catalog: 'book',
  pricelist: 'tag', appointment: 'calendar', campaign: 'megaphone',
  products: 'box', portfolio: 'folder', custom: 'link',
};

function svgIcon(name, size = 20) {
  const path = ICONS[name] || ICONS.link;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function iconForType(type) {
  return svgIcon(TYPE_ICON_MAP[type] || 'link');
}

module.exports = { svgIcon, iconForType, TYPE_ICON_MAP };
