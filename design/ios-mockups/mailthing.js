paths.chevronDown = '<path d="m5 9 7 7 7-7"/>';
function mailthingInbox() {
  return `${status}<div class="mailthing-nav"><button class="mailbox-button" data-mailboxes aria-label="Open mailboxes"><img src="../../web/public/brand/mailthing-mark.svg" alt="" /></button><button class="mailbox-title" data-mailboxes aria-label="Inbox and categories">Inbox${icon('chevronDown')}<span>3</span></button><div class="nav-actions"><button data-search aria-label="Search mail">${icon('search')}</button><button class="compose-action" aria-label="Compose">${icon('compose')}</button></div></div><div class="mailbox-options" hidden><select aria-label="Mailbox"><option>Inbox</option><option>Unread</option><option>Starred</option><option>Drafts</option></select><select aria-label="Category"><option>Primary</option><option>All categories</option><option>Updates</option><option>Social</option><option>Promotions</option></select></div><div class="search reveal-search" hidden>${icon('search')}<input aria-label="Search sample messages" placeholder="Search mail" /></div><div class="messages">${messages.map((m, i) => `<button class="message ${m.unread ? 'unread' : ''}" data-open-message="${i}" aria-label="Read ${m.subject}">${m.unread ? '<span class="dot"></span>' : ''}<div class="message-content"><div class="senderline"><span class="sender">${m.sender}</span><span class="date">${m.time}</span></div><div class="subject">${m.subject}</div><p class="snippet">${m.snippet}</p>${m.file ? `<span class="attachment">${icon('clip')}2 attachments</span>` : ''}</div></button>`).join('')}</div>${home}`;
}
function mailthingReader(index = 0) {
  const m = messages[index];
  let html = reader('native', index);
  html = html.replace(
    /<div class="reader-nav">[\s\S]*?<\/div><div class="reading">/,
    `<div class="mailthing-nav reader-top"><button data-back aria-label="Back to inbox">${icon('back')}</button><div class="sender-identity"><strong>${m.sender}</strong><span>to me · ${m.time}</span></div><div class="nav-actions"><button aria-label="Archive">${icon('archive')}</button><button aria-label="Reply">${icon('reply')}</button><button aria-label="More actions">${icon('more')}</button></div></div><div class="reading">`,
  );
  html = html.replace(
    /<div class="bottom-bar">[\s\S]*?<\/div><div class="home">/,
    '<div class="home">',
  );
  return html;
}
const phones = [...document.querySelectorAll('.phone')];
phones[0].innerHTML = mailthingInbox();
phones[1].innerHTML = mailthingReader();
document.addEventListener(
  'click',
  (event) => {
    event.stopImmediatePropagation();
    const phone = event.target.closest('.phone');
    if (!phone) return;
    const message = event.target.closest('[data-open-message]');
    if (message) phone.innerHTML = mailthingReader(Number(message.dataset.openMessage));
    if (event.target.closest('[data-back]')) phone.innerHTML = mailthingInbox();
    if (event.target.closest('[data-search]')) {
      const field = phone.querySelector('.reveal-search');
      field.hidden = !field.hidden;
      if (!field.hidden) field.querySelector('input').focus();
    }
    if (event.target.closest('[data-mailboxes]')) {
      const options = phone.querySelector('.mailbox-options');
      options.hidden = !options.hidden;
    }
  },
  true,
);
