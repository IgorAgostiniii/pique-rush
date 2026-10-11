import { advancePlayer, FINISH, newRace, obstacles, pickups, runner, type Race } from './race';

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
  const [human, cpu] = race.players, items = obstacles(race.seed,cpu.distance);
  human.lane = input.lane;
  if (input.jumpSeq > human.jumpSeq) { if (human.jump === 0 && now >= race.start) human.jump = .82; human.jumpSeq = input.jumpSeq; }
  const danger = items.filter(o => o.d > cpu.distance && o.d < cpu.distance + 7);
  if (danger.some(o => o.lane === cpu.lane)) cpu.lane = [0, 1, 2].find(lane => !danger.some(o => o.lane === lane)) ?? cpu.lane;
  if(!danger.length){const reward=pickups(race.seed,cpu.distance).find(item=>item.d>cpu.distance&&item.d<cpu.distance+12);if(reward&&!items.some(o=>o.lane===reward.lane&&o.d>cpu.distance&&o.d<reward.d+5))cpu.lane=reward.lane;}
  advancePlayer(human, dt, obstacles(race.seed,human.distance),race.seed); advancePlayer(cpu, dt * levels[level].speed, items,race.seed);
  if (human.hits > 0 || cpu.hits > 0) {race.phase='done';race.winner=human.hits>0?1:0;}
  race.updated = now;
}
