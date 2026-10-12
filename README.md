# DOARDS / S&S Fahrzeugverleih - Release

## Vazno prije objave

Ovo je kompletan izvorni paket aplikacije, bez lokalne baze, korisnickih sesija,
privatnih dokumenata, poslovnih ponuda i tajnih kljuceva.

**Vercel i StackBlitz pokrecu frontend. Node backend mora raditi odvojeno, na
serveru s trajnim diskom.** Trenutna baza je SQLite, ne Supabase. Samo postavljanje
Supabase URL-a ili kljuca ne povezuje ovu aplikaciju s tom bazom. Paket ne tvrdi da
je izvrsena migracija na Supabase niti da je aplikacija vec objavljena.

```text
StackBlitz / Vercel frontend
        /api/* (same-origin proxy, cookies)
                |
        HTTPS Node backend (Node 24)
                |
        SQLite + privatni prilozi na trajnom disku
```

Bez javnog HTTPS backend URL-a frontend ce pokazati poruku o nepovezanom serveru.
Nema lazne uspjesne prijave niti spremanja podataka u privremenu Vercel bazu.

## 1. GitHub

1. Kreirajte **private** repozitorij.
2. U root repozitorija prenesite **sadrzaj ovog foldera**. `package.json`,
   `vercel.json`, `src`, `api` i `server` moraju biti direktno u rootu.
3. Ukljucite i skrivene konfiguracijske fajlove: `.stackblitzrc`, `.gitignore`,
   `.github` i primjere okruzenja. GitHub web upload ih moze izostaviti; Git ili
   GitHub Desktop su pouzdaniji.
4. Nikad ne dodajte `.env.local`, `.env.backend`, `data/` ili stvarne kljuceve.

Nije dodijeljena open-source licenca. Ne objavljujte komercijalni kod, brend ili
slike javno bez odgovarajucih prava; izvori slika su u `public/credits.html`.

## 2. Backend

Potreban je Node 24 server s trajnim diskom i HTTPS adresom, npr. vlastiti VPS
ili drugi Node/container host koji podrzava persistent volume.

### Docker

```sh
cp .env.backend.example .env.backend
docker compose up -d --build
```

Compose vezuje port 4319 samo na localhost. Postavite HTTPS reverse proxy na tom
serveru prema `127.0.0.1:4319`, uz prosljedjivanje originalnog Host zaglavlja.
SQLite podaci ostaju u volume-u `doards_data`; jedan backend proces/instanca
koristi ovu bazu. Nemojte horizontalno skalirati instance s odvojenim bazama.

### Bez Dockera

```sh
npm ci
npm run build
cp .env.backend.example .env.backend
npm start
```

Postavite `DOARDS_DB` na trajni disk. Koristite process manager, HTTPS reverse
proxy, firewall, redovne backup-e i provjeru oporavka. Prije javnog otvaranja
izvrsite pocetno kreiranje administratora na zasticenom pristupu, pa provjerite da
`/api/session` vraca `setup: false`. Ne ostavljajte javno otvoren prvi setup.

**Demo login nije dozvoljen na javnom backendu.** `DOARDS_DEMO=0` ostaje ukljucen
u produkcijskoj konfiguraciji. Za online prezentaciju koristite izdvojenu bazu
i stvarne prijavne racune s fiktivnim podacima, uz ogranicen pristup. Lokalni
demo opisan je u nastavku. Ovaj paket ne iznosi lokalnu demo bazu na internet.

## 3. StackBlitz

1. Importujte GitHub repozitorij kao Node/Vite WebContainer projekt.
2. Postavite `DOARDS_API_ORIGIN=https://vasa-backend-adresa` u `.env.local` ili
   u odgovarajuce projektne varijable. Ne dodajte `/api` na kraj.
3. Pokrenite `npm run dev` (automatski kroz `.stackblitzrc`). Restartujte server
   nakon izmjene varijable.
4. Za prijavu koristite **Open in new tab** ako browser blokira cookies u iframe-u.

StackBlitz ovdje ne pokrece `node:sqlite`. U njemu se pokrecu Vite i API adapter
prema odvojenom backendu. PWA/service-worker instalacija nije cilj WebContainer
pregleda; provjerava se na stvarnoj HTTPS adresi.

## 4. Vercel

1. **Add New > Project > Import Git Repository**.
2. Root Directory: folder u kojem je ovaj `package.json`.
3. Framework: **Vite**. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
4. Node verzija: **24.x**.
5. Environment Variables: `DOARDS_API_ORIGIN=https://vasa-backend-adresa`.
   Dodajte za Production i za svaki Preview koji treba pristup tom backendu.
6. Deploy. Poslije promjene varijabli uradite Redeploy.

Putanje su `/`, `/clients` i `/workshop`. API funkcija u `api/[...path].mjs`
prosljedjuje JSON, cookies, prijavu i privatne priloge; baza ne zivi u funkciji.
Backend URL se ne ugradjuje u browser bundle. Ne koristite `VITE_` prefiks za
tajne. Nikad ne koristite produkcijske racune/podatke u nepouzdanom Preview-u.

### Ogranicenja ove konfiguracije

- Na ovom adapteru poruke/obavijesti se osvjezavaju najkasnije pri narednom
  redovnom provjeravanju, okvirno svakih 8 sekundi dok je stranica aktivna.
  Stalni SSE stream se ne drzi otvorenim kroz Vercel funkciju.
- API zahtjev ili odgovor je ogranicen na 4.000.000 bajtova. Za base64 priloge
  koristite datoteke ispod oko 2,5 MB i pazite na zbir vise priloga.
  Vercel ima vlastiti limit od 4,5 MB. Za vece fajlove potreban je odvojen
  object-storage upload, koji ovim releaseom nije implementiran.
- Periodicni obracun i servisi izvrsavaju se na stalno aktivnom backendu.
- Ako backend nije konfigurisan ili ne odgovara, prikazuje se jasna greska;
  ne postoji offline zamjena za bazu.

## Lokalni puni demo

Na racunaru s Node 24:

```sh
npm ci
npm run dev:full
```

Ovo pokrece postojeci puni Node/SQLite demo, automatski kreira lokalnu bazu i sve
demo uloge. Nije komanda za StackBlitz ili Vercel. Ne izlazite s passwordless
demo serverom na javni internet. Detalji aplikacije su u `APP_README.md`.

## Provjera

```sh
npm test
npm run test:deployment
npm run build
```

Smoke provjera nakon stvarnog deploya:

1. `/api/session` vraca JSON, ne HTML, bez `setup: true` na javnoj adresi.
2. Prijava i odjava rade, a osvjezavanje stranice zadrzava ispravnu sesiju.
3. Klijent i vozac ne vide tudja vozila ili privatne interne dokumente.
4. `/clients` i `/workshop` rade na mobilnom/tablet prikazu.
5. Promjena sa jednog uredjaja stize na drugi kroz redovno osvjezavanje.
6. Privatni dokument radi samo u ovlastenoj sesiji.
7. Restart backenda ne brise sacuvane zapise.

## Sluzbeni izvori

- [Vercel i SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [Vercel Node funkcije](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel ogranicenja](https://vercel.com/docs/functions/limitations)
- [StackBlitz konfiguracija](https://developer.stackblitz.com/platform/webcontainers/project-config)
- [StackBlitz ogranicenja](https://developer.stackblitz.com/platform/webcontainers/troubleshooting-webcontainers)
