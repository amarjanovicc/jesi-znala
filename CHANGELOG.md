# Povijest promjena

Format prati [Keep a Changelog](https://keepachangelog.com/hr/1.1.0/), a verzije [semantičko verzioniranje](https://semver.org/lang/hr/).

## [1.3.2] - 2026-11-16

### Ispravak
- Ako bi nešto označila (♥, reakcija, poruka) dok je sinkronizacija bila u tijeku, odgovor poslužitelja prebrisao bi to na njezinu uređaju i nije stizalo adminu. Sad se takva promjena sačuva i pošalje u sljedećem krugu. Nađeno probom na produkciji.

## [1.3.1] - 2026-11-16

Provjera igre i admina prema stručnim smjernicama (Vercel Web Interface Guidelines, Anthropic frontend-design, UX i pristupačnost).

### Igra
- Između pitanja miče se samo dopisnica, bez praznog ekrana; animacije na početnom ekranu kraće.
- „Poslano" se prikazuje tek kad poruka stvarno stigne na server; inače „Spremljeno, poslat ću čim bude veze."
- Na „Tvom ukusu" napola napisan tekst više se ne briše kad označiš kategoriju ili dodaš temu; jasne poruke za praznu, kratku ili ponovljenu temu.
- Neaktivni gumb izgleda kao prazan utor, a ne kao pokvaren gumb; odgovori, kartice i mali gumbi reagiraju na dodir.
- Klizač za procjenu broja traži da ga pomakneš prije potvrde.
- Donja traka se makne dok tipkaš, a „Točno!" više nije ispod nje.
- Potvrda brisanja napretka kaže što će se obrisati.
- Postavka telefona „Smanji kretanje" sad se poštuje (efekt otvaranja i dalje se može uključiti).
- Pristupačnost: tamniji sivi tekst (kontrast AA), čitač ekrana čuje točno/netočno, fokus prati promjenu ekrana, preskok otvaranja je pravi gumb (i Esc), bolje oznake za album, vize i napredak.
- Igra se ne iscrtava ponovno usred dodira kad sinkronizacija ništa nije promijenila; brži prvi prikaz fonta.

### Admin
- Tablica poruka na mobitelu više ne pomiče stupce; dugi tekst se lomi umjesto da širi stranicu.
- Natpisi su povezani s poljima, redovi se otvaraju i tipkovnicom, kartice su prava navigacija, rubovi polja su vidljiviji.

## [1.3.0] - 2026-11-16

### Igra
- Poruka adminu bilo kad: na ekranu „Tvoj ukus" polje „Javi mi bilo što, bilo kad" (do 280 znakova, zadnjih 20 se čuva).

### Admin
- Opće poruke u detaljima igrača, a zadnja poruka (uključujući opće) i u Pregledu; obavijest kad stigne nova.

## [1.2.1] - 2026-11-16

### Igra
- Nedjeljna razglednica češće bira pitanja iz područja koja je označila i pisama koja joj se sviđaju (izbor je i dalje nasumičan).

## [1.2.0] - 2026-11-16

Ukus i interesi.

### Igra
- „Sviđa mi se": srce na svakom pismu (vidi se i u albumu).
- „Tvoj ukus": označi područja koja te zanimaju (povijest, antika, geografija, informatika) i predloži vlastite teme (do 8).
- Sve se sinkronizira s uređajem; zadnja promjena pobjeđuje.

### Admin
- Kartica Pregled: što voli po područjima (srca i interesi) i popis predloženih tema.
- Detalji igrača: interesi, predložene teme i pisma koja joj se sviđaju.
- Obavijest kad označi srce, promijeni interese ili predloži temu.

## [1.1.0] - 2026-11-16

Uređaji bez prijave.

### Igra
- Svaki mobitel pri prvom otvaranju dobije anonimni ID (u `localStorage` i kolačiću `jz_id`, 2 godine); napredak se sam sprema na server.
- Ako preglednik obriše podatke, a kolačić ostane, napredak se vrati sa servera.
- Sinkronizacija: povezivanje s drugim uređajem unosom koda, ili odvajanje uređaja (novi ID).

### Admin
- Popis uređaja s vrstom uređaja (iPhone, Android…), zadnjim posjetom i stanjem današnjeg pisma (otvoreno, rezultat, reakcija); isti sažetak na kartici Pregled.
- „Resetiraj današnje" briše današnje pismo samo tom uređaju; uređaj to preuzme pri sljedećoj sinkronizaciji.

### Sigurnost
- Ulaz za sinkronizaciju prima samo zahtjeve iz same igre (zaglavlje `X-JZ`, ista adresa), do 40 KB, najviše 100 uređaja ukupno.

## [1.0.2] - 2026-11-16

### Projekt
- Dodana MIT licenca (datoteka `LICENSE`, polje `license` u `package.json`, README).

## [1.0.1] - 2026-11-16

Prilagodba telefonima (mobile first).

### Igra
- Otvaranje pisma: omotnica se prilagođava duljini pitanja, pa se na uskim ekranima ništa više ne reže.
- Najuži telefoni (do 340 px): album ostaje u tri stupca umjesto dva, pa je kraći za trećinu.
- Veća slova (12 px) za oznake u putovnici, a iOS ne povećava tekst pri okretanju telefona.

### Admin
- Polja za unos imaju 16 px (iOS više ne zumira pri unosu), a tipke i poveznice veće mete za dodir.
- Ispravljena dvostruka točka u uputi uz uređivanje pisma.

## [1.0.0] - 2026-11-14

Prvo javno izdanje.

### Igra
- Dnevno pismo s kratkom pričom i tri pitanja (odabir odgovora ili procjena broja klizačem).
- Otvaranje pisma animacijom noža za pisma, uz sintetizirane zvukove.
- Album maraka s brojkom koja se pamti, poštanskim žigom i rezultatom.
- Putovnica: bodovi (pismo 2, čisti žig +1, zapamćeno +2), osam putničkih činova i vize za postignuća.
- Ponavljanje riješenih pisama nakon 2, 5 i 12 dana te nedjeljna razglednica s pet pitanja.
- Reakcije na pismo i poruka adminu.
- Sinkronizacija napretka među uređajima kodom u linku, bez računa; poseban link za praćenje samo za pregled.
- Rad bez interneta i ikona za početni zaslon (service worker, manifest).
- 35 pisama u tri kategorije: Povijest, Antika i Informatika.

### Admin
- Prijava lozinkom, ograničenje pokušaja i token koji istječe nakon 12 sati.
- Pregled stanja, pisama, igrača i poruka.
- Uređivač pisma s pregledom uživo, sigurnosna kopija i povratak na prethodnu verziju.
- Stvaranje linkova za igrače, oznake, brisanje i pregled napretka.
- Izvoz pisama i napretka kao JSON.

### Obavijesti
- Kanali: ntfy, Telegram i e-pošta (Resend).
- Obavijest kad igrač uđe u igru, odigra pismo ili nedjeljnu razglednicu, napiše poruku ili reakciju, ili dobije novi čin.

### Infrastruktura
- Vercel funkcije (`api/`) i Upstash Redis.
- Automatska objava na Vercelu pri svakom pushu na `main`, uz pregledne objave za pull requeste.
- GitHub Actions provjera sintakse, valjanosti pisama i konfiguracije.

[1.0.0]: https://github.com/amarjanovicc/jesi-znala/releases/tag/v1.0.0
