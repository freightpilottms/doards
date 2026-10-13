# DOARDS: Supabase + Vercel

Ovaj release sadrzi vlastiti API na Vercelu i podatke u Supabase PostgreSQL bazi.
Na Vercelu vise NE koristite `DOARDS_API_ORIGIN`. Supabase URL i anon/publishable
API kljuc nisu zamjena za `DATABASE_URL` u ovoj serverskoj konfiguraciji.

## 1. Jedna vrijednost koju trebate dodati lokalno

Pokrenite `npm run supabase:prepare`. Privatni `.env.supabase` dobija generisane
lozinke i tajnu za automatizaciju. Postojeca datoteka se nikad ne prepisuje.

U Supabase projektu `orutyhfslocbsrkbdupw` otvorite **Connect > Transaction pooler**.
Kopirajte PostgreSQL URI u `DATABASE_URL=` u `.env.supabase`. Zamijenite placeholder
za lozinku stvarnom **database password**, ne API kljucem. Specijalne znakove u
lozinci URL-enkodirajte. Host i korisnicko ime preuzmite iz dashboarda, ne pogadjajte ih.
Nemojte slati lozinku u chat, postavljati je u `src`, niti dodavati prefiks `VITE_`.

Generisani vlasnik je `owner@doards.local`. Njegova lozinka je
`DOARDS_ADMIN_PASSWORD` u privatnoj datoteci; email mozete promijeniti prije uvoza.

## 2. Prenos trenutnih podataka

U izvornom projektu na racunaru (gdje se nalazi `data/demo.sqlite`):

```sh
npm run supabase:import -- --import data/demo.sqlite --enrich --apply
```

Komanda postavlja shemu i transakcijski prenosi zapise, korisnike i audit;
dopunjava demo samo novim zapisima. Lokalna baza se ne mijenja. Stare sesije se
NE prenose. Vlasnicki nalog se kreira s lozinkom iz privatne datoteke.
Odrediste mora biti prazno. Ako tamo postoje podaci, prenos se odbija, bez
njihovog prepisivanja. Prije prenosa zaustavite unos novih podataka u lokalni demo.
Nakon uspjesnog prenosa nastavite koristiti cloud ili `npm run dev:supabase`:
to nije dvosmjerna sinhronizacija dvije nezavisne baze.

Bez `--apply` komanda samo prikazuje uputu i ne mijenja cloud.

### Alternativa: nova prezentacijska baza

Na praznom Supabase odredistu, umjesto prenosa lokalne baze:

```sh
npm run supabase:import -- --demo --apply
```

Ovo pravi iskljucivo fiktivne povezane podatke i oznaku `presentation-only`.
Za ovu varijantu postavite `DOARDS_PRESENTATION=1` na Vercelu. Tek nakon prijave
lozinkom dozvoljeno je mijenjanje demo profila. Nikad ne ukljucujte ovaj rezim
nad stvarnim podacima: prezentacijski profili namjerno omogucavaju pregled svih uloga.

Prezentacijske prijave su `admin@doards.local`, `employee@doards.local`,
`mechanic@doards.local`, `warehouse@doards.local`, `accountant@doards.local`,
`client@doards.local`, `driver@doards.local`. Koriste `DOARDS_DEMO_PASSWORD` iz
privatne datoteke. Ove lozinke se postavljaju samo kod novog `--demo` uvoza.
Kod prenosa stare baze demo nalozi zadrzavaju stare hash-eve; pristupite kao
vlasnik pa postavite lozinke zeljena tri prezentacijska korisnika kroz Users.

## 3. GitHub i Vercel

U GitHub prenesite sadrzaj `release/DOARDS-Supabase`, ili koristite izvorni projekt
bez `data`, `tmp`, `output`, `outputs`, `release` i privatnih env datoteka.
Ne kombinujte stari release API proxy s novim API-jem. Stari paket `release/DOARDS`
je sacuvan radi povratka, ali nije Supabase paket.

Na Vercelu postavite Node **24.x**, build `npm run build`, output `dist`.
U **Settings > Environment Variables** dodajte:

| Naziv | Vrijednost |
| --- | --- |
| `DATABASE_URL` | Isti Supabase Transaction pooler URI iz privatne datoteke |
| `CRON_SECRET` | Generisana vrijednost iz `.env.supabase` |
| `DOARDS_SECURE_COOKIE` | `1` |
| `DOARDS_PRESENTATION` | `0` za prenesene podatke; `1` samo za novi `--demo` |

`DOARDS_ADMIN_PASSWORD` i `DOARDS_DEMO_PASSWORD` trebaju samo lokalnoj komandi za
uvoz, ne Vercelu. Nakon postavljanja varijabli uradite Redeploy. Postavite ih samo
u pouzdana okruzenja; ne dajte Preview granama pristup stvarnim podacima.

Ne pokrece se javni setup administratora i nema javne prijave bez lozinke.
Podaci su u privatnoj shemi **doards**: u Supabase Table Editoru izaberite tu shemu.
RLS je ukljucen, a browser/anon uloge nemaju pristup. API provjerava korisnicke
dozvole prije odgovora. Supabase Auth nije uveden: postojeci sistem prijave,
hash-evi lozinki i sesije sada se cuvaju u PostgreSQL-u.

## 4. StackBlitz

StackBlitz sluzi za frontend pregled nakon objave Vercela. Pokrenite
`npm run dev:stackblitz` i postavite `DOARDS_API_ORIGIN=https://vas-projekt.vercel.app`
u njegov `.env.local`. To je sada adresa Vercel aplikacije s API-jem, ne drugi VPS.
Ne dodajte DATABASE_URL ili druge tajne u dijeljeni StackBlitz projekt.

## 5. Provjera poslije objave

1. `/api/session` vraca JSON i `setup: false`.
2. Prijavite se kao vlasnik. Vozila, klijenti, radionica i racuni su popunjeni.
3. Nova promjena ostaje nakon osvjezavanja i nove objave na Vercelu.
4. Vozac vidi samo svoje vozilo; klijent svoju flotu; lager i radionica imaju posebna prava.
5. `/api/cron` bez autorizacije vraca 401; provjerite uspjesan dnevni Cron poziv u Vercelu.

## Operativne napomene

- Supabase je jedina trajna baza u cloud rezimu. Postojeca sinhrona poslovna
  pravila rade nad izolovanim memorijskim radnim skupom po zahtjevu; SQLite u tom
  koraku nema datoteku niti trajne cloud podatke. Promjene se upisuju u PostgreSQL
  prije slanja odgovora. PostgreSQL transakcijska brava stiti istovremene izmjene.
- Ovo je kompatibilna migracija postojeceg modela: poslovni zapisi su JSONB redovi,
  ne jedna JSON datoteka. Korisnici, sesije i audit su posebne tabele. Za veliki
  broj kompanija/medija treba uvesti ciljana citanja umjesto ucitavanja radnog skupa
  i nezavisne brave po zakupcu, uz testove kapaciteta.
- Dokumenti i potpisi ostaju u zasticenim zapisima baze; Supabase Storage bucket
  nije dio ove migracije. Vercel API ima limit 4 MB po zahtjevu/odgovoru;
  pojedinacne datoteke neka budu ispod oko 2,5 MB zbog base64 kodiranja.
- Cloud koristi osvjezavanje poruka/obavijesti svakih oko 8 sekundi, ne trajni SSE.
- `vercel.json` zakazuje dnevni posao u 05:00 UTC za obracun i servisne rokove.
  Svaka poslovna promjena takodjer pokrece provjeru. Cesci raspored prilagodite
  mogucnostima svog Vercel plana. Testirajte Cron nakon stvarne objave.
- Automatsko izdavanje racuna pocinje tek nakon ukljucenja opcije i popunjavanja
  firme. U produkciji potvrdite vremensku zonu i poreska pravila. Slanje emailom
  nije uvedeno ovom migracijom, niti je povezan placeni AI dobavljac.
- Ne gasite TLS provjeru certifikata. Ako je potreban CA, preuzmite ga iz svog
  Supabase projekta i unesite PEM u `DATABASE_CA_CERT` lokalno i na Vercelu.
- Prije stvarnih korisnika: backup/restore proba, testovi kapaciteta, nadzor,
  sigurnosni pregled i uklanjanje prezentacijskih naloga/podataka.

## Provjereni izvori

- [Supabase connection pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel Cron](https://vercel.com/docs/cron-jobs)
