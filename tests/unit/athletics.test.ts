import { describe, expect, it } from 'vitest';
import { courseLength, pointAt, rivalProgress, standings, startRace, stepRace, type RaceDef } from '../../src/athletics/race';
import { IMPLEMENTS, meter, simulateThrow } from '../../src/athletics/throwing';
import { COUNTER_FOR, startBout, stepBout, visibleAttack, type Opponent, type WrestleState } from '../../src/athletics/wrestling';

const stadion: RaceDef = {
  id: 'test',
  course: [[0, 0], [0, 100], [0, 180]],
  radius: 4,
  countdown: 3,
  rivals: [
    { id: 'a', time: 25, pace: 1 },
    { id: 'b', time: 40, pace: 1 },
  ],
};

describe('races', () => {
  it('measures and samples the course', () => {
    expect(courseLength(stadion.course)).toBeCloseTo(180);
    const p = pointAt(stadion.course, 140);
    expect(p.z).toBeCloseTo(140);
    expect(p.heading).toBeCloseTo(0);
  });

  it('counts down, then ticks off checkpoints in order and places the runner among the rivals', () => {
    let st = startRace(stadion);
    let r = stepRace(stadion, st, 2.9, [0, 0], 0);
    expect(r.state.phase).toBe('countdown');
    r = stepRace(stadion, r.state, 0.2, [0, 0], 0);
    expect(r.events).toContain('go');
    expect(r.events).toContain('checkpoint'); // standing on the start line
    st = r.state;
    // Skipping a checkpoint does not count.
    st = stepRace(stadion, st, 10, [0, 180], 6).state;
    expect(st.next).toBe(1);
    st = stepRace(stadion, st, 10, [0, 100], 6).state;
    st = stepRace(stadion, st, 10, [1, 179], 6).state;
    expect(st.phase).toBe('finished');
    expect(st.place).toBe(2); // 30.1 s: behind a (25 s), ahead of b (40 s)
    expect(standings(stadion, st).map((x) => x.id)).toEqual(['a', 'player', 'b']);
  });

  it('puts the torch out if you sprint too long, but jogging keeps it alight', () => {
    const torch: RaceDef = { ...stadion, torch: true, countdown: 0 };
    let st = stepRace(torch, startRace(torch), 0.01, [50, 50], 0).state;
    for (let i = 0; i < 600; i++) st = stepRace(torch, st, 0.1, [50, 50], 3.8, 0.3).state;
    expect(st.phase).toBe('running');
    let out = st;
    for (let i = 0; i < 200 && out.phase === 'running'; i++) out = stepRace(torch, out, 0.1, [50, 50], 6.4, 0.5).state;
    expect(out.phase).toBe('failed');
    expect(out.reason).toBe('torch_out');
  });

  it('moves rivals along their pacing curve and stops a rival whose torch went out', () => {
    expect(rivalProgress({ id: 'x', time: 20, pace: 1 }, 10)).toBeCloseTo(0.5);
    expect(rivalProgress({ id: 'x', time: 20, pace: 0.8 }, 10)).toBeGreaterThan(0.5);
    expect(rivalProgress({ id: 'x', time: 20, pace: 1, outAt: 5 }, 15)).toBeCloseTo(0.25);
  });
});

describe('throwing', () => {
  it('meter is a triangle wave', () => {
    expect(meter(0, 2)).toBe(0);
    expect(meter(0.5, 2)).toBeCloseTo(0.5);
    expect(meter(1, 2)).toBeCloseTo(1);
    expect(meter(1.5, 2)).toBeCloseTo(0.5);
  });

  it('a perfect discus throw lands near the ancient record and the best angle beats extremes', () => {
    const best = simulateThrow('discus', { aim: 0, angle: IMPLEMENTS.discus.bestAngle, power: 1, timing: 0 });
    expect(best.foul).toBe(false);
    expect(best.distance).toBeGreaterThan(24);
    expect(best.distance).toBeLessThan(36);
    const low = simulateThrow('discus', { aim: 0, angle: 15, power: 1, timing: 0 });
    const high = simulateThrow('discus', { aim: 0, angle: 65, power: 1, timing: 0 });
    expect(best.distance).toBeGreaterThan(low.distance);
    expect(best.distance).toBeGreaterThan(high.distance);
  });

  it('wind from behind carries the javelin further; aiming outside the sector is a foul', () => {
    const calm = simulateThrow('javelin', { aim: 0, angle: 36, power: 1, timing: 0 });
    const tail = simulateThrow('javelin', { aim: 0, angle: 36, power: 1, timing: 0 }, [0, 6]);
    expect(tail.distance).toBeGreaterThan(calm.distance);
    expect(simulateThrow('javelin', { aim: 0.6, angle: 36, power: 1, timing: 0 }).foul).toBe(true);
    expect(simulateThrow('javelin', { aim: 0, angle: 36, power: 1, timing: 0.8 }).distance).toBeLessThan(calm.distance);
  });
});

describe('wrestling', () => {
  const opp: Opponent = { id: 'kallias', window: 0.8, pause: [0.6, 1.2], opening: 0.7, feint: 0 };

  const untilTelegraph = (s: WrestleState) => {
    for (let i = 0; i < 400 && s.phase !== 'telegraph'; i++) s = stepBout(opp, s, 0.05);
    return s;
  };

  it('a right counter opens him up, and a throw in the opening is a fall; three falls win', () => {
    let s = startBout(7);
    for (let fall = 0; fall < 3; fall++) {
      s = untilTelegraph(s);
      const seen = visibleAttack(s, opp)!;
      s = stepBout(opp, s, 0.05, COUNTER_FOR[seen]);
      expect(s.phase).toBe('opening');
      // The first opening only unbalances a fresh opponent; a second counter and throw put him down.
      s = stepBout(opp, s, 0.05, 'throw');
      if (s.phase !== 'fall' && s.phase !== 'won') {
        s = untilTelegraph(s);
        s = stepBout(opp, s, 0.05, COUNTER_FOR[visibleAttack(s, opp)!]);
        s = stepBout(opp, s, 0.05, 'throw');
      }
      expect(s.oppFalls).toBe(fall + 1);
    }
    expect(s.phase).toBe('won');
  });

  it('answering late or wrong costs your balance and then a fall', () => {
    let s = startBout(3);
    s = untilTelegraph(s);
    const wrong = (['sprawl', 'break', 'step'] as const).find((c) => c !== COUNTER_FOR[s.attack!])!;
    s = stepBout(opp, s, 0.05, wrong);
    expect(s.playerBalance).toBeCloseTo(0.6);
    const waitOut = () => {
      s = untilTelegraph(s);
      for (let i = 0; i < 40 && s.phase === 'telegraph'; i++) s = stepBout(opp, s, 0.05);
    };
    waitOut();
    expect(s.playerBalance).toBeCloseTo(0.1);
    waitOut();
    expect(s.playerFalls).toBe(1);
    expect(s.playerBalance).toBe(1);
  });

  it('a feint shows a false attack first, then the real one', () => {
    const tricky: Opponent = { ...opp, feint: 1 };
    let s = startBout(11);
    for (let i = 0; i < 400 && s.phase !== 'telegraph'; i++) s = stepBout(tricky, s, 0.05);
    expect(visibleAttack(s, tricky)).not.toBe(s.attack);
    s = stepBout(tricky, s, tricky.window * 0.6);
    expect(visibleAttack(s, tricky)).toBe(s.attack);
  });
});
