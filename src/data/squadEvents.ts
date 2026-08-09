import type { CareerEvent } from './events'

/** Rozmowy w szatni w trakcie sezonu */
export const SQUAD_EVENTS: CareerEvent[] = [
  {
    id: 'squad_dinner',
    title: 'Kolacja szatni',
    speaker: 'Kapitan',
    speakerRole: 'Szatnia',
    messages: [
      'Chłopaki idą na kolację po treningu.',
      'Dołączasz, czy regenerujesz sam?',
    ],
    weight: 3,
    choices: [
      {
        id: 'go',
        label: 'Idę z ekipą',
        hint: '+chemia, +morale, −pieniądze',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'money', delta: -450 },
          { key: 'rivalPressure', delta: -1 },
        ],
      },
      {
        id: 'pay',
        label: 'Funduję stolik',
        hint: '++chemia, −−pieniądze',
        effects: [
          { key: 'morale', delta: 4 },
          { key: 'reputation', delta: 1 },
          { key: 'money', delta: -1200 },
          { key: 'rivalPressure', delta: -1 },
        ],
      },
      {
        id: 'skip',
        label: 'Odpuszczam',
        hint: '+kondycja, −chemia',
        effects: [
          { key: 'stamina', delta: 1 },
          { key: 'morale', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'squad_rival_clash',
    title: 'Starcie z rywalem',
    speaker: 'Trener',
    speakerRole: 'Sztab',
    messages: [
      'Ty i konkurent o skład znów się czepiacie na treningu.',
      'Rozładowujesz to rozmową, czy pokazujesz to na boisku?',
    ],
    weight: 3,
    choices: [
      {
        id: 'talk',
        label: 'Rozmawiamy jak faceci',
        hint: '−presja rywala, +chemia',
        effects: [
          { key: 'rivalPressure', delta: -2 },
          { key: 'morale', delta: 2 },
        ],
      },
      {
        id: 'compete',
        label: 'Wygrywam pojedynek na treningu',
        hint: '+tempo, +presja',
        effects: [
          { key: 'pace', delta: 1 },
          { key: 'rivalPressure', delta: 1 },
          { key: 'reputation', delta: 1 },
        ],
      },
      {
        id: 'coach',
        label: 'Proszę trenera o jasne role',
        hint: '+morale, −presja',
        effects: [
          { key: 'morale', delta: 2 },
          { key: 'rivalPressure', delta: -1 },
        ],
      },
    ],
  },
  {
    id: 'squad_young',
    title: 'Młody prosi o radę',
    speaker: 'Akademik',
    speakerRole: 'Szatnia',
    messages: [
      'Chłopak z rezerw pyta, jak trzymasz formę.',
      'Poświęcasz mu czas?',
    ],
    weight: 2,
    choices: [
      {
        id: 'mentor',
        label: 'Biorę go pod skrzydło',
        hint: '+reputacja, +chemia, −kondycja',
        effects: [
          { key: 'reputation', delta: 2 },
          { key: 'morale', delta: 2 },
          { key: 'stamina', delta: -1 },
        ],
      },
      {
        id: 'short',
        label: 'Krótka rada na korytarzu',
        hint: '+morale',
        effects: [{ key: 'morale', delta: 1 }],
      },
      {
        id: 'busy',
        label: 'Nie mam czasu',
        hint: '−chemia',
        effects: [{ key: 'morale', delta: -1 }],
      },
    ],
  },
  {
    id: 'squad_tactics_row',
    title: 'Kłótnia o ustawienie',
    speaker: 'Pomocnik',
    speakerRole: 'Szatnia',
    messages: [
      'W szatni gotuje się o taktyce na weekend.',
      'Stajesz po stronie trenera, kapitanów, czy milczysz?',
    ],
    weight: 2,
    choices: [
      {
        id: 'coach_side',
        label: 'Bronię sztabu',
        hint: '+reputacja u trenera, −chemia',
        effects: [
          { key: 'reputation', delta: 1 },
          { key: 'morale', delta: -1 },
        ],
      },
      {
        id: 'players',
        label: 'Słucham szatni',
        hint: '+chemia, −reputacja lekko',
        effects: [
          { key: 'morale', delta: 3 },
          { key: 'reputation', delta: -1 },
          { key: 'rivalPressure', delta: -1 },
        ],
      },
      {
        id: 'quiet',
        label: 'Trzymam się z dala',
        hint: 'bez zmian',
        effects: [],
      },
    ],
  },
]
