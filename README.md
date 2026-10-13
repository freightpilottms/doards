# DOARDS - paket za objavu

Ovo je vec izgradjena aplikacija, bez React/TypeScript izvornog projekta,
testova, ponuda, lokalne baze i razvojnih alata. Serverski JavaScript ostaje
jer Vercel API mora izvrsavati poslovna pravila i komunicirati sa Supabase bazom.

## StackBlitz -> GitHub -> Vercel

1. U StackBlitz uvezite SADRZAJ ovog foldera. Pokretanje: npm run dev.
2. Sacuvajte/sinhronizujte taj projekat u GitHub repozitorij.
3. Uvezite repozitorij u Vercel. Root Directory je korijen paketa.
   Framework: Other. Node: 24.x. Build: npm run build. Output: site.
   Postavke su vec navedene u vercel.json.
4. Na Vercelu postavite serverske Environment Variables:
   DATABASE_URL = Supabase PostgreSQL Transaction pooler URI sa lozinkom baze
   CRON_SECRET = privatna tajna za dnevni posao
   DOARDS_SECURE_COOKIE = 1
   DOARDS_PRESENTATION = 1 samo za pripremljenu fiktivnu prezentacijsku bazu
   DOARDS_PUBLIC_DEMO = 1 za javnu prezentaciju bez prijave (samo fiktivni podaci)
5. Poslije izmjene varijabli pokrenite Redeploy.

StackBlitz prikazuje isti izgradjeni interfejs i koristi API vec objavljenog
Vercel projekta (podrazumijevano https://doards.vercel.app). Drugu adresu postavite
kao DOARDS_API_ORIGIN u privatnom .env.local. Za funkcionalan pregled Vercel API
mora imati ispravnu vezu s bazom. Ovaj paket ne zaobilazi prijavu niti gresku baze.
Na Vercelu DOARDS_API_ORIGIN NIJE potreban: tamo se koristi vlastiti API.

Nikada ne stavljajte DATABASE_URL, lozinke ili CRON_SECRET u GitHub/StackBlitz.
Javni demo omogucava posjetiocima pristup demo ulogama i izmjenu demo podataka.
Za zatvaranje javnog pristupa postavite DOARDS_PUBLIC_DEMO=0 i ponovo objavite.
Prije produkcije zamijenite ranije otkrivene lozinke i tajne.
Postojeci Supabase podaci se ne brisu niti ponovo uvoze ovim paketom.
Promjene interfejsa rade se u originalnom projektu i zatim se izradjuje novi paket.
