import { getClub, getEffectiveStrength, getLeague, formatStars, starsLabel } from './data/clubs'
import {
  acceptOffer,
  acceptStartingOffer,
  applyPreseasonDecision,
  continueAfterWinter,
  declineMidSeasonTransfers,
  dismissMatchResult,
  draftNewCareer,
  estimatePlayChance,
  hasMidSeasonOffers,
  openMidSeasonTransfers,
  openPreseasonDecision,
  openTransferChoice,
  openWinterDecision,
  openWinterLoans,
  openWinterTransfers,
  playCareerMatchday,
  resolveKeyMatch,
  sortedStandings,
  playerTablePosition,
  stayAtClub,
} from './systems/career'
import { describeRival, cupLadderSteps, matchAppearanceChance } from './systems/seasonSim'
import { nextPlayerFixture } from './systems/matchday'
import { actionLabel, mountMatchMoment } from './systems/matchMoment'
import { clearSave, hasSave, loadState, saveState } from './state/gameState'
import type { GameState, MatchAction, Position, PreferredFoot } from './state/types'
import { createEmptyState, cupCompetitionName, cupStageLabel, footLabel } from './state/types'

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'NP', label: 'Napastnik' },
  { id: 'POM', label: 'Ofensywny pomocnik' },
  { id: 'ŚO', label: 'Defensywny pomocnik' },
  { id: 'OB', label: 'Obrońca' },
]

export class App {
  private root: HTMLElement
  private state: GameState
  private cleanupMoment: (() => void) | null = null
  private selectedAction: MatchAction | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.state = hasSave() ? loadState() : createEmptyState()
    if (!this.state.player) this.state.screen = 'home'
    else if (this.state.screen === 'careerEnd') {
      /* keep */
    } else if (!this.state.season && this.state.screen !== 'startOffers') this.state.screen = 'home'
  }

  start(): void {
    this.render()
  }

  private persist(): void {
    if (this.state.player) saveState(this.state)
  }

  private go(mutate: () => void): void {
    this.cleanupMoment?.()
    this.cleanupMoment = null
    mutate()
    this.persist()
    this.render()
  }

  private render(): void {
    switch (this.state.screen) {
      case 'home':
        this.root.innerHTML = this.homeHtml()
        this.bindHome()
        break
      case 'create':
        this.root.innerHTML = this.createHtml()
        this.bindCreate()
        break
      case 'startOffers':
        this.root.innerHTML = this.startOffersHtml()
        this.bindStartOffers()
        break
      case 'hub':
        this.root.innerHTML = this.hubHtml()
        this.bindHub()
        break
      case 'decision':
        this.root.innerHTML = this.decisionHtml()
        this.bindDecision()
        break
      case 'keyMatch':
        this.root.innerHTML = this.keyMatchHtml()
        this.bindKeyMatch()
        break
      case 'matchResult':
        this.root.innerHTML = this.matchResultHtml()
        this.bindMatchResult()
        break
      case 'seasonReport':
        this.root.innerHTML = this.seasonReportHtml()
        this.bindSeasonReport()
        break
      case 'transferChoice':
        this.root.innerHTML = this.transferChoiceHtml()
        this.bindTransferChoice()
        break
      case 'winterBreak':
        this.root.innerHTML = this.winterBreakHtml()
        this.bindWinterBreak()
        break
      case 'careerEnd':
        this.root.innerHTML = this.careerEndHtml()
        this.bindCareerEnd()
        break
      case 'seasonEnd':
        this.state.screen = 'hub'
        this.render()
        break
    }
  }

  private shell(body: string, title?: string): string {
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">Kariera</div>
          ${title ? `<div class="topbar-title">${title}</div>` : ''}
        </header>
        <main class="content">${body}</main>
      </div>
    `
  }

  private homeHtml(): string {
    const canContinue = hasSave()
    return this.shell(`
      <section class="hero-panel">
        <p class="eyebrow">Symulator piłkarza</p>
        <h1>Sezon w jeden ruch</h1>
        <p class="lead">Połowa sezonu, przerwa zimowa, rywal o skład, kontrakty i wypożyczenia. Kluczowe mecze rozgrywasz Ty.</p>
        <div class="actions">
          ${canContinue ? `<button class="btn primary" id="btn-continue">Kontynuuj</button>` : ''}
          <button class="btn ${canContinue ? 'ghost' : 'primary'}" id="btn-new">Nowa gra</button>
        </div>
      </section>
    `)
  }

  private bindHome(): void {
    this.root.querySelector('#btn-continue')?.addEventListener('click', () => {
      this.state = loadState()
      if (!this.state.player) this.state.screen = 'create'
      else if (this.state.screen === 'home' || this.state.screen === 'create') {
        this.state.screen = this.state.season ? 'hub' : 'startOffers'
      }
      this.render()
    })
    this.root.querySelector('#btn-new')?.addEventListener('click', () => {
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'create'
      this.render()
    })
  }

  private createHtml(): string {
    const options = POSITIONS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')
    return this.shell(
      `
      <section class="panel">
        <h2>Nowy zawodnik</h2>
        <p class="muted">Ustaw profil. Potem 4 oferty z II i III ligi. Pozycje: napastnik, ofensywny / defensywny pomocnik, obrońca.</p>
        <label class="field"><span>Imię i nazwisko</span>
          <input id="player-name" maxlength="24" placeholder="np. Jan Kowalski" autocomplete="off" /></label>
        <label class="field"><span>Pozycja</span><select id="player-pos">${options}</select></label>
        <label class="field"><span>Noga dominująca</span>
          <select id="player-foot">
            <option value="right">Prawa</option>
            <option value="left">Lewa</option>
            <option value="both">Obunożny</option>
          </select></label>
        <label class="field"><span>Wiek: <strong id="age-val">17</strong></span>
          <input id="player-age" type="range" min="16" max="22" value="17" /></label>
        <label class="field"><span>Overall: <strong id="ovr-val">52</strong></span>
          <input id="player-ovr" type="range" min="45" max="68" value="52" /></label>
        <div class="actions">
          <button class="btn primary" id="btn-start">Szukaj ofert</button>
          <button class="btn ghost" id="btn-back">Wróć</button>
        </div>
      </section>`,
      'Tworzenie',
    )
  }

  private bindCreate(): void {
    const ageInput = this.root.querySelector('#player-age') as HTMLInputElement
    const ovrInput = this.root.querySelector('#player-ovr') as HTMLInputElement
    const ageVal = this.root.querySelector('#age-val')!
    const ovrVal = this.root.querySelector('#ovr-val')!

    ageInput.addEventListener('input', () => {
      ageVal.textContent = ageInput.value
    })
    ovrInput.addEventListener('input', () => {
      ovrVal.textContent = ovrInput.value
    })

    this.root.querySelector('#btn-back')?.addEventListener('click', () => {
      this.go(() => {
        this.state.screen = 'home'
      })
    })
    this.root.querySelector('#btn-start')?.addEventListener('click', () => {
      this.go(() =>
        draftNewCareer(this.state, {
          name: (this.root.querySelector('#player-name') as HTMLInputElement).value,
          position: (this.root.querySelector('#player-pos') as HTMLSelectElement).value as Position,
          preferredFoot: (this.root.querySelector('#player-foot') as HTMLSelectElement)
            .value as PreferredFoot,
          age: Number(ageInput.value),
          overall: Number(ovrInput.value),
        }),
      )
    })
  }

  private startOffersHtml(): string {
    const p = this.state.player!
    const cards = this.state.transferOffers
      .map((o) => {
        const c = getClub(o.clubId)
        const chance = o.playChance ?? 50
        return `
          <button class="choice" data-offer="${o.clubId}">
            <strong>${c.name}</strong>
            <span>${getLeague(o.leagueId).name} · ${formatStars(c.stars)} · pensja ~${o.wage} zł · premia ${o.signingBonus} zł</span>
            <span><strong>Szansa na grę ≈ ${chance}%</strong> — ${o.message}</span>
          </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>Oferty z II i III ligi</h2>
        <p class="muted">${p.name} · OVR ${p.overall} · ${p.age} lat. Wybierz klub na start kariery.</p>
        <div class="choices">${cards}</div>
      </section>`,
      'Start',
    )
  }

  private bindStartOffers(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => acceptStartingOffer(this.state, btn.dataset.offer!))
      })
    })
  }

  private hubHtml(): string {
    const p = this.state.player!
    const s = this.state.season!
    const club = getClub(s.clubId)
    const league = getLeague(s.leagueId)
    const mods = this.state.clubStrengthMods ?? {}
    const chance = Math.round(
      matchAppearanceChance(p, s.matchMood, s.clubId, mods, s.rival, s.rivalPressure ?? 0) * 100,
    )
    const clubPower = getEffectiveStrength(s.clubId, mods)
    const midOffers = hasMidSeasonOffers(this.state)
    const next = nextPlayerFixture(s)
    const cupCountry = getClub(s.clubId).country
    const cupPending = s.pendingCup
    const nextLine = cupPending
      ? `<p class="meta"><strong>${cupCompetitionName(cupCountry)}</strong>: ${cupStageLabel(cupPending.stage, cupCountry)} vs <strong>${getClub(cupPending.opponentId).name}</strong></p>
         <p class="meta">Forma meczowa: <strong>${Math.round(s.matchMood)}</strong></p>`
      : next
        ? `<p class="meta">Następny mecz: <strong>${getClub(next.homeId).name}</strong> vs <strong>${getClub(next.awayId).name}</strong></p>
         <p class="meta">Forma meczowa: <strong>${Math.round(s.matchMood)}</strong> · kolejka ~${Math.min(s.fixtureIndex + 1, s.fixtures.length)}/${s.fixtures.length}</p>
         <p class="muted">Sezon: ${s.liveStats.appearances} meczy · ${s.liveStats.goals} G · ${s.liveStats.assists} A${
           s.cupAlive
             ? ` · ${cupCompetitionName(cupCountry)}: ${s.cupFurthest === 'out' ? 'w grze' : cupStageLabel(s.cupFurthest, cupCountry)}`
             : s.cupFurthest !== 'out'
               ? ` · ${cupStageLabel(s.cupFurthest, cupCountry)}`
               : ''
         }</p>`
        : `<p class="muted">Terminarz ligowy domknięty${
            s.cupAlive ? ` — jeszcze ${cupCompetitionName(cupCountry)}` : ''
          }.</p>`
    const log = this.state.log
      .slice(0, 4)
      .map((l) => `<li>${l}</li>`)
      .join('')
    const injuryLine = p.injury
      ? `<p class="muted down">Kontuzja: ${p.injury.label}${p.injury.seasonEnding ? '' : ` · jeszcze ${p.injury.matchesLeft} mecz.`}</p>`
      : ''
    const loanLine = p.loan
      ? `<p class="muted">Wypożyczenie z ${getClub(p.loan.parentClubId).name}</p>`
      : ''
    const contractLine = `<p class="meta">Kontrakt: ${p.contract.yearsLeft} lat · pensja ~${p.contract.wage} zł</p>`
    const rivalLine = `<p class="meta">Rywal: <strong>${s.rival.name}</strong> · OVR ${s.rival.overall} · forma ${s.rival.form}<br/>${describeRival(p, s.rival)}</p>${
      s.rivalLastComment ? `<p class="rival-quote">${s.rivalLastComment}</p>` : ''
    }`

    const standings = sortedStandings(s)
    const place = playerTablePosition(s)
    const myRow = standings.find((r) => r.clubId === s.clubId)
    const tableSlice = standings.slice(0, 5)
    if (place > 5 && myRow) {
      tableSlice.push(myRow)
    }
    const tableHtml = `
      <div>
        <h3 style="margin-bottom:6px">${league.name}</h3>
        <p class="meta">Twoje miejsce: <strong>${place}.</strong> · ${myRow?.points ?? 0} pkt · bilans ${myRow?.goalsFor ?? 0}:${myRow?.goalsAgainst ?? 0}</p>
        <table class="mini-table">
          <thead><tr><th>#</th><th>Klub</th><th>Pkt</th></tr></thead>
          <tbody>
            ${tableSlice
              .map((row) => {
                const pos = standings.findIndex((r) => r.clubId === row.clubId) + 1
                const you = row.clubId === s.clubId
                return `<tr class="${you ? 'you' : ''}"><td>${pos}</td><td>${getClub(row.clubId).short}${you ? ' (Ty)' : ''}</td><td>${row.points}</td></tr>`
              })
              .join('')}
          </tbody>
        </table>
      </div>`

    const ladder = cupLadderSteps(s)
    const cupHtml = `
      <div>
        <h3 style="margin-bottom:6px">${cupCompetitionName(cupCountry)}</h3>
        <p class="meta">${
          s.cupFurthest === 'winner'
            ? 'Zdobywca pucharu!'
            : s.pendingCup
              ? `Następny: ${cupStageLabel(s.pendingCup.stage, cupCountry)} vs ${getClub(s.pendingCup.opponentId).name}`
              : s.cupAlive
                ? 'W grze'
                : s.cupPlayedLive
                  ? cupStageLabel(s.cupFurthest === 'out' ? 'out' : s.cupFurthest, cupCountry)
                  : 'Jeszcze przed startem'
        }</p>
        <div class="cup-ladder" aria-label="Drabinka pucharu">
          ${ladder
            .map(
              (step, i) =>
                `${i ? '<span class="cup-arrow">→</span>' : ''}<span class="cup-step ${step.state}">${step.label}</span>`,
            )
            .join('')}
        </div>
      </div>`

    return this.shell(
      `
      <section class="panel player-card">
        <div class="player-head">
          <div>
            <h2>${p.name}</h2>
            <p class="muted">${p.position} · ${footLabel(p.preferredFoot)} · ${p.age} lat · ${club.name}</p>
          </div>
          <div class="money">${p.money} zł</div>
        </div>
        <p class="meta">${league.name} · ${formatStars(club.stars)} (${starsLabel(club.stars)}) · sezon ${s.year} · siła ${clubPower} · gra ≈ ${chance}%</p>
        ${contractLine}
        ${rivalLine}
        ${loanLine}
        ${injuryLine}
        <div class="stat-grid">
          <div title="Klasa zawodnika (1–99). Rośnie głównie po sezonie z minutami."><span>OVR</span><strong>${p.overall}</strong></div>
          <div title="Samopoczucie w klubie. Wpływa na % gry i decyzje. Niskie = trudniej o skład."><span>Morale</span><strong>${p.morale}</strong></div>
          <div title="Rozpoznawalność / status. Odblokowuje oferty i wydarzenia. Rośnie z golami i sukcesami."><span>Rep.</span><strong>${p.reputation}</strong></div>
          <div title="Kondycja fizyczna. Część OVR; spada przy ciężkich treningach i urazach."><span>Kondycja</span><strong>${p.attrs.stamina}</strong></div>
          <div title="Szybkość. Ważna dla napastników i skrzydeł; buduje OVR."><span>Tempo</span><strong>${p.attrs.pace}</strong></div>
          <div title="Skuteczność strzału. Kluczowa dla NP; wpływa na OVR i gole."><span>Strzał</span><strong>${p.attrs.shooting}</strong></div>
          <div title="Jakość podań. Kluczowa dla pomocników; asysty i OVR."><span>Podanie</span><strong>${p.attrs.passing}</strong></div>
          <div title="Gra w obronie. Kluczowa dla OB/ŚO; OVR i zatrzymywanie akcji."><span>Obrona</span><strong>${p.attrs.defending}</strong></div>
        </div>
        <details class="stats-help">
          <summary>Co oznaczają statystyki?</summary>
          <ul class="muted">
            <li><strong>OVR</strong> — ogólna klasa. Na koniec sezonu rośnie/spada (młody z minutami: szybki tor 45→60).</li>
            <li><strong>Morale</strong> — nastrój. Wysokie = łatwiej o grę; niskie po kłótniach / ławce.</li>
            <li><strong>Rep.</strong> — reputacja. Pomaga w ofertach i mediach.</li>
            <li><strong>Tempo / Strzał / Podanie / Obrona / Kondycja</strong> — atrybuty budujące OVR wg pozycji.</li>
            <li><strong>Forma meczowa</strong> — krótki humor pod mecz; dobra forma wyraźnie podnosi szansę gry.</li>
            <li><strong>Rywal</strong> — konkurent o „11”; komentuje Twoje mecze i walkę o skład.</li>
            <li><strong>Gra ≈ %</strong> — szansa wystawienia w następnym meczu (forma + rywal + OVR).</li>
          </ul>
        </details>
      </section>

      <section class="panel">
        <h3>Sezon ${s.year}</h3>
        ${nextLine}
        <div class="hub-split">${tableHtml}${cupHtml}</div>
        <p class="muted" style="margin-top:12px">Liga + puchar. Oferty zależą od formy i miejsca w tabeli. W połowie — zima.</p>
        <div class="actions">
          ${
            s.preseasonDone
              ? ''
              : `<button class="btn ghost" id="btn-pre">Wiadomość (decyzja)</button>`
          }
          ${
            midOffers
              ? `<button class="btn ghost" id="btn-mid-tr">Wczesne okno transferowe</button>`
              : ''
          }
          <button class="btn primary" id="btn-season">${
            cupPending
              ? `Puchar: ${cupStageLabel(cupPending.stage, cupCountry)}`
              : next
                ? 'Następny mecz'
                : s.cupAlive
                  ? 'Mecz pucharowy'
                  : 'Zakończ sezon'
          }</button>
        </div>
      </section>

      <section class="panel">
        <h3>Dziennik</h3>
        <ul class="log">${log || '<li class="muted">Brak wpisów</li>'}</ul>
        <div class="actions"><button class="btn ghost danger" id="btn-reset">Nowa gra</button></div>
      </section>
    `,
      club.short,
    )
  }

  private bindHub(): void {
    this.root.querySelector('#btn-pre')?.addEventListener('click', () => {
      this.go(() => openPreseasonDecision(this.state))
    })
    this.root.querySelector('#btn-mid-tr')?.addEventListener('click', () => {
      this.go(() => openMidSeasonTransfers(this.state))
    })
    this.root.querySelector('#btn-season')?.addEventListener('click', () => {
      this.go(() => playCareerMatchday(this.state))
    })
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      if (!confirm('Na pewno zacząć od nowa?')) return
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'home'
      this.render()
    })
  }

  private decisionHtml(): string {
    const d = this.state.pendingDecision!
    const initial = (d.speaker || '?').trim().charAt(0).toUpperCase()
    const bubbles = (d.messages?.length ? d.messages : [d.description])
      .map((m) => `<div class="chat-bubble">${m}</div>`)
      .join('')
    const choices = d.choices
      .map(
        (c) =>
          `<button class="chat-reply" data-choice="${c.id}"><span class="chat-reply-text">${c.label}</span><span class="chat-reply-hint">${c.hint}</span></button>`,
      )
      .join('')
    return this.shell(
      `
      <section class="chat-panel">
        <div class="chat-header">
          <div class="chat-avatar">${initial}</div>
          <div>
            <strong>${d.speaker}</strong>
            <p class="muted">${d.speakerRole} · ${d.title}</p>
          </div>
        </div>
        <div class="chat-thread">${bubbles}</div>
        <p class="chat-prompt muted">Twoja odpowiedź:</p>
        <div class="chat-replies">${choices}</div>
      </section>`,
      'Czat',
    )
  }

  private bindDecision(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => applyPreseasonDecision(this.state, btn.dataset.choice!))
      })
    })
  }

  private keyMatchHtml(): string {
    const goalMoment = this.state.season?.pendingGoalMoment
    const k = this.state.pendingKeyMatch!
    const home = getClub(k.homeId)
    const away = getClub(k.awayId)
    if (goalMoment) {
      const action = goalMoment.action ?? 'shoot'
      return this.shell(
        `
        <section class="panel">
          <p class="eyebrow">${goalMoment.label}</p>
          <h2>${home.name} vs ${away.name}</h2>
          <p>${goalMoment.description}</p>
          <p class="muted">${actionLabel(action)} — przeciągnij i puść.</p>
          <div class="ball-wrap"><canvas id="moment-canvas"></canvas></div>
        </section>`,
        'Okazja',
      )
    }
    if (!this.selectedAction) {
      return this.shell(
        `
        <section class="panel">
          <p class="eyebrow">${k.label}</p>
          <h2>${home.name} vs ${away.name}</h2>
          <p>${k.description}</p>
          <p class="muted">Przeciwnik: ${getClub(k.opponentId).name} (siła ${getEffectiveStrength(k.opponentId, this.state.clubStrengthMods ?? {})}). Im silniejszy — tym trudniejsza akcja.</p>
          <p class="muted">Wybierz kluczową akcję sezonu:</p>
          <div class="actions">
            <button class="btn primary" id="btn-shoot">Strzał na bramkę</button>
            <button class="btn ghost" id="btn-pass">Podanie do kolegi</button>
          </div>
        </section>`,
        'Kluczowy mecz',
      )
    }
    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">${k.label}</p>
        <h2>${actionLabel(this.selectedAction)}</h2>
        <div class="ball-wrap"><canvas id="moment-canvas"></canvas></div>
      </section>`,
      'Akcja',
    )
  }

  private bindKeyMatch(): void {
    const goalMoment = this.state.season?.pendingGoalMoment
    if (!goalMoment && !this.selectedAction) {
      this.root.querySelector('#btn-shoot')?.addEventListener('click', () => {
        this.selectedAction = 'shoot'
        this.render()
      })
      this.root.querySelector('#btn-pass')?.addEventListener('click', () => {
        this.selectedAction = 'pass'
        this.render()
      })
      return
    }
    const action = goalMoment?.action ?? this.selectedAction
    if (!action) return
    const canvas = this.root.querySelector('#moment-canvas') as HTMLCanvasElement
    if (!canvas) return
    const opp = getClub(this.state.pendingKeyMatch!.opponentId)
    const difficulty = Math.min(1, Math.max(0, (opp.strength - 38) / 42))
    this.cleanupMoment = mountMatchMoment(
      canvas,
      action,
      (score) => {
        this.selectedAction = null
        this.go(() => resolveKeyMatch(this.state, { action, score }))
      },
      { difficulty },
    )
  }

  private matchResultHtml(): string {
    const m = this.state.season!.lastMatch!
    const home = getClub(m.homeId)
    const away = getClub(m.awayId)
    const moodDelta = Math.round(m.moodAfter - m.moodBefore)
    const moodArrow =
      moodDelta > 0 ? `↑ +${moodDelta}` : moodDelta < 0 ? `↓ ${moodDelta}` : '→ 0'
    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">Wynik meczu</p>
        <h2>${home.name} ${m.homeGoals}:${m.awayGoals} ${away.name}</h2>
        <table class="summary-table">
          <tbody>
            <tr><td>Występ</td><td><strong>${m.played ? 'Tak' : 'Nie'}</strong></td></tr>
            <tr><td>Gole / asysty</td><td><strong>${m.playerGoals}</strong> G · <strong>${m.playerAssists}</strong> A</td></tr>
            <tr><td>Ocena</td><td><strong>${m.rating != null ? m.rating.toFixed(1) : '—'}</strong></td></tr>
            <tr><td>Forma meczowa</td><td><strong>${Math.round(m.moodAfter)}</strong> (${moodArrow})</td></tr>
          </tbody>
        </table>
        <p class="muted">${m.narrative}</p>
        <div class="actions">
          <button class="btn primary" id="btn-match-next">Dalej</button>
        </div>
      </section>`,
      'Mecz',
    )
  }

  private bindMatchResult(): void {
    this.root.querySelector('#btn-match-next')?.addEventListener('click', () => {
      this.go(() => dismissMatchResult(this.state))
    })
  }

  private seasonReportHtml(): string {
    const r = this.state.seasonReport!
    const club = getClub(r.clubId)
    const league = getLeague(r.leagueId)
    const table = sortedStandings({ standings: r.standings })
      .map((row, i) => {
        const c = getClub(row.clubId)
        const mine = row.clubId === r.clubId ? ' mine' : ''
        return `<tr class="${mine}"><td>${i + 1}</td><td>${c.short}</td><td>${row.played}</td><td>${row.points}</td></tr>`
      })
      .join('')
    const scorers = r.scorers
      .map(
        (s, i) =>
          `<tr class="${s.isPlayer ? 'mine' : ''}"><td>${i + 1}</td><td>${s.name}</td><td>${getClub(s.clubId).short}</td><td>${s.goals}</td></tr>`,
      )
      .join('')

    const ovrArrow =
      r.overallDelta > 0 ? '↑' : r.overallDelta < 0 ? '↓' : '→'
    const ovrClass =
      r.overallDelta > 0 ? 'up' : r.overallDelta < 0 ? 'down' : 'flat'
    const ovrChange =
      r.overallDelta > 0
        ? `+${r.overallDelta}`
        : r.overallDelta < 0
          ? `${r.overallDelta}`
          : '0'

    const fate = r.promotion
      ? 'Awans klubu (zostajesz w tym samym klubie)'
      : r.relegation
        ? 'Spadek klubu (zostajesz w tym samym klubie)'
        : r.title
          ? 'Mistrzostwo Polski'
          : 'Bez zmiany ligi'

    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">${league.name} · ${r.year}</p>
        <h2>Podsumowanie sezonu</h2>
        <p class="muted">${club.name} · ${formatStars(club.stars)} · ${r.place}. miejsce · ${r.points} pkt</p>

        <table class="summary-table">
          <tbody>
            <tr>
              <td>Overall</td>
              <td class="${ovrClass}"><span class="arrow">${ovrArrow}</span> <strong>${ovrChange}</strong> <span class="muted">(${r.overallBefore} → ${r.overallAfter})</span></td>
            </tr>
            <tr>
              <td>Forma sezonu</td>
              <td class="${r.formLabel === 'fatalna' || r.formLabel === 'słaba' ? 'down' : r.formLabel === 'świetna' || r.formLabel === 'dobra' ? 'up' : ''}"><strong>${r.formLabel}</strong> <span class="muted">(względem oczekiwań + los)</span></td>
            </tr>
            <tr>
              <td>Występy</td>
              <td><strong>${r.appearances}</strong> / ${r.possibleAppearances} <span class="muted">ligi + puchar</span></td>
            </tr>
            <tr>
              <td>Gole / asysty</td>
              <td><strong>${r.goals}</strong> G · <strong>${r.assists}</strong> A</td>
            </tr>
            <tr>
              <td>Śr. ocena</td>
              <td><strong>${r.avgRating ? r.avgRating.toFixed(1) : '—'}</strong></td>
            </tr>
            <tr>
              <td>Puchar Polski</td>
              <td><strong>${r.cupLabel}</strong></td>
            </tr>
            <tr>
              <td>Król strzelców</td>
              <td>${r.playerScorerRank ? `<strong>#${r.playerScorerRank}</strong>` : '<span class="muted">poza podium listy</span>'}</td>
            </tr>
            <tr>
              <td>Los klubu</td>
              <td><strong>${fate}</strong></td>
            </tr>
            <tr>
              <td>Kontuzje</td>
              <td class="${r.matchesMissedInjury > 0 ? 'down' : ''}">${
                r.injuryNote
                  ? `<strong>${r.injuryNote}</strong><br/><span class="muted">Opuszczone mecze: ${r.matchesMissedInjury}</span>`
                  : '<span class="muted">Brak poważniejszych urazów</span>'
              }</td>
            </tr>
            <tr>
              <td>Kontrakt</td>
              <td class="${r.contractRenewed ? 'up' : 'down'}"><strong>${
                r.contractRenewed
                  ? r.proposedContractYears
                    ? `Nowy kontrakt ${r.proposedContractYears} lat`
                    : 'Kontrakt trwa'
                  : 'Bez przedłużenia'
              }</strong><br/><span class="muted">${r.contractNote}</span></td>
            </tr>
            <tr>
              <td>Rywal</td>
              <td>${r.rivalNote ? `<strong>${r.rivalNote}</strong>` : '<span class="muted">—</span>'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h3>Król strzelców — ${league.name}</h3>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Zawodnik</th><th>Klub</th><th>G</th></tr></thead>
            <tbody>${scorers}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Tabela — ${club.name}</h3>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Klub</th><th>M</th><th>Pkt</th></tr></thead>
            <tbody>${table}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Co dalej?</h3>
        ${
          (() => {
            const onLoan = Boolean(this.state.player?.loan?.returnAfterSeason)
            const parentName = onLoan
              ? getClub(this.state.player!.loan!.parentClubId).name
              : club.name
            if (onLoan) {
              return `<p class="muted">Wypożyczenie się kończy — wracasz do <strong>${parentName}</strong> (albo szukasz transferu).</p>
        <div class="actions">
          <button class="btn primary" id="btn-stay">Wróć do ${parentName}</button>
          <button class="btn ghost" id="btn-leave">Szukaj transferu</button>
        </div>`
            }
            if (r.contractRenewed) {
              return `<p class="muted">„Zostań” = ten sam klub${r.promotion ? ' (awansuje z Tobą)' : r.relegation ? ' (spada z Tobą)' : ''}.</p>
        <div class="actions">
          <button class="btn primary" id="btn-stay">Zostań w ${club.name}</button>
          <button class="btn ghost" id="btn-leave">Szukaj transferu</button>
        </div>`
            }
            return `<p class="muted">Klub nie przedłuża kontraktu — musisz wybrać ofertę (przy słabej formie często słabsze kluby).</p>
        <div class="actions">
          <button class="btn primary" id="btn-leave">Zobacz oferty</button>
        </div>`
          })()
        }
      </section>
    `,
      'Sezon',
    )
  }

  private bindSeasonReport(): void {
    this.root.querySelector('#btn-stay')?.addEventListener('click', () => {
      this.go(() => stayAtClub(this.state))
    })
    this.root.querySelector('#btn-leave')?.addEventListener('click', () => {
      this.go(() => openTransferChoice(this.state))
    })
  }

  private transferChoiceHtml(): string {
    const offers = this.state.transferOffers
    const winter =
      this.state.season?.phase === 'winterDone' || this.state.season?.winterBreakTaken
    const midSeason = Boolean(this.state.season && !this.state.seasonReport)
    const forced = this.state.seasonReport && !this.state.seasonReport.contractRenewed
    const cards = offers
      .map((o) => {
        const c = getClub(o.clubId)
        const l = getLeague(o.leagueId)
        const play = o.playChance != null ? ` · gra ≈ ${o.playChance}%` : ''
        const kind =
          o.kind === 'loan'
            ? `<span class="badge">Wypożyczenie${o.buyOption ? ' + wykup' : ''}</span> `
            : o.buyOption
              ? '<span class="badge loan-buy">Opcja wykupu</span> '
              : o.contractYears
                ? `<span class="muted">${o.contractYears} lat · </span>`
                : ''
        return `
          <button class="choice" data-offer="${o.clubId}">
            <strong>${kind}${c.name}</strong>
            <span>${l.name} · ${formatStars(c.stars)} (${starsLabel(c.stars)}) · pensja ~${o.wage} zł · premia ${o.signingBonus} zł${play}${
              o.buyOption && o.buyOptionFee ? ` · wykup ~${o.buyOptionFee} zł` : ''
            }</span>
            <span>${o.message}</span>
          </button>`
      })
      .join('')
    return this.shell(
      `
      <section class="panel">
        <h2>${winter ? 'Okienko zimowe' : midSeason ? 'Okno transferowe' : 'Oferty transferowe'}</h2>
        <p class="muted">${
          winter
            ? 'Po 1. połowie: transfer, wypożyczenie albo wróć i dokończ sezon.'
            : midSeason
              ? 'Wczesne okno — wyższe ligi przy wysokim OVR.'
              : forced
                ? 'Kontrakt nieprzedłużony — wybierz klub lub wypożyczenie.'
                : 'Wybierz klub albo wróć i zostań.'
        }</p>
        <div class="choices">${cards}</div>
        ${
          forced && !winter
            ? ''
            : midSeason || winter
              ? `<div class="actions"><button class="btn ghost" id="btn-skip-mid">${winter ? 'Wróć do przerwy zimowej' : 'Zostaję w klubie'}</button></div>`
              : `<div class="actions"><button class="btn ghost" id="btn-back-stay">Zostań jednak</button></div>`
        }
      </section>`,
      'Transfer',
    )
  }

  private bindTransferChoice(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.go(() => acceptOffer(this.state, btn.dataset.offer!))
      })
    })
    this.root.querySelector('#btn-back-stay')?.addEventListener('click', () => {
      this.go(() => stayAtClub(this.state))
    })
    this.root.querySelector('#btn-skip-mid')?.addEventListener('click', () => {
      this.go(() => declineMidSeasonTransfers(this.state))
    })
  }

  private winterBreakHtml(): string {
    const w = this.state.winterSnapshot!
    const p = this.state.player!
    const club = getClub(w.clubId)
    const league = getLeague(w.leagueId)
    const playPct = estimatePlayChance(
      p,
      w.clubId,
      this.state.clubStrengthMods ?? {},
      this.state.season,
    )
    return this.shell(
      `
      <section class="panel">
        <p class="eyebrow">${league.name} · ${w.year}</p>
        <h2>Przerwa zimowa</h2>
        <p class="muted">${club.name} · ${w.place}. miejsce · ${w.points} pkt po 1. połowie</p>
        <table class="summary-table">
          <tbody>
            <tr><td>Występy</td><td><strong>${w.appearances}</strong></td></tr>
            <tr><td>Gole / asysty</td><td><strong>${w.goals}</strong> G · <strong>${w.assists}</strong> A</td></tr>
            <tr><td>Śr. ocena</td><td><strong>${w.avgRating ? Number(w.avgRating).toFixed(1) : '—'}</strong></td></tr>
            <tr><td>Szansa gry</td><td><strong>≈ ${playPct}%</strong></td></tr>
            <tr><td>Rywal</td><td>${w.rivalNote}</td></tr>
          </tbody>
        </table>
        <p class="muted">${w.narrative}</p>
        <div class="actions">
          <button class="btn primary" id="btn-winter-continue">Zostaję — dalej sezon</button>
          ${
            w && !this.state.season?.winterDecisionDone
              ? `<button class="btn ghost" id="btn-winter-decision">Rozmowa w klubie</button>`
              : ''
          }
          <button class="btn ghost" id="btn-winter-offers">Oferty zimowe</button>
          <button class="btn ghost" id="btn-winter-loan">Szukaj wypożyczenia</button>
        </div>
      </section>`,
      'Zima',
    )
  }

  private bindWinterBreak(): void {
    this.root.querySelector('#btn-winter-continue')?.addEventListener('click', () => {
      this.go(() => continueAfterWinter(this.state))
    })
    this.root.querySelector('#btn-winter-decision')?.addEventListener('click', () => {
      this.go(() => openWinterDecision(this.state))
    })
    this.root.querySelector('#btn-winter-offers')?.addEventListener('click', () => {
      this.go(() => openWinterTransfers(this.state))
    })
    this.root.querySelector('#btn-winter-loan')?.addEventListener('click', () => {
      this.go(() => openWinterLoans(this.state))
    })
  }

  private careerEndHtml(): string {
    const s = this.state.careerSummary!
    return this.shell(
      `
      <section class="panel hero-panel">
        <p class="eyebrow">Koniec kariery</p>
        <h1>${s.name}</h1>
        <p class="lead">${s.narrative}</p>
        <table class="summary-table">
          <tbody>
            <tr><td>Sezony</td><td><strong>${s.seasonsPlayed}</strong></td></tr>
            <tr><td>Szczyt OVR</td><td><strong>${s.peakOverall}</strong></td></tr>
            <tr><td>Kluby</td><td><strong>${s.clubsCount}</strong></td></tr>
            <tr><td>Tytuły</td><td><strong>${s.titles}</strong></td></tr>
            <tr><td>Wiek / OVR końcowy</td><td><strong>${s.finalAge}</strong> / <strong>${s.finalOverall}</strong></td></tr>
          </tbody>
        </table>
        <div class="actions">
          <button class="btn primary" id="btn-new-career">Nowa kariera</button>
        </div>
      </section>`,
      'Emerytura',
    )
  }

  private bindCareerEnd(): void {
    this.root.querySelector('#btn-new-career')?.addEventListener('click', () => {
      clearSave()
      this.state = createEmptyState()
      this.state.screen = 'create'
      this.render()
    })
  }
}
