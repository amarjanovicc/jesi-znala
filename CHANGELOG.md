# Povijest promjena

Format prati [Keep a Changelog](https://keepachangelog.com/hr/1.1.0/), a verzije [semantičko verzioniranje](https://semver.org/lang/hr/).

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
