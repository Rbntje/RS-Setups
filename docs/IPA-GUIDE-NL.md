# iPhone IPA Downloaden, Signen & Installeren (Nederlands)

RS Setups gebruikt **Capacitor** om precies dezelfde app-code om te zetten naar een echt iOS Xcode-project in de map `ios/`.

## 1. Waar vind ik het `.ipa`-bestand?

1. Ga op GitHub naar jouw repository en klik op **Actions**.
2. Open de meest recente succesvolle run van **Build Unsigned iOS IPA**.
3. Scrol helemaal naar beneden naar **Artifacts**.
4. Klik op **`RS-Setups-v0.0.0-unsigned-ipa`** om hem te downloaden.
5. GitHub verpakt artifacts altijd als een `.zip`-bestand. Pak die `.zip` één keer uit: daarin vind je **`RS-Setups-unsigned.ipa`** en het bouwlogboek `xcodebuild.log`.

## 2. Waarom is de IPA "unsigned"?

Om een app op een iPhone te mogen installeren, eist Apple een digitale handtekening (certificate + provisioning profile). Omdat jouw privé-certificaat niet in deze GitHub-repository thuishoort, bouwt GitHub Actions een schone **ongetekende `.ipa`** zonder `_CodeSignature`.

Een ongetekende `.ipa` kun je **niet direct** openen op een normale iPhone zonder eerst te signen.

## 3. Hoe sign en installeer ik hem op mijn iPhone?

1. **Kies jouw eigen signing-methode**, bijvoorbeeld:
   - **Sideloadly** of **AltStore / SideStore** (met je gratis of betaalde Apple ID)
   - **Feather / ESign / eigen developer-certificaat** (direct op iPhone signen)
   - **Xcode** op een Mac (via *Window → Devices and Simulators* na opnieuw signen)
2. Laad `RS-Setups-unsigned.ipa` in jouw signing-tool.
3. Laat de app signen en installeren op je iPhone.
4. De eerste keer bij gratis/eigen certificaten: open op je iPhone **Instellingen → Algemeen → VPN en apparaatbeheer** en tik op **Vertrouw** bij jouw ontwikkelaarsprofiel.

## 4. Belangrijk bij updates of herinstallatie

Alle setups, feedback en je rijprofiel staan online in **Cloudflare D1** — nooit alleen in het geheugen van de iPhone-app. Als je de app verwijdert en een nieuwere versie installeert, log je gewoon weer in met hetzelfde e-mailadres en wachtwoord en al je setups verschijnen direct opnieuw.
