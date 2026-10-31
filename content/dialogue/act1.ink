// ACT 1: The outsider (367 BC, spring and early summer)
// Plato sails for Syracuse; Eudoxus keeps the school. Four trials, then a first lesson.
// Sources: docs/RESEARCH.md §1 (Plato's second Sicilian voyage, 367/6), §4 (Eudoxus at the Academy;
// his view that pleasure is the good, Aristotle, Nicomachean Ethics X.2 1172b9–25), §6 (Meno 82b–85b),
// §8 (the moriai), §9 (Cimon's water, Plutarch, Cimon 13.8). Lines paraphrase; no long quotations.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== plato_farewell ===
# shot: plato
plato: You came on a strange day. Tomorrow I sail for Syracuse. Dion writes that the young Dionysius wants to learn; perhaps a king can be made into a philosopher. # anim: gesture
* [Is that wise?]
    plato: Probably not. But if I refused, I would seem to myself a man of words only, who never laid a hand to any deed.
    # cmd: idea philosopher_kings
    # cmd: xp logos 10
* [Who will teach while you are gone?]
    plato: Eudoxus keeps the school. He knows more about the heavens than I do, and he will tell you so.
* [Take me with you.]
    plato: To a tyrant's court? No. Stay here. Learn to ask good questions; that is harder than sailing. # anim: gesture
    # cmd: rep plato 1
- plato: Eudoxus will tell you what the school expects of a newcomer. Do not let him charm you into thinking pleasure is everything.
eudoxus: I heard that. # anim: gesture
plato: You were meant to.
# shot: wide
The sun drops behind the planes. In the morning, Plato is gone, with a few slaves and a box of books, down the road to Piraeus and the sea.
# cmd: flag plato_departed
# cmd: time 7.5 next
# cmd: codex sicily
# cmd: quest step act1 eudoxus
-> END

=== eudoxus_trials ===
# shot: eudoxus
eudoxus: So. Plato's newest. While he teaches tyrants, I teach you. First you show me you are worth teaching. # anim: gesture
eudoxus: Four things. Solve a problem in the dust for me. Find the sacred olives of this grove, at least four of them, and learn what they are. Help Speusippus with his water: he has been swearing at the channels all week.
eudoxus: And go to the palaestra. The gymnasiarch thinks we are all talk. Show him a philosopher can run, and argue, both.
* [Why the olives?]
    eudoxus: Because a man who walks past the oldest trees in Attica without seeing them will walk past a proof the same way.
* [What problem in the dust?]
    eudoxus: Come back and I will draw it. It is an old one of Plato's. A boy solved it once without being taught. Supposedly.
* [I am ready.]
    eudoxus: Everyone is ready. Then they meet the problem.
- # cmd: quest step act1 trials
# cmd: quest start trial_meno solve
# cmd: quest start trial_moriai find
# cmd: quest start trial_water fix
# cmd: quest start trial_palaestra debate
# cmd: codex eudoxus
-> END

=== eudoxus_meno ===
# shot: eudoxus
{flag("meno_tried"): eudoxus: Back to the square? Good. The dust is patient. | eudoxus: Here. A square, two feet on each side. Four square feet. # anim: drawDirt}
# cmd: flag meno_tried
# cmd: puzzle meno
-> END

=== meno_done ===
# shot: eudoxus
eudoxus: The diagonal. Of course. And now tell me how long it is. # anim: gesture
* [Somewhat less than three feet.]
    eudoxus: Somewhat! There is no number of feet, nor any fraction of feet, that measures it. Theodorus of Cyrene showed the same for the sides of squares of three feet, of five, and on up to seventeen.
* [I cannot say.]
    eudoxus: Neither can anyone, in whole numbers or fractions. That is the point.
- eudoxus: Plato says the boy did not learn this; he remembered it. The soul knew it before birth. I say: the boy had a good teacher, who drew the right lines.
eudoxus: Either way, you see it now. And something you cannot measure with a number, you can still compare. That is what I work on. Ratios of magnitudes. Some day I will show you.
# cmd: quest complete trial_meno
# cmd: idea ratio
-> END

=== moriai_done ===
# shot: player
Four of Athena's olives, each with its boundary stone and its stories. You begin to see the grove as Eudoxus does: not as trees, but as a record older than anyone in it.
# cmd: quest complete trial_moriai
# cmd: xp mousike 20
-> END

=== speusippus_water ===
# shot: speusippus
{flag("ww_tried"): speusippus: Still flooded. Still dying. Try again. | speusippus: You. Eudoxus sent you? Good. Look at this. }
{not flag("ww_tried"): speusippus: Cimon brought the water in when my grandfather was young: he turned a dry patch into this grove with channels and plane trees. A hundred years of mud since. # anim: gesture}
{not flag("ww_tried"): speusippus: The reading spot under the western planes is a swamp, and the eastern walk is dying of thirst. My uncle comes back to this, if he comes back at all.}
# cmd: flag ww_tried
# cmd: codex cimon
# cmd: puzzle waterworks
-> END

=== water_done ===
# shot: speusippus
speusippus: Listen. That is the right sound: water going where it should. # anim: gesture
speusippus: My uncle would have asked what water is, and whether the idea of a channel is more real than this one. I just wanted the planes to live.
* [Both questions matter.]
    speusippus: Spoken like his student. Well. You may be one of us yet.
    # cmd: rep speusippus 1
* [The planes come first.]
    speusippus: Ha. Don't say that in the circle.
    # cmd: rep speusippus 2
- # cmd: quest complete trial_water
-> END

=== gymnasiarch_talk ===
# shot: gymnasiarch
{flag("debate.courage") == "lost": gymnasiarch: Back for another round of words, then? | gymnasiarch: Another one of Plato's. Pale, thin, full of questions. What do you want in my palaestra? # anim: gesture}
gymnasiarch: The young men here need courage, not definitions.
* [What is courage, then?]
    gymnasiarch: Ha! I see. A question. Very well, ask your questions, philosopher. # anim: gesture
    # cmd: puzzle debate courage
* [I came to train.]
    gymnasiarch: Then train. But you'll still have to answer for your Plato some time.
    # cmd: puzzle debate courage
* [Later.]
    gymnasiarch: The sand will still be here.
- -> END

=== debate_done ===
# shot: gymnasiarch
{flag("debate.courage") == "won": gymnasiarch: Hm. You've tied me in knots, and I am not sure I deserved it. If courage needs knowing what to fear, then maybe my boys need your teachers too. # anim: gesture}
{flag("debate.courage") == "lost": gymnasiarch: You see? Words go in circles. Feet go forward. # anim: gesture}
gymnasiarch: Now. Your legs. Run the xystos, the covered track, to the far end and back. No one gets out of that.
# cmd: quest step trial_palaestra run
-> END

=== xystos_end ===
# shot: player
The far end of the covered track. Your breath is loud under the roof; the planes outside shake in the wind. Behind you, the gymnasiarch is watching.
# cmd: quest step trial_palaestra back
-> END

=== palaestra_done ===
# shot: gymnasiarch
gymnasiarch: Not fast. Not slow. You'll do. Oil, sand, strigil: the boys will show you. And come back tomorrow. # anim: gesture
# cmd: xp gymnastike 30
# cmd: quest complete trial_palaestra
-> END

=== trials_done ===
# shot: player
A boy from the school runs up, out of breath. Eudoxus has heard you finished everything he asked. He is about to lecture in the circle, and he wants you there.
# cmd: quest step act1 first_lesson
-> END

=== first_lesson ===
# shot: eudoxus
eudoxus: Sit. Today, the good. Plato will say it is the Form above all Forms. I say something simpler. # anim: gesture
eudoxus: Look at everything that lives: the fish, the ox, the child. All of them go after pleasure. All of them flee pain. What everything seeks must be the good.
xenocrates: Every animal? Then the good is what a pig wants?
eudoxus: The good is what all things want, Xenocrates. Even pigs. Especially pigs.
# shot: wide
Laughter. Eudoxus turns to you.
eudoxus: You. Is pleasure the good?
* [Yes: everything chooses it.]
    eudoxus: Good: a student who agrees with me. That will not last.
    # cmd: idea pleasure_good
    # cmd: rep eudoxus 1
* [No: some pleasures are shameful.]
    eudoxus: Then those are bad pleasures, not bad because they are pleasures. A fair objection, though.
    # cmd: idea pleasure_good
    # cmd: xp logos 15
* [Pleasure added to wisdom is better than either alone; so pleasure is not the good itself.]
    eudoxus: That is Plato's argument, from the Philebus he is still writing! Somebody has been listening at the doors.
    # cmd: idea pleasure_good
    # cmd: xp logos 25
    # cmd: rep plato 1
- aristotle: People believe him, you know. Not because of the argument. Not because of the argument. Because he is the most temperate man in Athens. When a man like that praises pleasure, you think he must be right.
eudoxus: I heard that too.
# shot: wide
The lesson runs until the shadows of the planes reach the benches. When it ends, nobody tells you to leave. You have a place in the circle now.
# cmd: quest complete act1
# cmd: codex eudoxus_pleasure
# cmd: flag chapter act2
# cmd: toast Act 1 complete. The outsider is an outsider no longer.
-> END

=== aristotle_act1 ===
# shot: aristotle
aristotle: He's gone, then. The great man sails to make a tyrant wise, and leaves us with an astronomer. # anim: gesture
* [Eudoxus seems brilliant.]
    aristotle: He is. He can predict where Mars will be next year with nothing but spheres turning inside spheres. I want to learn everything he knows, and then find where he is wrong.
    # cmd: rep aristotle 1
* [You sound disappointed.]
    aristotle: I came to hear Plato. I will wait. I am good at waiting, and at reading in the meantime.
- aristotle: Speusippus says Plato's books are kept in the house by the garden. I intend to read every one before he is back.
# cmd: flag ari_act1_talk
-> END
