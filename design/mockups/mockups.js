const paths = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  inbox: '<path d="m4 4-2 10v6h20v-6L20 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.3-.9Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/>',
  edit: '<path d="m16 3 5 5-12 12H4v-5Z"/><path d="m14 5 5 5"/>',
  tag: '<path d="M20 14 10 4H4v6l10 10Z"/><circle cx="7.5" cy="7.5" r=".6"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
  trash: '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sliders: '<path d="M3 7h10M17 7h4M3 17h4M11 17h10"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 7a8 8 0 1 0 1 8M20 3v5h-5"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2V12Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3 3-1 3 1 1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3-3 1Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-5"/>',
  paperclip: '<path d="m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3M5 16 16 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  reply: '<path d="m9 4-6 6 6 6M3 10h9a9 9 0 0 1 9 9"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  sparkle: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
};
function icon(name, extra = '') { return `<svg class="icon ${extra}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.mail}</svg>`; }
function tool(name, label, action = 'notice') { return `<button class="tool-button" type="button" aria-label="${label}" title="${label}" data-action="${action}">${icon(name)}</button>`; }
const directions = {
  monochrome: { number: '01', name: 'Crisp monochrome', description: 'A restrained palette, clear hierarchy, and almost no visual decoration.', subtitle: 'Monday, October 5', notes: 'Graphite · paper white · precise typography' },
  macos: { number: '02', name: 'Native macOS', description: 'A soft, layered desktop feel with frosted navigation and familiar blue controls.', subtitle: 'Personal mailbox', notes: 'Frosted surfaces · cool blue · native details' },
  superhuman: { number: '03', name: 'Superhuman-inspired', description: 'A dark, focused workspace with crisp type, compact rows, and shortcuts close at hand.', subtitle: 'Your focus, uninterrupted.', notes: 'Ink navy · subtle violet · keyboard-first cues' },
  editorial: { number: '04', name: 'Warm editorial', description: 'An ivory canvas, expressive serif headings, and breathing room for correspondence.', subtitle: 'A little room for the people who matter.', notes: 'Ivory · terracotta · an editorial rhythm' },
  material: { number: '05', name: 'Modern Material', description: 'Soft blue surfaces, rounded controls, and a colorful, approachable Gmail-like feel.', subtitle: 'A good day starts with a clear inbox.', notes: 'Cloud blue · color-coded labels · generous curves' },
};
const messages = [
  { id: 1, sender: 'Nora Chen', initials: 'NC', subject: 'The photos from our trip', snippet: 'Finally went through the camera roll. A few favorites attached. That afternoon light was something else.', time: '10:42 AM', category: 'primary', unread: true, starred: false, attachment: true, label: 'Personal', color: 'purple', count: 3 },
  { id: 2, sender: 'Studio North', initials: 'SN', subject: 'A first look at the new direction', snippet: 'Sharing the first sketches for our next chapter. Would love to hear your thoughts.', time: '10:18 AM', category: 'primary', unread: true, starred: true, attachment: true, label: 'Work', color: 'blue' },
  { id: 3, sender: 'Sam Rivera', initials: 'SR', subject: 'A little plan for the weekend', snippet: 'There’s a new coffee spot by the river. Want to give it a try on Saturday?', time: '9:56 AM', category: 'primary', unread: true, starred: false, attachment: false, label: '', color: 'green' },
  { id: 4, sender: 'Maya Patel', initials: 'MP', subject: 'A book you might like', snippet: 'Just finished the book I mentioned. I think you’d love it. I can drop it off tomorrow.', time: '9:24 AM', category: 'primary', unread: true, starred: false, attachment: false, label: '', color: 'orange' },
  { id: 5, sender: 'Oliver James', initials: 'OJ', subject: 'Dinner on Thursday?', snippet: 'We’re making pasta. Come around seven if you’re free — we have the rest covered.', time: 'Yesterday', category: 'primary', unread: false, starred: true, attachment: false, label: 'Personal', color: 'purple', count: 2 },
  { id: 6, sender: 'Emma Wilson', initials: 'EW', subject: 'Quick catch-up next week', snippet: 'It’s been too long. Do you have a free morning next week for a walk?', time: 'Yesterday', category: 'primary', unread: false, starred: false, attachment: false, label: '', color: 'green' },
  { id: 7, sender: 'Julian Park', initials: 'JP', subject: 'Notes from today', snippet: 'A couple of things to keep in mind from our conversation. Putting them in one place.', time: 'Oct 3', category: 'primary', unread: false, starred: false, attachment: true, label: 'Work', color: 'blue' },
  { id: 8, sender: 'Leah Brooks', initials: 'LB', subject: 'A small thank you', snippet: 'Thank you for your help yesterday. It made a real difference. Lunch is on me next time.', time: 'Oct 3', category: 'primary', unread: false, starred: false, attachment: false, label: '', color: 'orange' },
  { id: 9, sender: 'Theo Martin', initials: 'TM', subject: 'The playlist I promised', snippet: 'A few tracks for slower mornings. Hope you find something you like.', time: 'Oct 2', category: 'primary', unread: false, starred: false, attachment: false, label: '', color: 'blue' },
  { id: 10, sender: 'Field Notes', initials: 'FN', subject: 'The Sunday newsletter', snippet: 'This week: a slower pace, a few good reads, and a recipe worth keeping.', time: 'Oct 2', category: 'promotions', unread: false, starred: false, attachment: false, label: '', color: 'green' },
  { id: 11, sender: 'Bookshop', initials: 'B', subject: 'Your receipt is here', snippet: 'Thanks for supporting independent bookstores. Your receipt is attached.', time: 'Oct 1', category: 'updates', unread: false, starred: false, attachment: true, label: 'Receipts', color: 'orange' },
  { id: 12, sender: 'LinkedIn', initials: 'LI', subject: 'Nora sent you a connection request', snippet: 'Stay in touch with the people in your circle.', time: 'Oct 1', category: 'social', unread: false, starred: false, attachment: false, label: '', color: 'blue' },
];
const folders = [['inbox', 'Inbox', 'inbox', '4'], ['starred', 'Starred', 'star', ''], ['snoozed', 'Snoozed', 'clock', ''], ['sent', 'Sent', 'send', ''], ['drafts', 'Drafts', 'edit', '2'], ['all', 'All mail', 'archive', ''], ['trash', 'Trash', 'trash', '']];
const categories = [['primary', 'Primary', 'inbox', 'People & conversations'], ['promotions', 'Promotions', 'tag', 'Newsletters & offers'], ['social', 'Social', 'people', 'Your connections'], ['updates', 'Updates', 'bell', 'Receipts & notifications']];
const params = new URLSearchParams(location.search);
let style = params.get('style') in directions ? params.get('style') : 'monochrome';
let view = params.get('view') === 'reader' ? 'reader' : 'inbox';
let folder = 'inbox', category = 'primary', query = '', activeMessage = messages[0], composeOpen = false;
let selected = new Set();
const isExport = params.get('export') === '1';
if (isExport) document.body.classList.add('export-mode');
const frame = document.getElementById('mockup');
let toastTimer;
function notify(text = 'This is a design preview. Your actual mailbox is unchanged.') {
  const toast = document.getElementById('preview-toast'); toast.textContent = text; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}
function updateDirection() {
  document.body.dataset.style = style; document.body.dataset.view = view;
  document.querySelectorAll('.style-picker button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.style === style)));
  document.querySelectorAll('.view-picker button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  document.getElementById('style-description').textContent = directions[style].description;
  const search = new URLSearchParams({ style, view }); if (isExport) search.set('export', '1');
  history.replaceState(null, '', `?${search}`);
}
function visibleMessages() {
  return messages.filter(message => {
    if (query) return `${message.sender} ${message.subject} ${message.snippet}`.toLowerCase().includes(query.toLowerCase());
    if (folder === 'starred') return message.starred;
    if (folder === 'all') return true;
    if (folder === 'inbox') return message.category === category;
    if (folder.startsWith('label:')) return message.label === folder.slice(6);
    return false;
  });
}
function title() { return query ? 'Search results' : folder.startsWith('label:') ? folder.slice(6) : folders.find(item => item[0] === folder)?.[1] || 'Inbox'; }
function render() {
  updateDirection(); const visible = visibleMessages();
  frame.innerHTML = `
    <div class="app-window ${composeOpen ? 'has-compose' : ''}">
      <div class="mac-windowbar"><div class="traffic-lights"><i></i><i></i><i></i></div><span>Mailthing</span><div>${tool('grid', 'Window options')}</div></div>
      <header class="app-topbar">
        <div class="brand-area">${tool('menu', 'Mailbox navigation')}<a class="app-brand" href="#" data-action="inbox"><span class="brand-icon">${icon('mail')}</span><strong>mailthing<span class="brand-period">.</span></strong></a><span class="brand-tagline">PERSONAL MAIL</span></div>
        <div class="mail-search">${icon('search')}<input type="search" aria-label="Search sample mail" placeholder="${style === 'superhuman' ? 'Search your mail…' : 'Search mail'}" value="${query.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"/><span class="search-shortcut">⌘ K</span>${tool('sliders', 'Search options')}</div>
        <div class="topbar-end"><span class="private-indicator"><i></i>${style === 'superhuman' ? 'All systems ready' : 'Your private inbox'}</span>${tool('help', 'Help and shortcuts')}${tool('settings', 'Mailbox settings')}<button class="user-avatar" title="Alex Morgan" aria-label="Account: Alex Morgan" data-action="notice">AM</button></div>
      </header>
      <aside class="app-sidebar">
        <button class="compose-trigger" data-action="compose">${icon(style === 'material' ? 'edit' : 'plus')}<span>Compose</span><kbd>C</kbd></button>
        <span class="sidebar-section-name">MAILBOX</span>
        <nav aria-label="Preview mailbox folders">${folders.map(([id, label, name, count]) => `<button class="folder-button ${folder === id ? 'active' : ''}" data-folder="${id}" aria-label="${label}">${icon(name)}<span>${label}</span>${count && `<strong>${count}</strong>` || ''}</button>`).join('')}</nav>
        <div class="labels-heading"><span>Labels</span>${tool('plus', 'Create label')}</div>
        <nav class="label-nav" aria-label="Preview labels">${[['Work', 'blue'], ['Personal', 'purple'], ['Receipts', 'orange']].map(([label, color]) => `<button class="folder-button ${folder === `label:${label}` ? 'active' : ''}" data-folder="label:${label}"><span class="label-mark ${color}">${style === 'material' ? icon('tag') : ''}</span><span>${label}</span></button>`).join('')}</nav>
        <div class="sidebar-bottom"><div class="sidebar-note"><span class="sidebar-note-icon">${icon(style === 'editorial' ? 'sparkle' : 'shield')}</span><span><strong>${style === 'editorial' ? 'A place for your people.' : 'Yours, by design.'}</strong><small>Your server. Your inbox.</small></span></div><button class="profile" data-action="notice"><span class="profile-avatar">AM</span><span><strong>Alex Morgan</strong><small>alex@mydomain.com</small></span>${icon('down')}</button></div>
      </aside>
      <main class="app-main">${view === 'reader' ? renderReader() : renderInbox(visible)}</main>
      <aside class="material-rail">${tool('bell', 'Notifications')}${tool('clock', 'Calendar')}${tool('edit', 'Notes')}<i></i>${tool('plus', 'Add an app')}</aside>
      ${composeOpen ? renderCompose() : ''}
      <div class="app-footer"><span><i></i>${style === 'superhuman' ? 'All synced' : 'All mail is up to date'}</span><span class="footer-center">${style === 'editorial' ? 'A little less noise. A little more connection.' : 'Private by nature.'}</span><span class="footer-shortcuts"><kbd>C</kbd> Compose <kbd>/</kbd> Search <kbd>E</kbd> Archive</span></div>
    </div>`;
  bindPreview();
}
function renderInbox(visible) {
  return `<div class="mail-heading"><div><span class="editorial-overline">YOUR CORRESPONDENCE</span><h1>${title()}<span class="dark-inbox-count">${visible.length}</span></h1><p>${directions[style].subtitle}</p></div><div class="heading-end"><span class="mail-date">Monday, October 5</span><button class="read-filter" data-action="unread">${style === 'superhuman' ? 'Unread first' : 'All messages'}${icon('down')}</button><span class="editorial-flourish">✳</span></div></div>
    <div class="mail-toolbar"><label class="checkbox-label"><input type="checkbox" aria-label="Select all sample conversations" ${visible.length && visible.every(m => selected.has(m.id)) ? 'checked' : ''}/></label>${tool('down', 'Selection options')}${selected.size ? `${tool('archive', 'Archive selection')}${tool('trash', 'Delete selection')}${tool('mail', 'Mark selection as read')}${tool('tag', 'Apply label')}<span class="selection-note">${selected.size} selected</span>` : `${tool('refresh', 'Refresh sample inbox')}${tool('more', 'More actions')}`}<span class="toolbar-space"></span><span class="message-range">${visible.length ? `1–${visible.length} of ${visible.length}` : '0 conversations'}</span>${tool('back', 'Previous page')}${tool('arrow', 'Next page')}</div>
    ${folder === 'inbox' && !query ? `<div class="category-bar" role="tablist" aria-label="Preview categories">${categories.map(([id, name, symbol, description]) => `<button class="category ${category === id ? 'active' : ''}" data-category="${id}" role="tab" aria-selected="${category === id}">${icon(symbol)}<span><strong>${name}</strong><small>${description}</small></span>${id === 'primary' ? '<span class="category-count">4 new</span>' : ''}</button>`).join('')}</div>` : ''}
    <div class="inbox-rows">${visible.length ? visible.map(renderRow).join('') : `<div class="empty-preview">${icon('inbox')}<h2>A little breathing room.</h2><p>No sample conversations in this view.</p></div>`}</div>
    <div class="inbox-bottom"><span>${icon('check')}You’re all caught up on your connections.</span><span>${style === 'editorial' ? 'Take your time.' : 'Nothing urgent. Just you.'}</span></div>`;
}
function renderRow(message) {
  return `<div class="mail-row ${message.unread ? 'unread' : 'read'} ${selected.has(message.id) ? 'selected' : ''}">
    <input type="checkbox" data-select="${message.id}" aria-label="Select ${message.subject}" ${selected.has(message.id) ? 'checked' : ''}/>
    <button class="star-button ${message.starred ? 'starred' : ''}" data-star="${message.id}" aria-label="${message.starred ? 'Unstar' : 'Star'} ${message.subject}">${icon('star')}</button>
    <button class="message-link" data-message="${message.id}"><span class="sender-avatar ${message.color}">${message.initials}</span><span class="sender-name">${message.sender}${message.count ? `<small>${message.count}</small>` : ''}</span><span class="mail-content">${message.label ? `<span class="row-label ${message.color}">${message.label}</span>` : ''}<strong>${message.subject}</strong><span class="mail-snippet"> — ${message.snippet}</span></span><span class="row-end">${message.attachment ? icon('paperclip') : '<span class="attachment-spacer"></span>'}<time>${message.time}</time>${message.unread ? '<i class="unread-dot"></i>' : ''}</span></button>
  </div>`;
}
function renderReader() {
  const message = activeMessage;
  const nora = message.id === 1;
  return `<div class="reading-toolbar">${tool('back', 'Back to inbox', 'inbox')}<span class="tool-divider"></span>${tool('archive', 'Archive conversation')}${tool('trash', 'Trash conversation')}${tool('mail', 'Mark unread')}<span class="tool-divider"></span>${tool('clock', 'Snooze conversation')}${tool('tag', 'Conversation labels')}${tool('more', 'More conversation actions')}<span class="toolbar-space"></span><span class="reading-position">1 of 9</span>${tool('back', 'Previous conversation')}${tool('arrow', 'Next conversation')}</div>
    <div class="reading-scroll"><div class="reading-heading"><span class="editorial-overline">A NOTE FROM ${message.sender.toUpperCase()}</span><h1>${message.subject}</h1><div><span class="reading-folder">Inbox</span>${message.label ? `<span class="reading-label ${message.color}">${message.label}</span>` : ''}<span class="reading-count">${nora ? '3 messages' : '1 message'}</span></div></div>
    ${nora ? `<div class="earlier-message"><span class="sender-avatar blue">AM</span><strong>Alex Morgan</strong><span>These are going to be wonderful. Can’t wait to see them!</span><time>Oct 3</time>${icon('down')}</div><div class="earlier-message"><span class="sender-avatar purple">NC</span><strong>Nora Chen</strong><span>I’ll send them over once I’ve gone through the last few.</span><time>Oct 4</time>${icon('down')}</div>` : ''}
    <article class="open-message"><div class="sender-avatar large ${message.color}">${message.initials}</div><div class="open-message-content"><header><div><strong>${message.sender}</strong><span>&lt;${message.sender.toLowerCase().replaceAll(' ', '.')}@example.com&gt;</span></div><time>${message.time}</time><button class="star-button ${message.starred ? 'starred' : ''}" data-star="${message.id}" aria-label="Star conversation">${icon('star')}</button>${tool('reply', 'Reply', 'compose')}</header><div class="recipient-line">to me ${icon('down')}</div>
    <div class="email-body">${nora ? `<p>Hi Alex,</p><p>Finally went through the camera roll. I’ve attached a few favorites —<br class="desktop-break" /> that afternoon light was something else.</p><p>Looking at these brought me right back to that little café on the corner.<br class="desktop-break" /> We should find an excuse to do it all again soon.</p><p>Hope they bring a little brightness to your Monday.</p><p>Nora <span class="signature-flower">✳</span></p>` : `<p>Hi Alex,</p><p>${message.snippet}</p><p>Let me know what you think. Hope your week is off to a good start.</p><p>${message.sender.split(' ')[0]}</p>`}</div>
    ${message.attachment ? `<div class="attachments-heading">${icon('paperclip')}<span>${nora ? '2 attachments' : '1 attachment'}</span><button data-action="notice">Download all ${icon('download')}</button></div><div class="attachment-cards"><button class="attachment-card" data-action="notice"><span class="attachment-art photo-art"><i></i><b></b><em></em></span><span><strong>${nora ? 'afternoon-light.jpg' : 'first-sketches.pdf'}</strong><small>${nora ? '2.4 MB · Image' : '1.8 MB · Document'}</small></span>${icon('download')}</button>${nora ? `<button class="attachment-card" data-action="notice"><span class="attachment-art document-art">${icon('paperclip')}</span><span><strong>trip-notes.pdf</strong><small>184 KB · Document</small></span>${icon('download')}</button>` : ''}</div>` : ''}
    <div class="reply-buttons"><button class="reply-primary" data-action="compose">${icon('reply')}Reply<kbd>R</kbd></button><button data-action="compose">${icon('arrow')}Forward</button></div></div></article></div>`;
}
function renderCompose() {
  return `<section class="compose-preview" role="dialog" aria-label="Sample compose window"><header><strong>New message</strong>${tool('x', 'Close compose', 'close-compose')}</header><div class="compose-line"><span>To</span><input aria-label="Sample recipient" placeholder="Recipients"/></div><div class="compose-line"><input aria-label="Sample subject" placeholder="Subject"/></div><textarea aria-label="Sample message body" placeholder="Write something thoughtful…"></textarea><footer><button data-action="sample-send">Send ${icon('send')}</button>${tool('paperclip', 'Attach a sample file')}<span>Design preview</span>${tool('trash', 'Discard sample draft', 'close-compose')}</footer></section>`;
}
function bindPreview() {
  frame.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    switch (button.dataset.action) {
      case 'inbox': view = 'inbox'; composeOpen = false; render(); break;
      case 'compose': composeOpen = true; render(); frame.querySelector('.compose-preview input')?.focus(); break;
      case 'close-compose': composeOpen = false; render(); break;
      case 'sample-send': notify('Sample message only. Nothing is sent from this design preview.'); composeOpen = false; render(); break;
      case 'unread': query = ''; folder = 'inbox'; category = 'primary'; render(); notify('Unread conversations appear first in these previews.'); break;
      default: notify();
    }
  }));
  frame.querySelectorAll('[data-folder]').forEach(button => button.addEventListener('click', () => { folder = button.dataset.folder; query = ''; view = 'inbox'; selected.clear(); render(); }));
  frame.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.category; selected.clear(); render(); }));
  frame.querySelectorAll('[data-message]').forEach(button => button.addEventListener('click', () => { activeMessage = messages.find(message => message.id === Number(button.dataset.message)); view = 'reader'; render(); }));
  frame.querySelectorAll('[data-star]').forEach(button => button.addEventListener('click', () => { const message = messages.find(message => message.id === Number(button.dataset.star)); message.starred = !message.starred; render(); }));
  frame.querySelectorAll('[data-select]').forEach(input => input.addEventListener('change', () => { const id = Number(input.dataset.select); if (input.checked) selected.add(id); else selected.delete(id); render(); }));
  frame.querySelector('[aria-label="Select all sample conversations"]')?.addEventListener('change', event => { selected = event.target.checked ? new Set(visibleMessages().map(message => message.id)) : new Set(); render(); });
  frame.querySelector('.mail-search input')?.addEventListener('input', event => {
    const caret = event.target.selectionStart; query = event.target.value; view = 'inbox'; render();
    const input = frame.querySelector('.mail-search input'); input.focus(); if (input.type !== 'search') input.setSelectionRange(caret, caret);
  });
}
document.querySelectorAll('.style-picker button').forEach(button => button.addEventListener('click', () => { style = button.dataset.style; render(); }));
document.querySelectorAll('.view-picker button').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; activeMessage = messages[0]; render(); }));
document.getElementById('density').addEventListener('change', event => { document.body.dataset.density = event.target.value; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { composeOpen = false; view = 'inbox'; render(); }
  if (event.target.closest('input,textarea,select')) return;
  if (event.key === '/') { event.preventDefault(); frame.querySelector('.mail-search input').focus(); }
  if (event.key === 'c') { composeOpen = true; render(); }
});
render();
