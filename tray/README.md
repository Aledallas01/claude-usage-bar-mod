# Claude Limits Tray — icona nella barra di Windows

Programma Windows separato (non la mod): mette un'icona nell'area di notifica
(vicino all'orologio) e apre un popup con i limiti di utilizzo nello stesso
stile della scheda della mod — Finestra di contesto, Limite di sessione,
Settimanale, i limiti di un singolo modello (es. "Settimanale · Fable") con tempo
trascorso e ritmo, e i crediti per sessioni cloud con la scadenza.

È un vero programma: `ClaudeLimitsTray.exe` (in Gestione attività compare come
**Claude Limits Tray**), con avvio automatico e la voce in *Impostazioni → App →
App installate*, da dove si disinstalla.

## Da dove prende i dati

Da Claude, tramite la mod **usage-time-bar**: la mod legge le risposte dell'API
di Claude Desktop e salva l'ultimo stato (percentuali, orari di reset, finestra
di contesto) in `~\.claude\plugins\store\usage-time-bar_*.json`. Il tray legge
quel file. Quindi:

- nessuna credenziale, nessuna modifica a Claude;
- i dati si aggiornano in tempo reale: ogni secondo il programma controlla se
  la mod ha riscritto il file e ricarica subito; passando il mouse sull'icona
  vedi le percentuali (`Claude · 5h 21% · 7d 32%`). La mod aggiorna il file
  **mentre Claude Desktop è aperto**. Se Claude è chiuso da un po', il popup mostra "Dati non aggiornati".

L'unica richiesta di rete del programma è il **controllo delle nuove versioni**
sulla pagina pubblica delle release di GitHub (all'avvio e ogni 6 ore; nessun
dato tuo viene inviato). Si spegne dalle impostazioni.

Perciò il tray richiede che la mod `usage-time-bar` sia installata e che tu abbia
usato Claude Desktop almeno una volta (così il file dei dati esiste).

## Uso

- **Clic sinistro** sull'icona o **Ctrl+Alt+L** (da qualsiasi programma): apre/chiude il popup.
- **Clic fuori** dal popup o **Esc**: lo chiude.
- **Mostra grafici** (in alto a destra nel popup): sotto il limite di 5 ore e il
  settimanale compare un piccolo grafico dall'inizio della finestra al reset,
  con l'utilizzo reale (blu) e il ritmo ideale (diagonale tratteggiata). Se la
  linea blu sta sotto la diagonale, sei sotto il ritmo. Lo storico è quello
  registrato dal programma più quello che salva Claude Desktop.
- **Clic destro**: menu scuro con *Mostra i limiti*, *Aggiorna*, *Notifiche*
  (attiva/disattiva), *Colore dell'icona*, *Impostazioni…*, *Aggiorna alla
  vX.Y.Z* (quando c'è una nuova versione) ed *Esci*.

Il popup si apre sul monitor dove si trova il mouse, nell'angolo vicino alla
barra delle applicazioni, ed è nitido anche con il ridimensionamento al 125–150%.

L'icona è l'orologio di sempre, ma il colore cambia in tempo reale confrontando
l'utilizzo con il tempo trascorso. Di base guarda **sia il limite di 5 ore sia il
settimanale** e mostra quello messo peggio (rosso prima di arancione, arancione
prima di verde). I limiti di un singolo modello (es. Fable) non cambiano il
colore. Con le soglie predefinite:

- **verde**: più di 5 punti sotto il ritmo;
- **arancione**: da 0 a 5 punti sotto il ritmo (o stima non disponibile);
- **rosso**: sopra il ritmo.

Se non la vedi, è sotto la freccetta `^` "icone nascoste": trascinala sulla
barra per fissarla.

## Impostazioni

Dal menu, *Impostazioni…* apre una finestra con un menu laterale:

| Sezione | Cosa si regola |
| --- | --- |
| Icona | icona colorata sì/no; limite che decide il colore (entrambi, solo 5 ore, solo settimanale); soglie dell'arancione e del rosso |
| Popup | grafici aperti di base; scorciatoia da tastiera sì/no e combinazione |
| Notifiche | notifiche sì/no; soglie di utilizzo (75, 90); avviso di ritmo; **non disturbare** con la fascia oraria (spento di base) |
| Usalo o lo perdi | avviso tipo "Tra 30 min si azzera e ti resta il 60%" (**spento di base**): preavviso per 5 ore e settimanale, quota minima rimasta |
| Aggiornamenti | controllo automatico, "Controlla ora", aggiornamento con un clic, link al progetto e alla cartella dei dati |

Le modifiche valgono con **Salva**; *Predefinite* rimette i valori iniziali. Il
tutto è salvato in `%APPDATA%\ClaudeLimitsTray\settings.json`, insieme agli
avvisi già inviati; lo storico per i grafici è in `history.json` nella stessa
cartella.

## Notifiche

Il programma avvisa con una notifica di Windows, **una sola volta per finestra**
(5 ore, settimanale) e una alla volta:

- quando l'utilizzo supera le soglie (di base **75%** e **90%**; se le superi
  insieme, arriva solo l'avviso più alto);
- quando consumi **15 punti più in fretta** del tempo che passa (solo prima di
  aver superato una soglia);
- quando un limite **si azzera**;
- se attivo, **usalo o lo perdi**: poco prima del reset (di base 30 min per le
  5 ore, 12 ore per il settimanale) se ti resta almeno il 40%.

Con **non disturbare** attivo, nella fascia oraria scelta non arriva nulla: gli
avvisi ancora validi arrivano alla fine della fascia. Cliccando una notifica si
apre il popup.

## Aggiornamenti

Quando su GitHub esce una release più nuova di quella installata, arriva una
notifica e nel menu compare **Aggiorna alla vX.Y.Z**. Un clic:

1. chiude il programma;
2. scarica la nuova versione con `git pull --ff-only` (solo se la cartella è un
   clone git senza modifiche locali: altrimenti si ferma e lo dice);
3. fa il backup delle impostazioni di Claude Code e aggiorna la mod
   (`scripts\update.ps1`);
4. ricompila `ClaudeLimitsTray.exe`;
5. riavvia il programma, che mostra l'esito. Poi nella scheda Code di Claude
   digita `/reload-plugins`.

Il registro è in `%APPDATA%\ClaudeLimitsTray\update.log`. Se la cartella non è
un clone git, il clic apre la pagina della release da scaricare a mano.

## Lingua

I testi del popup, del menu e delle impostazioni seguono **automaticamente** la
lingua di Windows (italiano o inglese).

## Installazione

```bash
powershell -ExecutionPolicy Bypass -File tray\install-tray.ps1
```

Tutto a livello utente, senza permessi di amministratore; non tocca Claude
Desktop né file di sistema:

1. crea l'icona;
2. chiude una copia già aperta;
3. compila `tray\bin\ClaudeLimitsTray.exe` con il compilatore C# incluso in
   Windows (niente da scaricare; se non riesce usa lo script PowerShell come
   prima; `-NoExe` per saltare);
4. aggiunge la scorciatoia in *Esecuzione automatica* (salta con `-NoStartup`);
5. aggiunge la voce "Claude Limits Tray" in *App installate*
   (`HKCU\...\Uninstall\ClaudeLimitsTray`);
6. avvia il programma.

## Disinstallazione

Da *Impostazioni → App → App installate → Claude Limits Tray → Disinstalla*,
oppure:

```bash
powershell -ExecutionPolicy Bypass -File tray\uninstall-tray.ps1
```

Chiude il programma, toglie l'avvio automatico, la voce in App installate e
l'eseguibile. Con `-RemoveData` cancella anche impostazioni e storico. La mod di
Claude resta: per toglierla usa `scripts\uninstall.ps1`.

## File

| File | Cosa fa |
| --- | --- |
| `ClaudeLimitsTray.ps1` | il programma: icona, popup, grafici, menu, impostazioni, notifiche, aggiornamenti |
| `lib\TrayCore.ps1` | la logica senza interfaccia (dati, ritmo, notifiche, storico, versioni) |
| `lib\TrayNative.cs` | parti native: menu e controlli scuri, DPI, scorciatoia globale |
| `lib\TrayInstall.ps1` | funzioni comuni di installazione e disinstallazione |
| `host\TrayHost.cs`, `build-exe.ps1` | sorgente e compilazione di `ClaudeLimitsTray.exe` |
| `self-update.ps1` | aggiornamento con un clic |
| `make-icon.ps1` | genera `claude-limits.ico` |
| `run-hidden.vbs` | avvio senza .exe (ripiego) |
| `install-tray.ps1` / `uninstall-tray.ps1` | installa / rimuove |
| `tests\run-tests.ps1` | test automatici (anche su GitHub Actions) |

## Limiti

- Il "tempo trascorso" e il ritmo sono una stima calcolata da reset − durata,
  non un dato ufficiale di Anthropic.
- I grafici partono da 0 all'inizio della finestra e usano i campioni
  disponibili: tra due campioni la linea è una stima.
- Tecnologia: PowerShell 5.1 + WinForms + un po' di C# compilato in locale,
  nessuna dipendenza da installare.
