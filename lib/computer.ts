import { advancePlayer, FINISH, newRace, obstacles, runner, type Race } from './race';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const levels = { easy: { label: 'Fácil', speed: .55 }, medium: { label: 'Médio', speed: .78 }, hard: { label: 'Difícil', speed: 1 } };
export function computerRace(name: string, level: Difficulty, now: number): Race {
  const race = newRace(name.trim() || 'Você', now);
  race.players[1] = runner(`CPU · ${levels[level].label}`, now);
  race.phase = 'playing'; race.start = now + 3000;
  return race;
}
export function tickComputer(race: Race, level: Difficulty, now: number, input: { lane: number; jumpSeq: number }) {
  if (race.phase !== 'playing') return;
  const dt = Math.max(0, Math.min(.1, (now - Math.max(race.updated, race.start)) / 1000));
  const [human, cpu] = race.players, items = obstacles(race.seed);
  human.lane = input.lane;
  if (input.jumpSeq > human.jumpSeq) { if (human.jump === 0 && now >= race.start) human.jump = .82; human.jumpSeq = input.jumpSeq; }
  const danger = items.filter(o => o.d > cpu.distance && o.d < cpu.distance + 7);
  if (danger.some(o => o.lane === cpu.lane)) cpu.lane = [0, 1, 2].find(lane => !danger.some(o => o.lane === lane)) ?? cpu.lane;
  const times = [(FINISH - human.distance) / 17, (FINISH - cpu.distance) / (17 * levels[level].speed)];
  advancePlayer(human, dt, items); advancePlayer(cpu, dt * levels[level].speed, items);
  if (human.distance >= FINISH || cpu.distance >= FINISH) {
    race.phase = 'done'; race.winner = human.distance >= FINISH && cpu.distance >= FINISH ? (Math.abs(times[0]-times[1]) < .0001 ? -1 : times[0] < times[1] ? 0 : 1) : human.distance >= FINISH ? 0 : 1;
  }
  race.updated = now;
}
