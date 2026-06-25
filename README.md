# DoseTrace

DoseTrace is a lightweight GLP-1 tracker designed for self-hosting on a Raspberry Pi 5. It stores height in feet/inches, weight in stone/pounds, dose history, and renders a simple estimated medication-level graph using half-life decay.

## Included

- PIN-protected access
- SQLite-backed storage
- historic dose entry and editing
- default GLP-1 medication library
- configurable app name
- mobile-friendly single-page UI

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
$env:APP_NAME="DoseTrace"
$env:APP_PIN="1234"
$env:SESSION_SECRET="replace-this"
$env:DATA_DIR="$PWD\\data"
npm start
```

3. Open `http://localhost:3024`

## Recommended First-Run Changes

- change the default PIN immediately in the Settings card
- set `SESSION_SECRET` to a real random value
- set the app name you want to use publicly

## Pi 5 Deployment

Use a service name like `dosetrace`, then point `dosetrace.nickward.co.uk` at the Pi.

### Example systemd unit

Create `/etc/systemd/system/dosetrace.service`:

```ini
[Unit]
Description=DoseTrace
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/pi/dosetrace
Environment=PORT=3024
Environment=APP_NAME=DoseTrace
Environment=APP_PIN=1234
Environment=SESSION_SECRET=replace-with-a-long-random-string
Environment=DATA_DIR=/home/pi/.local/share/dosetrace
ExecStart=/usr/bin/npm start
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable dosetrace
sudo systemctl start dosetrace
sudo systemctl status dosetrace
```

### Nginx reverse proxy

Example `/etc/nginx/sites-available/dosetrace`:

```nginx
server {
    server_name dosetrace.nickward.co.uk;

    location / {
        proxy_pass http://127.0.0.1:3024;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/dosetrace /etc/nginx/sites-enabled/dosetrace
sudo nginx -t
sudo systemctl reload nginx
```

Add TLS with Certbot after DNS points to the Pi.

## Notes

- The graph is a trend estimate, not a measured blood level.
- The PIN gate is intentionally lightweight. If you want stronger auth later, we can add per-user accounts or Tailscale/Basic Auth in front of it.
- Store app data outside the release directory so deploys do not replace the SQLite file.
