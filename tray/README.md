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
- i dati si aggiornano quando la mod li aggiorna, cioè **mentre usi Claude
  Desktop**. Se Claude è chiuso da un po', il popup mostra "Dati non aggiornati".

Perciò il tray richiede che la mod `usage-time-bar` sia installata e che tu abbia
usato Claude Desktop almeno una volta (così il file dei dati esiste).

## Uso

- **Clic sinistro** sull'icona: apre/chiude il popup.
- **Clic fuori** dal popup o **Esc**: lo chiude.
- **Clic destro**: menu *Mostra i limiti*, *Aggiorna*, *Esci*.

L'icona è l'orologio arancione, vicino all'orologio di Windows (se non la vedi,
è sotto la freccetta `^` "icone nascoste": trascinala sulla barra per fissarla).

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
