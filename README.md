# Usage Time Bar per Claude Desktop (Windows)

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
Claude, compare il pulsante **⏱ 5h 42% · 7d 23%**: ogni finestra è verde se sei
sotto il ritmo, rossa se sei sopra. Premendolo si apre un riquadro (pane) sopra
il prompt, costruito come il popup dei limiti di Claude: "Finestra di contesto ·
307.6k / 1M (31%)" con la sua barra, poi "Limiti di utilizzo del piano" con nome
a sinistra, "Si ripristina tra…/Si azzera…" e percentuale a destra, barra sottile
blu sotto, e in fondo "Visualizza la ripartizione dettagliata" (scrive il
dettaglio nella conversazione).

Il riquadro si chiude in tre modi, come un vero popup: **clic fuori** (il focus
lo lascia), **Esc**, o la **✕** in alto a destra (oltre a ripremere il pulsante).
È una scheda della mod: il popup originale non è modificabile, e mancano le righe
che alle mod non arrivano (limite per singolo modello, crediti cloud).

Per ciascuna finestra (Limite di 5 ore, Settimanale):

* **barra piena arancione**: utilizzo reale comunicato da Claude, invariato;
* **tratto rosso**: la parte di utilizzo che supera il tempo trascorso (sei sopra il ritmo);
* **tratto verde**: il margine tra utilizzo reale e tempo trascorso (sei sotto il ritmo);
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

Comando: `/usage-time` (apre il popup e scrive il riepilogo), `/usage-time mostra` /
`/usage-time nascondi` (fascia fissa sopra il prompt).

## Lingua

I testi (mod e app) si adattano **automaticamente** alla lingua di Windows: italiano o inglese. Si può forzare dalla configurazione della mod (`language = it | en`).

## Icona nella barra di Windows (programma separato)

Oltre alla mod, in [tray/](tray/) c'è un **programma Windows** che mette
un'icona nell'area di notifica (vicino all'orologio): al clic apre lo stesso
popup dei limiti, con clic-fuori/Esc per chiudere. Legge i dati che la mod salva
in `~\.claude\plugins\store\usage-time-bar_*.json` (nessuna rete, nessuna
credenziale). Installazione: `powershell -ExecutionPolicy Bypass -File
tray\install-tray.ps1`. Dettagli in
[tray/README.md](tray/README.md).

## Requisiti

* Windows 10/11, Claude Desktop con scheda Code (motore Claude Code **2.1.295** o
  successivo: lo script lo trova da solo in `%APPDATA%\Claude\claude-code\`).
* Abbonamento Claude (i limiti 5 h / 7 giorni esistono solo lì).
* Nessun privilegio amministrativo.

## Installazione

Da PowerShell, nella cartella del progetto:

```bash
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

Lo script:

1. esegue i 39 test automatici e la validazione ufficiale (`claude plugin test/validate`);
2. salva in `backup\<data-ora>\` una copia di `~\.claude\settings.json`,
   `~\.claude\plugins\installed_plugins.json` e `known_marketplaces.json`, con
   hash SHA-256 verificati (`manifest.json`);
3. registra questa cartella come marketplace locale `usage-time-bar-local`;
4. installa il plugin `usage-time-bar` in ambito utente.

Poi apri una **nuova sessione** nella scheda Code (o esegui `/reload-plugins`). Le
barre compaiono sopra il prompt dopo la prima risposta di Claude (prima il motore
non ha ancora ricevuto i limiti; l'ultimo dato salvato viene comunque mostrato).

**Dopo una modifica al codice**: le sessioni caricano all'avvio una copia in
`~\.claude\plugins\cache\usage-time-bar-local\usage-time-bar\<versione>\`, non la
cartella. Alza `version` in `plugin\.claude-plugin\plugin.json` ed esegui

```bash
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

che aggiorna la copia e verifica che coincida con la cartella. Le sessioni già
aperte continuano con la vecchia versione finché non digiti `/reload-plugins` o
ne apri una nuova.

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
| `refreshSeconds` | `30` | intervallo di ricalcolo del tempo trascorso (min. 5) |
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
│  └─ tests/*.test.ts(x)             39 test automatici
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

## Licenza e avvertenze

Rilasciato sotto licenza [MIT](LICENSE). Progetto della community, **non
ufficiale e non affiliato ad Anthropic**. "Claude" è un marchio di Anthropic.
La progressione temporale ("ritmo") è una stima calcolata localmente, non un
dato ufficiale di utilizzo o di consumo di token.
