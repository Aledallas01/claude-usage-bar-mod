# Analisi dell'installazione reale di Claude Desktop

Eseguita il 10/10/2026 su questa macchina, con soli metodi di lettura (nessun file
dell'app modificato).

## Ambiente

| Elemento | Valore rilevato | Come |
| --- | --- | --- |
| Sistema | Windows 11 Pro 10.0.26200 | `[Environment]::OSVersion` |
| Claude Desktop | 2.31226.1, pacchetto MSIX `Claude_2.31226.1.0_x64__pzs8sxrjxfjjc` | `Get-AppxPackage` |
| Percorso | `C:\Program Files\WindowsApps\Claude_…\app\claude.exe` | idem |
| Firma | Authenticode valida, `CN="Anthropic, PBC"` | `Get-AuthenticodeSignature` |
| Tecnologia | **Electron** (non WebView2): `resources\app.asar`, `*.pak`, `v8_context_snapshot.bin` | elenco file |
| Motore della scheda Code | Claude Code 2.1.295 in `%APPDATA%\Claude\claude-code\2.1.295\` | processi attivi |

## Dove nascono le barre di utilizzo

* L'interfaccia è una SPA React **impacchettata localmente** in
  `resources\ion-dist\` (`index.html` + `assets\v1\*.js`, minificati, **senza
  source map**).
* Le stringhe delle barre sono in `resources\it-IT.json` / `en-US.json`:
  `RLsDPY9y1h` = "Limite di 5 ore", `AzoE5A+j8A` = "Settimanale · tutti i modelli",
  `qSgK8yJV+p` = "{pct} · resets {when}", `oUpZT/Xo6m` = "Plan usage limits".
* Il bundle `assets\v1\c7eb7523c-*.js` mappa i tipi di limite del server
  (`five_hour → 5h`, `seven_day → 7d`, `seven_day_opus`, `seven_day_sonnet`, …) in
  oggetti `{ status, resets_at, utilization, surpassed_threshold }`;
  `c51de9054-*.js` contiene il componente che legge `x?.five_hour`,
  `utilization`, `resetsAt`.
* **I dati comunicati sono solo percentuale (`utilization`) e reset
  (`resets_at`)**: non esiste un campo "inizio finestra". L'app conserva inoltre
  campioni storici in `%APPDATA%\Claude\plan-usage-history.json`
  (`{"t": ms, "u": {"fh": %, "sd": %}}`), senza orari di inizio.

## Perché le barre originali non si possono modificare direttamente

Ogni via di iniezione nella SPA originale è chiusa da una protezione deliberata;
aggirarla violerebbe i vincoli del progetto (niente firme, sandbox o protezioni
Electron disattivate).

1. **File dell'app**: `app.asar` e `ion-dist` stanno in `WindowsApps`, cartella del
   pacchetto MSIX firmato, scrivibile solo da TrustedInstaller; modificarli
   invaliderebbe la firma del pacchetto.
2. **Fuse Electron** (letti dal binario, sentinella `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`):
   `EnableEmbeddedAsarIntegrityValidation=1`, `OnlyLoadAppFromAsar=1`
   (un asar alterato o una cartella `app/` alternativa non vengono caricati),
   `RunAsNode=0`, `EnableNodeOptionsEnvironmentVariable=0`,
   `EnableNodeCliInspectArguments=0` (niente `NODE_OPTIONS`/`--inspect`).
3. **Debug remoto**: il processo principale contiene una lista di switch vietati
   (`remote-debugging-port`, `remote-debugging-pipe`, `disable-web-security`,
   `host-rules`, …) e, se ne trova uno, termina con *"refusing to start — a debugging
   or network-override switch is present on the command line"*. L'iniezione via
   Chrome DevTools Protocol è quindi bloccata.
4. **DevTools**: le voci di menu e la scorciatoia Ctrl+Alt+I sono condizionate da un
   controllo interno (modalità sviluppatore/staff), non da un'opzione utente.
5. **API ufficiali delle mod** (Claude Code 2.1.295): i componenti che una mod può
   ridisegnare sono `AskUserQuestion, UserMessage, AssistantMessage, ToolUse,
   ToolResult, ToolGroup, CommandOutput, ToolProgress, Spinner, TurnDuration,
   InfoNotice, SessionMode, PromptHint, AbovePrompt, Pane`. Le barre dei limiti
   non sono tra questi.

## Metodo scelto

Il primo metodo della scala richiesta che è effettivamente disponibile: il
**meccanismo ufficiale di estensione** (mod di Claude Code a moduli di hook),
caricato dall'app desktop nella scheda Code.

* **Dati**: la mod legge `SessionRateLimit { kind, percentUsed, resetsAt }` dall'evento
  `session.measure` e da `$.session.usage()`: sono le stesse finestre `five_hour` e
  `seven_day` che alimentano le barre originali, ricevute dal motore con le risposte
  dell'API. Nessuna richiesta di rete aggiuntiva, nessun dato di autenticazione letto.
* **Inizio finestra**: non è comunicato, quindi viene ricavato come
  `resetAt − durata`, con la durata desunta dall'identificativo della finestra
  (`five_hour` = 5 h, `seven_day` = 7 × 24 h assolute), configurabile. La UI lo
  dichiara come "inizio stimato". Senza `resetsAt` mostra "Stima non disponibile".
* **Disegno**: fascia `AbovePrompt` della scheda Code (superficie `desktop`, con
  ripiego a caratteri per la superficie `terminal`).

Non è stato scelto un overlay esterno: la mod ufficiale vive dentro la finestra di
Claude Desktop, rispetta il tema e non richiede processi aggiuntivi.

## Progetti open source

Non consultati: la sessione non ha usato l'accesso a Internet. Le tecniche note
per altre app Electron (patch dell'asar, `--remote-debugging-port`, `NODE_OPTIONS`)
risultano comunque bloccate su questa versione dai controlli elencati sopra.
