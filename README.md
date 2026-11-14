# Jesi znala?

Dnevna igra: svaki dan stigne jedno pismo s kratkom pričom, a ispod njega tri pitanja. Riješeno pismo postaje marka u albumu. Uz igru dolazi admin u kojem se pišu pisma, prati napredak i podešavaju obavijesti.

Objavljeno na Vercelu: igra `https://jesi-znala.vercel.app`, admin `https://jesi-znala.vercel.app/admin.html`.

## Što je u projektu

```
public/            ono što vide posjetitelji (generira se, osim admin.html)
  index.html         igra
  admin.html         admin (ručno pisan)
  sw.js, manifest    rad bez interneta i ikona na početnom zaslonu
api/               Vercel funkcije
  facts.js           popis pisama (iz baze, a bez nje iz data/facts.json)
  progress.js        sinkronizacija napretka, link za praćenje, obavijesti
  admin.js           admin API (zaštićen lozinkom)
  _lib.js            zajednički kod
data/              facts.json i config.json (generira se iz src/)
src/
  jesi-znala.html    IZVOR igre, tu se mijenja izgled i pravila
  build.py           iz izvora slaže public/ i data/
```

## Kako radi

- **Baza** je Upstash Redis (Vercel Storage). Drži napredak igrača, pisma koja je admin uredio ili dodao te sigurnosnu kopiju pisama. Bez baze igra radi, ali bez sinkronizacije i bez admina.
- **Pisma** su izvorno u `src/jesi-znala.html`. Čim admin spremi prvu izmjenu, igra ih čita iz baze. Nova pisma dodaju se na kraj, postojeća se mogu uređivati, ali ne brisati (napredak igrača vezan je uz redni broj pisma).
- **Otključavanje:** jedno pismo dnevno, od datuma `START` u `src/jesi-znala.html`.
- **Igrači** nemaju račune. Pristup napredku daje dugi nasumični kod u linku (`/#sync=...`), a admin dobiva poseban link samo za pregled (`/#watch=...`).
- **Obavijesti:** kad povezani igrač otvori igru (najviše jednom u 30 minuta), odigra pismo ili nedjeljnu razglednicu, server pošalje poruku na postavljeni kanal.

## Prvo postavljanje

1. **Baza:** vercel.com, projekt, **Storage**, **Create Database**, **Upstash for Redis**, besplatni plan, **Connect to Project**.
2. **Lozinka za admin** (obavezno). U terminalu, u korijenu projekta:
   ```bash
   npx vercel env add ADMIN_PASSWORD production
   ```
   Zatraži vrijednost, upiši dugu lozinku (barem 12 znakova). Admin bez te varijable odbija prijavu.
3. **Obavijesti** (jedan kanal je dovoljan), najlakše ntfy:
   - instaliraj aplikaciju **ntfy**, pretplati se na dugi tajni naziv teme (admin ga predloži u kartici **Obavijesti**),
   - ```bash
     npx vercel env add NTFY_TOPIC production
     ```
     i zalijepi isti naziv.
   - Telegram: `TELEGRAM_BOT_TOKEN` i `TELEGRAM_CHAT_ID`. E-pošta (Resend): `RESEND_API_KEY` i `NOTIFY_EMAIL`.
4. **Objava:**
   ```bash
   npx vercel deploy --prod
   ```
   Nakon dodavanja varijabli uvijek treba nova objava.

## Svakodnevno

- **Pisati i uređivati pisma:** admin, kartica **Pisma**.
- **Pratiti napredak:** admin, kartica **Igrači**. *Napravi link* za novog igrača, link pošalješ njoj, a kad ga otvori, povezana je.
- **Promjena izgleda ili pravila igre:** uredi `src/jesi-znala.html`, zatim
  ```bash
  npm run site          # složi public/ i data/
  npx vercel deploy --prod
  ```
  (`npm run deploy` radi oboje.)

## Sigurnost

- Admin traži lozinku, ima ograničenje pokušaja prijave (8 u 15 minuta) i token koji istječe nakon 12 sati.
- `ADMIN_PASSWORD`, `NTFY_TOPIC` i ostale tajne nikad ne idu u kod ni u Git (`.gitignore` ih isključuje, vidi `.env.example`).
- Tko ima link `#sync=...`, ima pun pristup napretku tog igrača. Link `#watch=...` samo čita.
- Server ne sprema osobne podatke: samo napredak, oznaku koju upišeš i vrijeme zadnjeg ulaska.
- Tekst pisama prikazuje se kao običan tekst, pa HTML u priči ne može razbiti igru.

## Kad nešto ne radi

- **Prazna stranica na mobitelu:** zatvori karticu (ili aplikaciju s početnog zaslona) i otvori ponovo, mobitel možda drži staru verziju. U podnožju početne piše datum verzije. Dodaj `?debug` adresi za tehnički ispis.
- **Admin kaže da nema lozinke:** nedostaje `ADMIN_PASSWORD` ili nakon dodavanja nije bilo nove objave.
- **Nema obavijesti:** admin, kartica **Obavijesti**, *Pošalji probnu obavijest*. Obavijesti stižu samo za uređaje povezane sinkronizacijom.
- **Dodana su pisma, a igra ih ne prikazuje:** razlika je do jedne minute (predmemorija), zatim osvježi stranicu.

## Što bi se još moglo

Obavijest samo kad se nešto promijeni (već je tako) uz dnevni sažetak, web push umjesto ntfy-ja, više igrača s razdvojenim albumima, uvoz pisama iz tablice, pregled kako je koje pitanje prolazilo, vlastita domena.
