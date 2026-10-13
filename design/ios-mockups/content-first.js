function focusedInbox() {
  let html = inbox('native');
  html = html.replace(
    /<div class="bottom-bar">[\s\S]*?<\/div><div class="home">/,
    `<div class="bottom-bar"><button aria-label="Mailboxes">${icon('menu')}</button><select aria-label="Inbox category"><option>Primary · 3</option><option>All mail</option><option>Updates</option><option>Social</option><option>Promotions</option></select><button data-search aria-label="Search mail">${icon('search')}</button><button class="compose" aria-label="Compose">${icon('compose')}</button></div><div class="home">`,
  );
  return html;
}
function focusedReader(index = 0) {
  const m = messages[index];
  let html = reader('native', index);
  html = html.replace(
    /<div class="reader-nav">[\s\S]*?<\/div><div class="reading">/,
    '<div class="reading">',
  );
  html = html.replace(
    `<h3>${m.subject}</h3>`,
    `<h3>${m.subject}</h3><div class="sender-summary"><strong>${m.sender}</strong><span>to me · ${m.time}</span></div>`,
  );
  html = html.replace(
    /<div class="bottom-bar">[\s\S]*?<\/div><div class="home">/,
    `<div class="bottom-bar reader-bar"><button data-back aria-label="Back to inbox">${icon('back')}</button><button aria-label="Archive">${icon('archive')}</button><button aria-label="More actions">${icon('more')}</button><button class="reply-action">${icon('reply')}Reply</button></div><div class="home">`,
  );
  return html;
}
const phones = [...document.querySelectorAll('.phone')];
phones[0].innerHTML = focusedInbox();
phones[1].innerHTML = focusedReader();
document.addEventListener(
  'click',
  (event) => {
    event.stopImmediatePropagation();
    const phone = event.target.closest('.phone');
    if (!phone) return;
    const message = event.target.closest('[data-open-message]');
    if (message) phone.innerHTML = focusedReader(Number(message.dataset.openMessage));
    if (event.target.closest('[data-back]')) phone.innerHTML = focusedInbox();
    if (event.target.closest('[data-search]')) {
      const field = phone.querySelector('.reveal-search');
      field.hidden = !field.hidden;
      if (!field.hidden) field.querySelector('input').focus();
    }
  },
  true,
);
