# Claude Limits Tray — icona nella barra di Windows

Programma Windows separato (non la mod): mette un'icona nell'area di notifica
(vicino all'orologio) e, al clic, apre un popup con i limiti di utilizzo nello
stesso stile della scheda della mod — Finestra di contesto, Limite di sessione e
Settimanale, con tempo trascorso e ritmo verde/rosso.

## Da dove prende i dati

Da Claude, tramite la mod **usage-time-bar**: la mod legge le risposte dell'API
di Claude Desktop e salva l'ultimo stato (percentuali, orari di reset, finestra
di contesto) in `~\.claude\plugins\store\usage-time-bar_*.json`. Il tray legge
quel file. Quindi:

- nessuna richiesta di rete, nessuna credenziale, nessuna modifica a Claude;
- i dati si aggiornano in tempo reale: ogni secondo il programma controlla se
  la mod ha riscritto il file e ricarica subito; passando il mouse sull'icona
  vedi le percentuali (`Claude · 5h 21% · 7d 32%`). La mod aggiorna il file
  **mentre Claude Desktop è aperto**. Se Claude è chiuso da un po', il popup mostra "Dati non aggiornati".

Perciò il tray richiede che la mod `usage-time-bar` sia installata e che tu abbia
usato Claude Desktop almeno una volta (così il file dei dati esiste).

## Uso

- **Clic sinistro** sull'icona: apre/chiude il popup.
- **Clic fuori** dal popup o **Esc**: lo chiude.
- **Clic destro**: menu *Mostra i limiti*, *Aggiorna*, *Notifiche* (attiva/disattiva), *Esci*.

L'icona è l'orologio di sempre, ma il colore cambia in tempo reale confrontando
l'utilizzo del limite di 5 ore con il tempo trascorso:

- **verde**: più di 5 punti sotto il ritmo;
- **arancione**: da 0 a 5 punti sotto il ritmo (o stima non disponibile);
- **rosso**: sopra il ritmo.

Se non la vedi, è sotto la freccetta `^` "icone nascoste": trascinala sulla
barra per fissarla.

## Notifiche

Il programma avvisa con una notifica di Windows, **una sola volta per finestra**
(5 ore, settimanale):

- quando l'utilizzo supera il **75%** e il **90%** (se le superi insieme, arriva
  solo l'avviso più alto);
- quando consumi **15 punti più in fretta** del tempo che passa (solo prima di
  aver superato una soglia: dopo non serve più);
- quando un limite **si azzera** (anche a Claude chiuso: l'orario di reset è già
  noto).

Si spengono dal menu del clic destro (*Notifiche*). La scelta e gli avvisi già
inviati restano in `%APPDATA%\ClaudeLimitsTray\settings.json`, dove si possono
cambiare anche le soglie (`thresholds`) e lo scarto di ritmo (`paceAlertPts`,
`0` = mai).

## Lingua

I testi del popup e del menu seguono **automaticamente** la lingua di Windows (italiano o inglese).

## Installazione

```bash
powershell -ExecutionPolicy Bypass -File tray\install-tray.ps1
```

Crea l'icona, aggiunge una scorciatoia in *Esecuzione automatica* (l'icona
ricompare a ogni accesso) e avvia il programma. Tutto a livello utente, senza
permessi di amministratore; non tocca Claude Desktop né file di sistema. Per non
avviarlo in automatico all'accesso: aggiungi `-NoStartup`.

## Disinstallazione

```bash
powershell -ExecutionPolicy Bypass -File tray\uninstall-tray.ps1
```

Chiude il programma e toglie l'avvio automatico. Poi puoi cancellare la cartella.

## File

| File | Cosa fa |
| --- | --- |
| `ClaudeLimitsTray.ps1` | il programma: icona + popup + lettura dati |
| `make-icon.ps1` | genera `claude-limits.ico` |
| `run-hidden.vbs` | avvia il programma senza finestra nera |
| `install-tray.ps1` / `uninstall-tray.ps1` | installa / rimuove (con avvio automatico) |

## Limiti

- Mostra le finestre di 5 ore (sessione) e settimanale, come la mod. Non mostra
  il limite per singolo modello né i crediti cloud: alla mod quei dati non
  arrivano.
- Il "tempo trascorso" e il ritmo sono una stima calcolata da reset − durata,
  non un dato ufficiale di Anthropic.
- Tecnologia: PowerShell + WinForms, nessuna dipendenza da installare.
