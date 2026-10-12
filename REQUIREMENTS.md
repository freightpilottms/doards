# DOARDS: zahtjevi i stanje implementacije

Osnova: 23 stranice `DOARDS_Gesamtplan_fuer_Programmierer.pdf`, referentne slike, transkripcija i naknadne odluke o nazivu i GPS-u. Pregled: 12.10.2026.

## Odluke

- DOARDS / S&S Fahrzeugverleih; logo na glavnom interfejsu izdvojen iz PDF reference. Za ostriju stampu potreban je originalni logo.
- Nekretnine uklonjene iz aktivne aplikacije; fokus iskljucivo na vozilima.
- Bosanski, njemacki i engleski od prijave nadalje. Uneseni poslovni podaci ne prevode se automatski.
- Zajednicka aplikacija i baza sa ulogama i mobilnim prikazima. Nisu napravljene zasebne App Store/Google Play aplikacije.
- Dobrovoljni GPS telefona, uz pripremljen prikljucak za fizicke uredjaje.

## Oblasti PDF-a

| Oblast | Implementirano lokalno | Granice / nastavak |
| --- | --- | --- |
| 1. Glavni pregled | Pokazatelji, statusi, vozila, upozorenja, pretraga, detalji | Provjeriti sa stvarnim poslovnim podacima |
| 2. Korisnici/prava | Sedam uloga, prava po modulima/akcijama, serverska kontrola, finansijska ogranicenja, audit | Nema MFA/email oporavka lozinke; potreban sigurnosni pregled |
| 3. Najam | Vozilo/klijent/vozac, datumi/cijene, ugovor, potpisana predaja, povrat, mjesecni i zavrsni racun/uplata | Automatsko izdavanje ukljucuje admin nakon unosa podataka firme; email nije automatizovan |
| 4. Dosje vozila | Marka/model/tip/godina/VIN/tablice/km, cijene, lokacija, Pickerl, osiguranje/makler/email/polisa | Stvarna dokumentacija unosi se preko priloga |
| 5. Historija najma | Najmovi po vozilu, klijenti, datumi, statusi, cijene, predaja/povrat | Nema uvoza stare evidencije |
| 6. Troskovi | Kategorije, porez, dokumenti, automatski interni rad i dijelovi | Nije kompletna glavna knjiga |
| 7. Stete | Oznake na slikama, ugao/originalna slika, vrijeme, opis, statusi, trosak i udjeli | Nema slanja prijava osiguravatelju |
| 8. Popravke | Eksterne/interne, veze sa stetom, prilozima i troskom | Potrebne stvarne cijene/partneri |
| 9. Servis | Datumi/km, naredni rokovi, gume, veliki/mali servis, Pickerl, kontrolne liste | Nema automatskog citanja kilometraze bez integracije |
| 10. Dokumenti | PDF/slike, vezani zapisi, ogranicen pristup/dijeljenje | Nema OCR-a, antivirusnog skeniranja ni vanjskog arhiva |
| 11. Finansije | Investicija odvojena od prometa, racuni/uplate/kaucije, prihodi/troskovi/marza | Operativni izvjestaji, bez amortizacije i potpunog knjigovodstva |
| 12. Timeline | Povezani dogadjaji vozila i audit izmjena | Nije eksterni nepromjenjivi arhiv |
| 13. Statistika | Dani najma/radionice, raspolozivost, prihod/dan, trosak/km, grafikoni | Zavisi od potpunosti historije |
| 14. Radionica | Interni/eksterni nalozi, mehanicar, termin/prioritet, vrijeme, dijelovi, trosak/racun | Nema offline/native aplikacije |
| 15. Lager | Artikli, nabavna/prodajna cijena po pravima, stanje, rezervacije, izdavanje, povrat, korekcije | Jedan lager; bez barkod skeniranja |
| 16. Nabavka | Narudzbe, djelimicni prijem, historija cijena, racun dobavljaca/placanje | Bez elektronskog narucivanja kod dobavljaca |
| 17. Racuni/prodaja | Najam/eksterni rad/direktna prodaja, porez, brojevi, stampa/PDF, djelimicne uplate, otkazivanje | Bez fiskalizacije, banke, platnog integratora, e-fakture i punog procesa knjiznog odobrenja placenih racuna |
| 18. Dizajn/prihvat | Desktop navigacija/tabele prema referencama, telefon/tablet, automatizovani scenariji | Konacan prihvat klijenta i stvarni uredjaji tek slijede |

## Transkripcija

**Fotografije/stete:** osam uglova, prelazak i povlacenje, oznake na originalnoj fotografiji. Stare stete ulaze u narednu predaju. Ovo nije automatski 3D model; prava rekonstrukcija zahtijeva zaseban postupak snimanja i obrade.

**Klijent/vozac:** `/clients` je mobilni/tablet portal. Klijent vidi svoja dodijeljena vozila/najmove, vozac svoje vozilo; podrzan je i vozac fizicko lice bez firme. Novi vozac vidi stare stete, ali ne identitet prethodnog vozaca niti njegove lokacije. Promjene dolaze preko serverskih dogadjaja, uz periodicko osvjezavanje kao rezervu.

**Mehanicar:** `/workshop` objedinjuje naloge i lager u mobilnom/tablet portalu. Citanje i izmjene za radionicu i lager odvojeno se dodjeljuju. Jedan korisnik moze dobiti oba portala. Isti podaci su dostupni ovlastenom osoblju na glavnom boardu.

**Komunikacija:** chat po vozilu, odvojeni klijentski i interni kanali, zasticeni prilozi, procitane poruke i trajne obavijesti u aplikaciji. Nema push/email dostave kada je aplikacija zatvorena. Mapa koristi Leaflet i OpenStreetMap, zahtijeva internet za ucitavanje karte.

**GPS:** saglasnost i dozvola, koordinate/preciznost/vrijeme/izvor. Slanje prestaje kada stranica nije aktivna. Nema garantovanog pracenja u pozadini ili pri zakljucanom ekranu; za to trebaju tracker ili native aplikacija. Demo lokacije su izricito oznacene i ne predstavljaju stvarno pracenje. GPS telefona na LAN HTTP adresi zahtijeva prelazak na HTTPS.

**Obracun:** prema naknadnoj odluci korisnika, dugorocni najam koristi mjesecni obracun. Zavrseni kalendarski periodi obracunavaju dnevnu cijenu puta dane, bez krajnjeg datuma. Zavrsni racun odbija vec fakturisane mjesecne iznose i dodaje troskove povrata; kaucija ostaje odvojena. Automatsko izdavanje je podesivo i pocetno iskljuceno, blokirano bez podataka firme/kupca. Nema automatskog slanja ili naplate kartice. Prije poslovne upotrebe potvrditi ugovorne tekstove, porezne parametre i poslovnu vremensku zonu (trenutno UTC).

**Asistent:** tekstualni upiti, dobrovoljni glasovni unos i citanje odgovora, uz BS/DE/EN interfejs. Osnovni lokalni upiti rade bez vanjskog AI-ja. Integracija OpenAI Responses je pripremljena, ali nije aktivirana bez zasebnog serverskog kljuca i modela. Asistent je read-only i koristi samo dozvoljene podatke. Glas na telefonu trazi HTTPS i podrzan preglednik/jezik; stvarni mikrofon i vanjski AI nisu provjereni ovim automatizovanim testovima.

**Automatski servisni nadzor:** provjera datuma i kilometraze, upozorenja 14 dana/1000 km unaprijed i automatski zadaci koji se zatvaraju azuriranjem servisne evidencije. Serverska provjera radi svake minute, nakon promjena i pri ponovnom pokretanju. Nema procjene stvarne kilometraze bez novih unosa ili integracije.

## Provjereno

- 29 testova poslovnih pravila i HTTP sigurnosti, ukljucujuci mjesecne racune, zavrsno poravnanje, servisnu automatiku i izolaciju asistenta.
- Browser tok: novo vozilo, slika/steta, najam, potpisana predaja sa starom stetom, povrat, dodatni kilometri, PDV/racun/uplata, radionica/dijelovi/rad i lokacija telefona.
- Moduli, tri jezika, desktop/mobilne slike, horizontalno prelijevanje i pregled stampanog racuna.
- Izolovana testna baza; demo podaci nisu stvarni poslovni podaci.
- Poseban browser test za komunikaciju izmedju tri aplikacije, prava radionice/lagera, dvostruki pristup, obavijesti, mapu i prikaze 320/390/820px.
- Trenutna baza je SQLite. Supabase projekt je pregledan, ali nije povezan niti izmijenjen.

## Prije Produkcije

1. Potvrditi obuhvat, tokove i izgled sa klijentom na stvarnim vozilima i uredjajima.
2. HTTPS hosting/domen, trajna baza, backup/restore, nadzor i ogranicen administratorski pristup.
3. Firma, korisnici, vozila, lager, pregledani ugovorni/porezni podaci i eventualni uvoz stare evidencije.
4. Pravila pristanka, pristupa, zadrzavanja i brisanja lokacija/licnih podataka. Automatska retencija nije implementirana.
5. Sigurnosni pregled i test opterecenja; za veci broj korisnika izdvojiti medije i paginaciju umjesto slanja cijelog dozvoljenog stanja.
6. Posebno dogovoriti stalni background GPS, pravi 3D, email/push, finansijske integracije i eventualne native aplikacije; aktivirati i provjeriti zaseban AI API pristup.
