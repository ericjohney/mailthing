paths.close = '<path d="m6 6 12 12M18 6 6 18"/>';
paths.next = '<path d="m9 5 7 7-7 7"/>';
paths.tray = '<path d="M4 3h16l2 12v6H2v-6L4 3ZM2 15h6l2 3h4l2-3h6"/>';
paths.envelope = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>';
paths.star = '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>';
paths.clock = '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>';
paths.sent = '<path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15"/>';
paths.tag = '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1"/>';
paths.people =
  '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3c0-5 12-5 12 0v3M16 5c4 0 4 6 0 6M18 14c3 0 4 2 4 5"/>';
paths.info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>';
paths.bell = '<path d="M5 16h14l-2-4V8a5 5 0 0 0-10 0v4l-2 4ZM10 20h4"/>';
paths.connection = '<path d="M3 8q9-7 18 0M6 12q6-5 12 0M9 16q3-3 6 0M12 20h.01"/>';
paths.gear =
  '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1 1 4-3 2 2 3 3-1 2 4 4-1 1-3 4-1-1-4 3-2-2-3-3 1-2-4-5 1Z"/>';
const account = `<div class="account-card"><img src="../../web/public/brand/mailthing-mark.svg" alt=""/><div><strong>Eric Johnson</strong><p>eric@example.com</p></div></div>`;
function nav(title, extras = '') {
  return `<div class="mailthing-nav"><button aria-label="Close ${title}">${icon('close')}</button><span class="screen-title">${title}</span>${extras}</div>`;
}
function folders(items, extra = '') {
  return `<div class="folder-list">${items.map(([name, symbol, count]) => `<button class="folder-row ${name === 'Inbox' ? 'active' : ''} ${extra}">${icon(symbol)}${name}<span>${count || ''}</span></button>`).join('')}</div>`;
}
function setting(name, symbol, value = '', chevron = true) {
  return `<button class="setting-row">${icon(symbol)}${name}${value ? `<span class="value">${value}</span>` : ''}${chevron ? `<span class="chevron">${icon('next')}</span>` : ''}</button>`;
}
const compose = `${status}${nav('New message', `<button aria-label="Attach file">${icon('clip')}</button><button class="send" aria-label="Send preview">Send</button>`)}<div class="page-content"><div class="compose-fields"><div class="address-field"><span>From</span><div class="from">eric@example.com</div></div><div class="address-field"><span>To</span><div class="recipient">Sam Rivera</div><button class="cc-toggle" data-cc>Cc / Bcc</button></div><div class="cc-fields" hidden><div class="address-field"><span>Cc</span></div><div class="address-field"><span>Bcc</span></div></div><input class="subject-input" aria-label="Subject" value="Re: A little escape this weekend"/></div><div class="compose-body" contenteditable="true" role="textbox" aria-label="Message body" aria-multiline="true"><p>Hey Sam,</p><p>That sounds perfect. Saturday morning works for me.</p><p>I’ll bring the coffee and something for breakfast. Send me the cabin address when you get a chance.</p><p>Looking forward to it.<br/>Eric</p></div></div>${home}`;
const mailboxes = `${status}${nav('Mailboxes', `<button aria-label="Account settings">${icon('gear')}</button>`)}<div class="page-content">${account}${folders(
  [
    ['Inbox', 'tray', '3'],
    ['Unread', 'envelope', '3'],
    ['Starred', 'star', '6'],
    ['Snoozed', 'clock', ''],
    ['Sent', 'sent', ''],
    ['Drafts', 'file', '2'],
    ['All mail', 'archive', ''],
  ],
)}<div class="section-label">Inbox categories</div>${folders(
  [
    ['Primary', 'tray', '3'],
    ['Updates', 'info', ''],
    ['Social', 'people', ''],
    ['Promotions', 'tag', ''],
  ],
  'category-row',
)}<div class="section-label">Labels</div><div class="folder-list"><button class="folder-row"><i class="label-dot"></i>Work</button><button class="folder-row"><i class="label-dot personal"></i>Personal</button></div></div>${home}`;
const settings = `${status}${nav('Settings')}<div class="page-content settings-content">${account}<div class="section-label">Preferences</div><div class="settings-group"><button class="setting-row" data-notifications role="switch" aria-checked="true">${icon('bell')}New mail notifications<span class="toggle"></span></button>${setting('Mail sorting', 'tag', 'Configured')}${setting('Sorting memory', 'file')}</div><div class="section-label">Appearance</div><div class="settings-group"><div class="theme-picker" aria-label="Appearance preview"><button class="active" data-theme-choice>System</button><button data-theme-choice>Light</button><button data-theme-choice>Dark</button></div></div><div class="section-label">Connection</div><div class="settings-group">${setting('Mail server', 'connection', 'Connected')}</div><p class="settings-note">Connection details and server settings live here.</p><div class="section-label">About</div><div class="settings-group">${setting('Version', 'info', '1.0', false)}${setting('Sending', 'sent', 'Configured', false)}</div></div>${home}`;
document.querySelector('[data-screen="compose"]').innerHTML = compose;
document.querySelector('[data-screen="mailboxes"]').innerHTML = mailboxes;
document.querySelector('[data-screen="settings"]').innerHTML = settings;
document.addEventListener(
  'click',
  (event) => {
    event.stopImmediatePropagation();
    const cc = event.target.closest('[data-cc]');
    if (cc) {
      const fields = cc.closest('.compose-fields').querySelector('.cc-fields');
      fields.hidden = !fields.hidden;
    }
    const notification = event.target.closest('[data-notifications]');
    if (notification) {
      const enabled = notification.getAttribute('aria-checked') !== 'true';
      notification.setAttribute('aria-checked', String(enabled));
      notification.querySelector('.toggle').classList.toggle('off', !enabled);
    }
    const choice = event.target.closest('[data-theme-choice]');
    if (choice) {
      choice.parentElement
        .querySelectorAll('button')
        .forEach((button) => button.classList.toggle('active', button === choice));
    }
  },
  true,
);
