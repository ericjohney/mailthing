# mailthing

Mailthing is a development SMTP mail server catches all emails and displays them in an easy to see UI! Mailthing is perfect for running on your development machine to test and debug messages sent from your web application you're working on.

Just configure your application to use mailthing's smtp server, then just load up mailthing's web interface to see your emails. Easy!

## Installation

```shell
$ yarn install
```

### Running

Use this when running in production mode

```shell
$ yarn build
$ yarn start
```

### Developing

This will start the development server and reload changes

```shell
$ yarn dev
```

### Configuration

Uses the following Environment Variables

- PORT (default: 9005) - the ui webserver listens to this port
- SMTP_PORT (default: 2500) - the smtp server runs on this port
- SQLITE_DB (default: ':memory:') - set to a filesystem path to persist messages to disk

Set your application to use mailthing's SMTP server. The default port is 2500. It will accept any authentication.

```
localhost:2500
```
