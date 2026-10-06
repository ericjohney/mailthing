#!/usr/bin/env python3
"""Send fictional examples through the real SMTP receiving/processing path."""
import argparse
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=2500)
parser.add_argument('--to', default='me@mailthing.local')
parser.add_argument('--demo', action='store_true')
args = parser.parse_args()

examples = [
    ('Sam Rivera', 'sam@example.net', 'A little plan for the weekend', 'Hey!\n\nThere’s a new coffee spot by the river. Want to try it on Saturday?\n\nI was thinking we could take the long way there and get some fresh air.\n\nLet me know what works for you.\nSam'),
    ('Nora Chen', 'nora@example.net', 'The photos from our trip', 'Finally went through the camera roll. A few favorites attached.\n\nThat afternoon light was something else.'),
    ('Oliver James', 'oliver@example.net', 'Dinner on Thursday?', 'We’re making pasta. Come around seven if you’re free — bring yourself, we have the rest covered.'),
    ('Maya Patel', 'maya@example.net', 'A book you might like', 'Just finished the book I mentioned. I think you’d love it. I can drop it off tomorrow.'),
    ('Studio North', 'hello@studio.example', 'A first look at the new direction', 'Sharing the first sketches for our next chapter. There’s a quieter palette and a little more room to breathe. Would love your thoughts.'),
    ('Emma Wilson', 'emma@example.net', 'Quick catch-up next week', 'It’s been too long. Do you have a free morning next week for a walk?'),
    ('Theo Martin', 'theo@example.net', 'The playlist I promised', 'A few tracks for slower mornings. Hope you find something you like.'),
    ('Leah Brooks', 'leah@example.net', 'A small thank you', 'Thank you for your help yesterday. It made a real difference. Let’s grab lunch soon — my treat.'),
    ('Julian Park', 'julian@example.net', 'Notes from today', 'A couple of things to keep in mind from our conversation. Nothing urgent, just putting them in one place.'),
    ('Atelier Goods', 'newsletter@atelier.example', 'The October edit — things made to last', 'A considered collection of everyday essentials, chosen with care.'),
    ('Field Notes', 'letters@fieldnotes.example', 'Your Sunday newsletter', 'This week: finding a slower pace, a few good reads, and a recipe worth keeping.'),
    ('Parcel', 'no-reply@parcel.example', 'Your order has been delivered', 'Your package arrived today. We hope it finds a good place in your home.'),
    ('Bookshop', 'receipts@bookshop.example', 'Receipt for your recent purchase', 'Thanks for supporting independent bookstores. Your receipt is attached.'),
    ('LinkedIn', 'notifications@linkedin.example', 'Nora sent you a connection request', 'Catch up with the people in your circle.'),
]

with smtplib.SMTP(args.host, args.port) as smtp:
    for index, (name, sender, subject, body) in enumerate(examples if args.demo else examples[:1]):
        message = EmailMessage()
        message['From'] = f'{name} <{sender}>'
        message['To'] = args.to
        message['Subject'] = subject
        message['Message-ID'] = make_msgid(domain='example.net')
        message.set_content(body)
        if index in (1, 12):
            message.add_attachment(b'A fictional sample attachment.\n', maintype='text', subtype='plain', filename='trip-notes.txt' if index == 1 else 'receipt.txt')
        smtp.send_message(message)
print(f'Sent {len(examples) if args.demo else 1} example email(s) to {args.host}:{args.port}.')
