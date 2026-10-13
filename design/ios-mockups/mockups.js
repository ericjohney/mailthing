const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  compose: '<path d="M13 5H5v14h14v-8M11 13l1-4 7-7 3 3-7 7-4 1Z"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  archive: '<path d="M4 8h16v12H4zM3 4h18v4H3zM10 12h4"/>',
  more: '<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
  reply: '<path d="m9 5-6 6 6 6M3 11h10c5 0 7 3 7 8"/>',
  clip: '<path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M9 13h6M9 17h6"/>',
  down: '<path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/>',
  signal: '<path d="M4 19v-3M9 19v-7M14 19V8M19 19V4" stroke-width="3"/>',
  wifi: '<path d="M3 8q9-7 18 0M6 12q6-5 12 0M9 16q3-3 6 0M12 20h.01"/>',
  battery:
    '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M5 10h12v4H5z" fill="currentColor" stroke="none"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const messages = [
  {
    sender: 'Sam Rivera',
    time: '9:24',
    subject: 'A little escape this weekend',
    snippet: 'Found a cabin near the trail we loved. Want to head up Saturday?',
    unread: true,
    initials: 'SR',
  },
  {
    sender: 'Maya Chen',
    time: '8:51',
    subject: 'The first sketches are ready',
    snippet: 'I think we found our direction. Sending a few ideas for you to look through.',
    unread: true,
    initials: 'MC',
    file: true,
  },
  {
    sender: 'Oliver Park',
    time: '8:10',
    subject: 'Coffee next week?',
    snippet: 'That place on Maple finally opened. Tuesday morning works for me.',
    unread: true,
    initials: 'OP',
  },
  {
    sender: 'Field Notes',
    time: 'Yesterday',
    subject: 'Small things, well made',
    snippet: 'A few things worth slowing down for this month.',
    initials: 'FN',
  },
  {
    sender: 'Alex Morgan',
    time: 'Yesterday',
    subject: 'Re: Sunday dinner',
    snippet: 'Perfect. I’ll bring something for dessert.',
    initials: 'AM',
  },
  {
    sender: 'The Bookshop',
    time: 'Sun',
    subject: 'Your order is on its way',
    snippet: 'A good story will be at your door soon.',
    initials: 'TB',
  },
  {
    sender: 'Jamie Ellis',
    time: 'Sun',
    subject: 'A few photos from the coast',
    snippet: 'Finally sorted through these. What a week.',
    initials: 'JE',
  },
];
const status = `<div class="island"></div><div class="status"><span>9:41</span><span class="status-icons">${icon('signal')}${icon('wifi')}${icon('battery')}</span></div>`;
const home = '<div class="home"></div>';
function inbox(direction) {
  const dense = direction === 'compact';
  return `${status}<div class="inbox-nav"><button aria-label="Mailboxes">${icon('menu')}</button><div class="nav-title">Inbox <span>3</span></div><button data-search aria-label="Search mail">${icon('search')}</button></div><div class="search reveal-search" hidden>${icon('search')}<input aria-label="Search sample messages" placeholder="Search mail" /></div><div class="messages">${messages
    .slice(0, dense ? 7 : 5)
    .map(
      (m, i) =>
        `<button class="message ${m.unread ? 'unread' : ''}" data-open-message="${i}" aria-label="Read ${m.subject}">${m.unread ? '<span class="dot"></span>' : ''}${dense ? `<span class="avatar">${m.initials}</span>` : ''}<div class="message-content"><div class="senderline"><span class="sender">${m.sender}</span><span class="date">${m.time}</span></div><div class="subject">${m.subject}</div><p class="snippet">${m.snippet}</p>${m.file && !dense ? `<span class="attachment">${icon('clip')}2 attachments</span>` : ''}</div></button>`,
    )
    .join(
      '',
    )}</div><div class="bottom-bar"><select aria-label="Inbox category"><option>Primary</option><option>All mail</option><option>Updates</option><option>Social</option><option>Promotions</option></select><button class="compose" aria-label="Compose preview">${icon('compose')}Compose</button></div>${home}`;
}
function reader(direction, index = 0) {
  const m = messages[index];
  const isWeekend = index === 0;
  return `${status}<div class="reader-nav"><button data-back aria-label="Back to inbox">${icon('back')}</button><div class="nav-sender"><strong>${m.sender}</strong><span>to me · ${m.time} ${icon('more')}</span></div><button aria-label="More message actions">${icon('more')}</button></div><div class="reading"><h3>${m.subject}</h3><div class="letter"><p>Hey Eric,</p><p>${isWeekend ? 'Found a cabin near the trail we loved last fall. Big windows, a wood stove, and absolutely no plans.' : m.snippet}</p><p>${isWeekend ? 'We could head up Saturday morning, stop for coffee on the way, and be back by Sunday evening.' : 'Have a look when you have a moment. I’d love to hear what you think.'}</p><p>${isWeekend ? 'Feels like a good excuse to put our phones away for a bit. What do you think?' : 'No rush — just wanted to send this your way.'}</p><p>${m.sender.split(' ')[0]}</p></div>${isWeekend ? `<div class="file">${icon('file')}<div><strong>Cabin & trail details.pdf</strong><span>PDF document · 240 KB</span></div>${icon('down')}</div>` : ''}</div><div class="bottom-bar"><button>${icon('more')}More</button><button class="compose">${icon('reply')}Reply</button></div>${home}`;
}
function render(view, index = 0) {
  document.querySelectorAll('.phone').forEach((phone) => {
    phone.innerHTML =
      view === 'reader' ? reader(phone.dataset.direction, index) : inbox(phone.dataset.direction);
  });
  document
    .querySelectorAll('[data-view]')
    .forEach((button) => button.classList.toggle('selected', button.dataset.view === view));
}
document.addEventListener('click', (event) => {
  const view = event.target.closest('[data-view]');
  const message = event.target.closest('[data-open-message]');
  if (view) render(view.dataset.view);
  const search = event.target.closest('[data-search]');
  if (search) {
    const field = search.closest('.phone').querySelector('.reveal-search');
    field.hidden = !field.hidden;
    if (!field.hidden) field.querySelector('input').focus();
  }
  if (message) render('reader', Number(message.dataset.openMessage));
  if (event.target.closest('[data-back]')) render('inbox');
});
render('inbox');

document.addEventListener('input', (event) => {
  if (!event.target.matches('.reveal-search input')) return;
  const query = event.target.value.toLowerCase();
  event.target
    .closest('.phone')
    .querySelectorAll('.message')
    .forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
});
