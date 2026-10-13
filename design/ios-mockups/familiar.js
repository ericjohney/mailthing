paths.filter = '<circle cx="12" cy="12" r="9"/><path d="M7 9h10M9 13h6M11 17h2"/>';
paths.trash = '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>';
paths.next = '<path d="m9 5 7 7-7 7"/>';
paths.up = '<path d="m5 15 7-7 7 7"/>';
paths.chevronDown = '<path d="m5 9 7 7 7-7"/>';
function familiarInbox() {
  let html = inbox('native');
  html = html.replace(
    /<div class="inbox-nav">[\s\S]*?<\/div><div class="search/,
    `<div class="familiar-nav"><button class="back-label" aria-label="Mailboxes">${icon('back')}Mailboxes</button><select aria-label="Mailbox or category"><option>Inbox</option><option>Primary</option><option>Updates</option><option>Social</option><option>Promotions</option></select><button data-search aria-label="Search mail">${icon('search')}</button></div><div class="search`,
  );
  html = html.replace(
    /<div class="bottom-bar">[\s\S]*?<\/div><div class="home">/,
    `<div class="bottom-bar"><button data-unread aria-label="Filter unread mail">${icon('filter')}</button><span class="mail-status">Updated just now<br/><strong>3 unread</strong></span><button aria-label="Compose">${icon('compose')}</button></div><div class="home">`,
  );
  return html;
}
function familiarReader(index = 0) {
  const m = messages[index];
  let html = reader('native', index);
  html = html.replace(
    /<div class="reader-nav">[\s\S]*?<\/div><div class="reading">/,
    `<div class="familiar-nav"><button class="back-label" data-back aria-label="Back to inbox">${icon('back')}Inbox</button><div class="message-navigation"><button aria-label="Previous message">${icon('up')}</button><button aria-label="Next message">${icon('chevronDown')}</button></div></div><div class="reading">`,
  );
  html = html.replace(
    `<h3>${m.subject}</h3>`,
    `<h3>${m.subject}</h3><div class="familiar-sender"><div><strong>${m.sender}</strong><span>To: me <span class="detail-chevron">⌄</span></span></div><span class="sent-at">Today<br/>${m.time}</span></div>`,
  );
  html = html.replace(
    /<div class="bottom-bar">[\s\S]*?<\/div><div class="home">/,
    `<div class="bottom-bar reader-bar"><button aria-label="Archive">${icon('archive')}</button><button aria-label="Trash">${icon('trash')}</button><button aria-label="Reply">${icon('reply')}</button><button aria-label="More actions">${icon('more')}</button></div><div class="home">`,
  );
  return html;
}
const phones = [...document.querySelectorAll('.phone')];
phones[0].innerHTML = familiarInbox();
phones[1].innerHTML = familiarReader();
document.addEventListener(
  'click',
  (event) => {
    event.stopImmediatePropagation();
    const phone = event.target.closest('.phone');
    if (!phone) return;
    const message = event.target.closest('[data-open-message]');
    if (message) phone.innerHTML = familiarReader(Number(message.dataset.openMessage));
    if (event.target.closest('[data-back]')) phone.innerHTML = familiarInbox();
    if (event.target.closest('[data-search]')) {
      const field = phone.querySelector('.reveal-search');
      field.hidden = !field.hidden;
      if (!field.hidden) field.querySelector('input').focus();
    }
    const unread = event.target.closest('[data-unread]');
    if (unread) {
      const active = unread.getAttribute('aria-pressed') !== 'true';
      unread.setAttribute('aria-pressed', String(active));
      phone
        .querySelectorAll('.message')
        .forEach((row) => (row.hidden = active && !row.classList.contains('unread')));
    }
  },
  true,
);
