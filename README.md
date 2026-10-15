# Usage Time Bar per Claude Desktop (Windows)

[![CI](https://github.com/Aledallas01/claude-usage-bar-mod/actions/workflows/ci.yml/badge.svg)](https://github.com/Aledallas01/claude-usage-bar-mod/actions/workflows/ci.yml)

Mod che affianca all'**utilizzo reale** dei limiti di 5 ore e settimanale la
**progressione temporale teorica** della finestra:

```
elapsedRatio = clamp((now − windowStart) / (resetAt − windowStart), 0, 1)
```

Così si vede subito se si consuma più in fretta del tempo che passa.

> **Limite importante.** Le barre originali (Impostazioni › Utilizzo) **non si
> possono modificare** su questa versione di Claude Desktop senza disattivare
> protezioni di sicurezza (pacchetto MSIX firmato, fuse Electron di integrità
> dell'asar, rifiuto esplicito di `--remote-debugging-port`, DevTools bloccati).
> Dettagli e prove in [docs/ANALISI.md](docs/ANALISI.md).
> La mod usa quindi il meccanismo di estensione **ufficiale** di Claude Code e
> disegna le proprie barre **nella scheda Code di Claude Desktop**, sopra il
> prompt, con gli stessi dati (`five_hour`, `seven_day`) delle barre originali.

## Cosa mostra

Nel piede del prompt della scheda Code, accanto all'indicatore dei limiti di
Claude, compare il pulsante **⏱ 5h 42% · 7d 23% · Fable 91%**: ogni finestra è **rossa** se
sei sopra il ritmo (anche di poco), **arancione** se sei sotto di 0–5 punti,
**verde** se sei sotto di più di 5 punti o allo 0%. Premendolo si apre un riquadro (pane) sopra
il prompt, costruito come il popup dei limiti di Claude: "Finestra di contesto ·
307.6k / 1M (31%)" con la sua barra, poi "Limiti di utilizzo del piano" con nome
a sinistra, "Si ripristina tra…/Si azzera…" e percentuale a destra, barra sottile
blu sotto, e in fondo "Visualizza la ripartizione dettagliata" (scrive il
dettaglio nella conversazione).

Il riquadro si chiude in tre modi, come un vero popup: **clic fuori** (il focus
lo lascia), **Esc**, o la **✕** in alto a destra (oltre a ripremere il pulsante).
È una scheda della mod: il popup originale non è modificabile. Come nel popup di
Claude, sotto 5 ore e settimanale compaiono anche i **limiti di un singolo
modello** (es. "Settimanale · Fable", con il suo ritmo) e i **crediti per sessioni
cloud** ("250 USD di 250 USD rimanenti", con la scadenza). Questi due arrivano
solo dalla lettura dal server (`serverRefreshSeconds`); se il server non li
comunica, le righe non compaiono.

Per ciascuna finestra (Limite di 5 ore, Settimanale):

* **barra piena arancione**: utilizzo reale comunicato da Claude, invariato;
* **tratto rosso**: la parte di utilizzo che supera il tempo trascorso (sei sopra il ritmo);
* **tratto verde**: il margine tra utilizzo reale e tempo trascorso (sei sotto il ritmo
  di più di 5 punti; **arancione** se il margine è di 5 punti o meno);
  la lunghezza totale arancione+rosso è sempre l'utilizzo reale;
* **linea sottile blu + tacca verticale**: tempo trascorso nella finestra
  (stima calcolata dalla mod, *non* è consumo e non è un dato ufficiale);
* testo: `Utilizzo reale 42% · Tempo trascorso 50% (inizio stimato) · reset tra 2 h 30 min (22:00)`;
* tooltip al passaggio del mouse e testo alternativo per lettori di schermo;
* ritmo: "consumo più rapido del tempo (+12 pt)" quando l'utilizzo supera il tempo
  trascorso di oltre 5 punti.

Casi speciali: senza orario di reset → **"Stima non disponibile"**; reset già
passato → "Reset già avvenuto: in attesa di dati aggiornati" (nessuna
progressione inventata).

**Tempo reale.** Ogni 60 s (`serverRefreshSeconds`) la mod legge i limiti dal
server, la stessa fonte del popup "Limiti di utilizzo del piano" di Claude: le
percentuali si aggiornano anche senza risposte e contano il consumo fatto da
claude.ai. La richiesta la fa il motore con la credenziale della sessione
(`$.session.authorize`): la mod non vede mai il token. Con più sessioni aperte
interroga il server una sola di esse; tutte rileggono il dato condiviso ogni
`refreshSeconds` (10 s). Si aggiungono le letture che arrivano con ogni risposta
di Claude: dentro la stessa finestra vince sempre il valore più alto, così una
lettura in ritardo non riporta indietro la percentuale; dopo il reset vince la
finestra nuova. Il contesto resta quello di ciascuna sessione.

**Consumo di questa sessione.** In fondo alla scheda c'è la riga "Questa
sessione: 5 ore +6% · settimanale +1% (stima)": quanto sono saliti i limiti
mentre questa sessione lavorava (durante i suoi turni e per 2 minuti dopo). I
limiti sono dell'account, quindi è una stima: se nello stesso momento lavora
un'altra sessione o claude.ai, il suo consumo può finire anche qui. Riparte da
zero a ogni nuova sessione e a ogni reset della finestra.

Comando: `/usage-time` (apre il popup e scrive il riepilogo), `/usage-time mostra` /
`/usage-time nascondi` (fascia fissa sopra il prompt).

## Lingua

I testi (mod e app) si adattano **automaticamente** alla lingua di Windows: italiano o inglese. Si può forzare dalla configurazione della mod (`language = it | en`).

## Icona nella barra di Windows (programma separato)

Oltre alla mod, in [tray/](tray/) c'è un **programma Windows**
(`ClaudeLimitsTray.exe`, si disinstalla da *App installate*) che mette
un'icona nell'area di notifica: al clic o con **Ctrl+Alt+L** apre lo stesso
popup dei limiti; l'icona in basso a destra del popup lo sostituisce con un
**popup dei grafici** (utilizzo reale contro il ritmo ideale, con la proiezione
al reset). L'icona cambia colore secondo il ritmo (il peggiore
tra 5 ore e settimanale), il programma manda **notifiche di Windows** (soglie,
ritmo, reset, e se vuoi "usalo o lo perdi" e "non disturbare") e si **aggiorna
con un clic** quando esce una nuova release. Tutto si regola dalla finestra
*Impostazioni*. Legge i dati che la mod salva in
`~\.claude\plugins\store\usage-time-bar_*.json` (nessuna credenziale; l'unica
richiesta di rete è il controllo delle release su GitHub, disattivabile).
Installazione: `powershell -ExecutionPolicy Bypass -File tray\install-tray.ps1`.
Dettagli in [tray/README.md](tray/README.md).

## Requisiti

* Windows 10/11, Claude Desktop con scheda Code (motore Claude Code **2.1.295** o
  successivo: lo script lo trova da solo in `%APPDATA%\Claude\claude-code\`).
* Abbonamento Claude (i limiti 5 h / 7 giorni esistono solo lì).
* Nessun privilegio amministrativo.

## Installazione

### Rapida, da GitHub (un terminale con Claude Code)

Nel prompt di una sessione di Claude Code **da terminale** (`claude`):

```
/plugin install usage-time-bar --marketplace Aledallas01/claude-usage-bar-mod
```

Rispondi `y` per aggiungere il marketplace, scegli l'ambito **utente** e il
plugin è subito attivo, senza riavvii. In ambito utente vale anche per la scheda
Code di Claude Desktop (nuove sessioni, o `/reload-plugins`). Gli aggiornamenti
arrivano con `/plugin` › marketplace `usage-time-bar` › aggiorna, oppure
`claude plugin update usage-time-bar@usage-time-bar`.

> Nella scheda Code di Claude Desktop il comando `/plugin` non è disponibile:
> lì usa l'installazione dalla cartella qui sotto. L'icona nella barra di Windows
> (`tray\`) richiede comunque la cartella del progetto.

### Dalla cartella del progetto (Windows, con script)

Da PowerShell, nella cartella del progetto:

```bash
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

Lo script:

1. esegue i test automatici e la validazione ufficiale (`claude plugin test/validate`);
2. salva in `backup\<data-ora>\` una copia di `~\.claude\settings.json`,
   `~\.claude\plugins\installed_plugins.json` e `known_marketplaces.json`, con
   hash SHA-256 verificati (`manifest.json`);
3. registra questa cartella come marketplace `usage-time-bar` (se trova il vecchio
   nome `usage-time-bar-local` delle versioni fino alla 0.6, lo migra);
4. installa il plugin `usage-time-bar` in ambito utente.

Poi apri una **nuova sessione** nella scheda Code (o esegui `/reload-plugins`). Le
barre compaiono subito con i dati del server, o dopo la prima risposta di Claude.

**Dopo una modifica al codice**: con il marketplace sulla cartella, le sessioni
leggono il plugin dalla cartella stessa, quindi basta `/reload-plugins`. Per
registrare una nuova versione alza `version` in `plugin\.claude-plugin\plugin.json`
ed esegui

```bash
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

che aggiorna la copia in `~\.claude\plugins\cache\usage-time-bar\usage-time-bar\<versione>\`
e verifica che coincida con la cartella.

## Disinstallazione e ripristino

```bash
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

Rimuove il plugin e il marketplace locale con i comandi ufficiali. Con
`-RestoreBackup` ripristina anche i tre file di configurazione dall'ultimo backup
(dopo averne verificato gli hash): usalo solo se nel frattempo non hai cambiato
altre impostazioni di Claude Code. Infine si può cancellare la cartella del
progetto. Nessun file di Claude Desktop viene mai toccato, quindi non c'è nulla da
ripristinare nell'app.

## Configurazione

Opzioni del plugin (menu `/config` della scheda Code, o `claude plugin configure usage-time-bar`):

| Opzione | Predefinito | Effetto |
| --- | --- | --- |
| `language` | `auto` | lingua dei testi: `auto` (segue il sistema), `it`, `en` |
| `showButton` | `true` | pulsante ⏱ nel piede del prompt che apre il popup |
| `showBand` | `false` | barre sempre visibili sopra il prompt (anche `/usage-time mostra`) |
| `showStatus` | `false` | riepilogo compatto `5h 42% ⏱50% · 7d 18% ⏱43%` nella riga di stato |
| `serverRefreshSeconds` | `60` | ogni quanto leggere i limiti dal server (min. 30; `0` = solo dalle risposte di Claude) |
| `refreshSeconds` | `10` | ogni quanto rileggere i limiti (anche da altre sessioni) e ricalcolare il tempo trascorso (min. 5) |
| `fiveHourWindowHours` | `5` | durata usata per stimare l'inizio della finestra `five_hour` |
| `sevenDayWindowDays` | `7` | durata usata per stimare l'inizio della finestra `seven_day` |

## Architettura

```
ClaudeUsageBarMod/
├─ .claude-plugin/marketplace.json   marketplace locale (sorgente ./plugin)
├─ plugin/
│  ├─ .claude-plugin/plugin.json     manifest + opzioni utente
│  ├─ hooks/hooks.json               punta a register.tsx
│  ├─ hooks/register.tsx             eventi: session.start, session.measure,
│  │                                 ui.render(AbovePrompt), command.run
│  ├─ hooks/lib/timeWindow.ts        calcolo temporale puro (nessuna UI)
│  ├─ hooks/lib/windows.ts           rilevamento finestre five_hour / seven_day
│  ├─ hooks/lib/ui.tsx               barre SVG (desktop) e a caratteri (terminale)
│  ├─ hooks/lib/config.ts            lettura opzioni
│  ├─ types/index.d.ts               contratto dello stato ($.state)
│  └─ tests/*.test.ts(x)             test automatici (claude plugin test)
├─ scripts/install.ps1 · uninstall.ps1 · check.ps1 · common.ps1
└─ docs/ANALISI.md                   analisi dell'installazione reale
```

* **Calcolo** su istanti assoluti UTC: fusi orari e ora legale influiscono solo
  sulla formattazione. Timestamp accettati in secondi, millisecondi, ISO 8601, Date.
* **Idempotenza**: la fascia è ridisegnata dal motore a ogni aggiornamento a
  partire dallo stato; non esiste DOM da "patchare" due volte. Un ricaricamento
  della mod azzera i timer del modulo e ne crea uno solo.
* **Valori reali invariati**: la mod osserva `session.measure` e lo inoltra con
  `next(e)` senza modificarlo; la percentuale mostrata è quella ricevuta.

## Verifica senza installare

```bash
powershell -ExecutionPolicy Bypass -File scripts\check.ps1
```

Test del programma tray (sintassi, parti native, logica), senza dipendenze:

```bash
powershell -ExecutionPolicy Bypass -File tray\tests\run-tests.ps1
```

A ogni push GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml))
esegue questi test su Windows, compila `ClaudeLimitsTray.exe` e lancia
validazione e test della mod con la CLI di Claude Code.

## Licenza e avvertenze

Rilasciato sotto licenza [MIT](LICENSE). Progetto della community, **non
ufficiale e non affiliato ad Anthropic**. "Claude" è un marchio di Anthropic.
La progressione temporale ("ritmo") è una stima calcolata localmente, non un
dato ufficiale di utilizzo o di consumo di token.
