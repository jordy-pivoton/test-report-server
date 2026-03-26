# Test Report Server

Server voor Allure-rapporten en Playwright trace-bestanden.

## Playwright Trace Viewer (zelf gehost)

De server host de **Playwright Trace Viewer** zelf (uit `playwright-core`). Trace-links openen de viewer op je eigen server; de trace wordt via een same-origin URL geladen. Daardoor zijn **geen CORS** en **geen externe trace.playwright.dev** meer nodig. Voor een werkende viewer moet het HTTPS-certificaat door de browser vertrouwd worden (zie Certificaten); een lokaal vertrouwd certificaat via **mkcert** wordt aanbevolen.

Start de server met HTTPS zodat trace-links werken:

```bash
# Bash / Linux / macOS
USE_HTTPS=1 npm run dev

# PowerShell (Windows)
$env:USE_HTTPS="1"; npm run dev
```

De server luistert dan op **https://localhost:3443** (of de poort die je met `HTTPS_PORT` instelt). De trace viewer laadt alleen goed als het certificaat door de browser wordt vertrouwd (zie hieronder).

## Omgevingsvariabelen

| Variabele       | Beschrijving                                                                 | Default      |
|-----------------|-------------------------------------------------------------------------------|--------------|
| `REPORTS_ROOT`  | Map met rapport-runs; structuur: `reports/<testsoort>/<datum_run>/` (bijv. `oplever-controle`, `regressietest`). | `./reports`  |
| `PORT`          | Poort bij HTTP (als `USE_HTTPS` niet gezet is).                               | `3000`       |
| `USE_HTTPS`     | Zet op `1`, `true` of `yes` om de server over HTTPS te starten.               | -            |
| `HTTPS_PORT`    | Poort voor HTTPS.                                                             | `3443`       |
| `SSL_CERT_PATH` | Pad naar het TLS-certificaat (PEM).                                           | `./cert/cert.pem` |
| `SSL_KEY_PATH`  | Pad naar de private key (PEM).                                                 | `./cert/key.pem`  |
| `BASE_URL`      | Optioneel: vaste basis-URL voor trace-links (bijv. achter reverse proxy).     | -            |

## Certificaten

De trace viewer laadt scripts en een Service Worker. Bij een **onvertrouwd** certificaat (self-signed) blokkeert de browser die vaak met "SSL certificate error" en "Failed to register a ServiceWorker", waardoor je een lege pagina ziet. Gebruik daarom een **lokaal vertrouwd certificaat** (mkcert) voor een werkende trace viewer.

### Aanbevolen: vertrouwd lokaal certificaat (mkcert)

[mkcert](https://github.com/FiloSottile/mkcert) maakt een certificaat dat je browser wél vertrouwt. Geen waarschuwingen en geen geblokkeerde scripts of Service Worker.

1. **mkcert installeren**
   - Windows (PowerShell als admin): `winget install mkcert` of [Chocolatey](https://chocolatey.org/): `choco install mkcert`
   - Of download: https://github.com/FiloSottile/mkcert#installation
2. **Lokale CA eenmalig installeren** (nodig voor vertrouwen in de browser):
   ```powershell
   mkcert -install
   ```
3. **Certificaat voor localhost aanmaken** (in de projectmap, map `cert` wordt aangemaakt):
   ```powershell
   mkcert -key-file cert/key.pem -cert-file cert/cert.pem localhost
   ```
4. **Server starten met HTTPS**; de server gebruikt dan automatisch `./cert/cert.pem` en `./cert/key.pem`:
   ```powershell
   $env:USE_HTTPS="1"; npm run dev
   ```
5. Open `https://localhost:3443` en de trace-links; er zou geen waarschuwing meer moeten zijn en de trace viewer zou moeten laden.

### Zelf-ondertekend (standaard bij `USE_HTTPS=1`)

Als er geen bestaande certificaten op `SSL_CERT_PATH` / `SSL_KEY_PATH` staan, wordt bij de eerste start een **self-signed** certificaat gegenereerd in `./cert/`. De browser vertrouwt dit vaak niet voor scripts en Service Worker, waardoor de trace viewer een lege pagina kan tonen. Voor een werkende viewer is mkcert (hierboven) aanbevolen.

## Scripts

- `npm run dev` – Server starten met ts-node (development).
- `npm run build` – TypeScript compileren naar `dist/`.
- `npm run start` – Gecompileerde server starten (`node dist/server.js`).

## Docker

De server kan met Docker Compose worden gedraaid. De rapporten-map wordt als volume gemount; daardoor kun je lokaal `./reports` gebruiken of op een server een **netwerkshare** (SMB/NFS) mounten en dat pad aan de container geven.

### Lokaal met Docker

```bash
docker compose up -d
```

De app is bereikbaar op **http://localhost:3000**. Rapporten staan in `./reports` op de host (standaard); die map wordt in de container gemount als `/app/reports`.

### Op de server met een share

Om de rapportdata uit een netwerkshare te halen:

1. **Mount de share op de host** naar een lokaal pad, bijvoorbeeld:
   - Linux: `sudo mount -t cifs //fileserver/reports /data/reports -o credentials=/etc/smb-credentials`
   - Windows: netwerkshare koppelen als schijf of map (bijv. `C:\mounts\reports`).
2. **Zet het pad in de omgeving** voor Docker Compose. Maak in de projectmap een `.env` bestand:
   ```env
   REPORTS_HOST_PATH=/data/reports
   ```
   (Op Windows gebruik je het pad naar de gemounte map, bijv. `C:\mounts\reports`.)
3. **Start de stack**:
   ```bash
   docker compose up -d
   ```

De container leest dan de rapporten vanaf de gemounte share. De host-map moet bestaan vóór het starten (dat is het mountpoint van de share).

Optioneel in `.env`: `USE_HTTPS=1` voor HTTPS, `BASE_URL=https://jouw-domein.nl` als de app achter een reverse proxy draait.

## Gebruik

1. Zet je rapporten in `REPORTS_ROOT` (standaard `./reports`), per **testsoort** in een submap en per **run** in een submap daaronder:
   - `reports/oplever-controle/2026-02-24_run-1/allure-report/`
   - `reports/oplever-controle/2026-02-24_run-1/traces/*.zip`
   - `reports/regressietest/2026-02-24_run-2/allure-report/`
   - `reports/regressietest/2026-02-24_run-2/traces/*.zip`
   - Runs die direct onder `reports/` staan (zonder testsoort-map) worden getoond onder de groep **overig**.
2. Start de server (bij voorkeur met `USE_HTTPS=1` voor trace-links).
3. Open in de browser de getoonde URL (bijv. `https://localhost:3443`). De UI toont runs gegroepeerd per testsoort; bij meerdere traces per run verschijnt een uitvouwmenu.
4. Open trace-links; ze gaan naar de zelf-gehoste trace viewer (`/trace-viewer/`). De trace laadt vanaf je eigen server (same origin). Gebruik bij voorkeur mkcert voor het certificaat (zie Certificaten), anders kan de viewer een lege pagina tonen door SSL-fouten.
