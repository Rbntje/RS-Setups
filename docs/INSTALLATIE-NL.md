# RS Setups — Simpele Handleiding (Van Google AI Studio naar GitHub & iPhone)

Alles draait **100% lokaal op je telefoon en browser**:
- **Geen accounts, driver-namen, team-namen of wachtwoorden** — je begint met een helemaal schone garage (0 setups) en twee automatische mapjes (**2025** en **2026**).
- **Eigen gecodeerde AI (altijd actief) & 200 MB limiet** — de lokale TypeScript-AI bewaakt continu de parameters, ruimt overbodige dubbele logs/gewichten automatisch op en blijft altijd onder de **200 MB** opslaglimiet.
- **Alleen telefoonformaat** — op computer/laptop zie je altijd de strakke iPhone-preview (`393px`) met links het beheerpaneel & directe `.ipa`-download.

---

## 1. Bestanden uit Google AI Studio op je computer krijgen & naar GitHub pushen

Omdat alle code nu nog hier in Google AI Studio staat, haal je het project eerst als ZIP binnen:

### Stap A: Downloaden vanuit Google AI Studio
1. Klik rechtsboven (of in het menu naast je app-naam in Google AI Studio) op **Download** / **Export as ZIP** *(of Save to GitHub als je GitHub direct gekoppeld is)*.
2. Sla het ZIP-bestand op en pak het uit naar een map op je computer (bijv. `C:\Projects\rs-setups` op Windows of `~/Projects/rs-setups` op Mac).

### Stap B: Lege repository maken op GitHub
1. Ga naar [github.com/new](https://github.com/new).
2. Geef als naam bijv. **`rs-setups`**.
3. Laat **Add a README file**, **.gitignore** en **license** **uitgevinkt** (anders botst het bij pushen) en klik op **Create repository**.

### Stap C: Pushen naar GitHub vanaf je computer
Open Terminal (Mac) of PowerShell (Windows) **in de uitgepakte map `rs-setups`** en voer deze 5 commando's uit:

```bash
git init -b main
git add .
git commit -m "RS Setups: iPhone UI, folders, coded AI & 200MB optimizer"
git remote add origin https://github.com/JOUW-GEBRUIKERSNAAM/rs-setups.git
git push -u origin main
```

*(Vervang `JOUW-GEBRUIKERSNAAM` door jouw echte GitHub-gebruikersnaam. Heb je **GitHub Desktop** op je computer? Dan kun je ook gewoon **File → Add Local Repository**, die map kiezen, **Commit to main** en op **Publish repository** klikken — zonder terminal!)*

---

## 2. Live zetten als Website + Telefoon-app (GitHub Pages — Gratis)

1. Open jouw repository op GitHub -> **Settings** -> **Pages**.
2. Zet **Source** op **GitHub Actions**.
3. Na de push bouwt GitHub Pages automatisch jouw site binnen ~1 minuut op:
   `https://JOUW-GEBRUIKERSNAAM.github.io/rs-setups/`

### Direct op je iPhone zetten (5 seconden, zonder developer-account):
1. Open jouw link in **Safari** op je iPhone.
2. Tik onderin op het **Deel-icoon** -> **Zet op beginscherm** -> **Voeg toe**.

---

## 3. Direct de `.ipa` downloaden vanuit de website

Zodra je naar `main` hebt gepusht:
1. GitHub Actions (`.github/workflows/build-ios.yml`) bouwt automatisch het `.ipa` bestand en zet die onder release **`ipa-latest`**.
2. Open jouw website -> links naast de iPhone-preview (of op telefoon onder **Settings → iPhone App & .IPA Download**) klik je op **Download .IPA**.
3. De app haalt de echte bestandsgrootte en directe downloadlink automatisch uit jouw gekoppelde repository (of stel éénmalig `gebruikersnaam/rs-setups` in).
