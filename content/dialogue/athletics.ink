// ATHLETICS (M6): the gymnasiarch's games and the torch race at the altar of Prometheus.
// Sources: docs/RESEARCH.md §5 (gymnasium life, the dromos, the palaestra), Pausanias 1.30.2 (the torch race
// from the altar of Prometheus to the city), the triagmos (three falls) in upright wrestling.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== gymnasiarch_games ===
# shot: gymnasiarch
{flag("won_stadion") && flag("won_discus") && flag("beat_damon"): gymnasiarch: Well, philosopher. Half my boys are afraid of you now. What will it be? | gymnasiarch: Back for more sand? Choose. # anim: gesture}
* [The stadion: one length of the dromos.]
    gymnasiarch: Oil up and line up at the start. Thrasyllos is fast; the Theban paces himself. Go on my word.
    # cmd: athletics race stadion
* [The diaulos: down and back.]
    gymnasiarch: Round the turning post at the far end, and don't cut it. Save your wind for the second length.
    # cmd: athletics race diaulos
* [The discus.]
    gymnasiarch: Three throws from the balbis. Bronze is heavy: let it swing, don't push it.
    # cmd: athletics throw discus
* [The javelin.]
    gymnasiarch: Wind the thong round two fingers. It spins the shaft and it flies true. Three throws.
    # cmd: athletics throw javelin
* [Wrestle Thrasyllos.]
    gymnasiarch: Upright wrestling. Three falls wins. Watch his shoulders: they tell you what his legs will do.
    # cmd: athletics wrestle thrasyllos
* {flag("beat_thrasyllos")} [Wrestle Damon of Thebes.]
    gymnasiarch: The Theban. He feints. Don't believe the first thing his body tells you.
    # cmd: athletics wrestle damon
* [Not now.]
    gymnasiarch: The sand will keep.
- -> END

=== torch_altar ===
# shot: player
The altar of Prometheus, who stole fire for mortals. Every year the runners light their torches here and race to the city. The rule is simple: if your torch goes out, you have lost, however fast you are.
{flag("won_torch"): You have won here before. The soot of last year's torches still blackens the step.}
* [Light a torch and run to the Dipylon.]
    Run hard and the wind tears the flame away. Run too gently and the others are gone. Somewhere between lies the race.
    # cmd: athletics race torch
* [Not now.]
- -> END
