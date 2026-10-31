// PROLOGUE: The road to the Academy (367 BC, spring, late afternoon)
// Sources: docs/RESEARCH.md §1–3, §7. Lines paraphrase; no long quotations.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== arrival ===
# cmd: quest start prologue meet
# shot: wide
The Dipylon, the double gate of Athens. Carts, mules and travellers squeeze through its twin passages; beyond, the road to the Academy runs between the graves.
-> END

=== meet_aristotle ===
# shot: aristotle
aristotle: You are looking for the Academy too. I can tell: everyone else here is looking for a buyer.
* [Introduce yourself]
    player: I am {player_name()}, from {home_city() == "athens": Athens itself|{home_city() == "thebes": Thebes|{home_city() == "syracuse": Syracuse|Miletus}}}. I have come to study with Plato.
    aristotle: Then we arrive on the same day. Aristotle, son of Nicomachus, of Stagira. My father was physician to the king of Macedon. # anim: gesture
    # cmd: rep aristotle 1
* [Ask about his scrolls]
    player: You travel with more books than clothes.
    aristotle: Clothes wear out. These do not, if you keep them dry. Aristotle, of Stagira. # anim: gesture
    # cmd: rep aristotle 2
    # cmd: flag aristotle_books
* [Say nothing and wait]
    aristotle: Silent? Good. The Academy will have enough talkers. I am Aristotle, from Stagira.
- aristotle: Seventeen years old and sent to Athens to become wise. Shall we walk? It is six stadia, they say, and the road is worth reading.
# cmd: flag met_aristotle
# cmd: quest step prologue walk_road
# cmd: codex aristotle
-> END

=== stele_casualty ===
# shot: player
A tall marble slab, crowded with names. Above each column, the name of one of the ten tribes. These are the city's dead from a single year of war, buried together at public cost.
{flag("met_aristotle"): aristotle: The state buries its own here, by tribe. Every year, a speech. Pericles gave the most famous one: that the city itself was the monument, and the whole earth its tomb for famous men. }
# cmd: codex demosion_sema
# cmd: xp mousike 5
-> END

=== stele_dexileos ===
# shot: player
A horseman rides down a fallen enemy, his cloak flying. The inscription is short: Dexileos, son of Lysanias, of Thorikos. Born in the archonship of Teisandros, died at Corinth. He was twenty.
{flag("met_aristotle"): aristotle: His family put up the stone, though the state already listed him among the dead. They wanted him remembered as he was, not as a name in a column. }
# cmd: codex dexileos
# cmd: xp mousike 5
-> END

=== road_talk ===
# shot: aristotle
aristotle: They say Plato leaves for Syracuse again soon. Dionysius the younger wants a philosopher at his court, and Dion, his uncle, wants it to be Plato.
* [Then who will teach us?]
    aristotle: The older students, I suppose. Speusippus, his nephew. And Eudoxus of Cnidus, who measures the heavens. I would walk a long way to hear him.
* [A philosopher advising a tyrant?]
    aristotle: Plato wrote that cities will not be well governed until kings become philosophers, or philosophers kings. Perhaps he wants to test it. # cmd: idea philosopher_kings
    # cmd: xp logos 5
- aristotle: I have heard Eudoxus walks here every morning, all the way from the Piraeus. That is how badly he wanted to learn.
# cmd: flag road_talk
-> END

=== altar_eros ===
# shot: wide
Before the gate of the Academy stands an altar to Eros. The inscription names Charmus, the first Athenian to dedicate one.
aristotle: Love at the door of philosophy. Plato would say that is no accident.
* [Why Love?]
    aristotle: In his Symposium, love is a ladder: from one beautiful body, to all beautiful bodies, to beautiful souls, to beauty itself. The climb ends in wisdom.
    # cmd: idea ladder_of_love
    # cmd: xp logos 5
* [Ask about the torch race]
    aristotle: At the festival the runners light their torches at the altar of Prometheus inside, then race to the city. If your flame goes out, you lose, however fast you ran.
    # cmd: codex torch_race
- # cmd: quest step prologue enter_grove
-> END

=== rumour ===
# shot: wide
A student on the path laughs as you pass.
student: New ones! Did you check the gate? They say it reads: let no one ignorant of geometry enter.
aristotle: Nothing is written on the gate.
student: Exactly. That is how they test you. # anim: gesture
# cmd: codex geometry_rumour
-> END

=== moria ===
# shot: player
An ancient olive, its trunk split and twisted into several stems. A boundary stone stands beside it. This is one of the moriai, the sacred olives of Athena; the law protects them, and to uproot one is a grave crime.
{flag("met_aristotle"): aristotle: They say this grove descends from the very olive Athena gave the city. I would rather know why the leaves are silver underneath. }
# cmd: collect moriai moria-1
# cmd: codex moriai
-> END

=== speusippus_welcome ===
# shot: speusippus
speusippus: Two more. Names? Cities? Can either of you read? Count? Good. You will need both.
speusippus: I am Speusippus. My uncle teaches in his garden, past the planes. He will want to see you before he sails.
* [We will go at once.]
    # cmd: rep speusippus 1
* [What will he ask us?]
    speusippus: Questions. He only ever asks questions. Then he asks why your answer was an answer.
    # cmd: xp logos 5
- # cmd: quest step prologue find_plato
-> END

=== plato_circle ===
# shot: plato
In the shade of a great plane tree, men sit on a ring of stone benches. An older man with broad shoulders draws in the dust with a stick.
plato: ...so we call many things beautiful: a face, a law, a proof. Are they beautiful by many different beauties, or by one?
xenocrates: By one, I think.
plato: Then that one is what we are looking for. Not the face. Not the law. # anim: gesture
plato: Ah. New faces. Come into the circle. Tell me: what brought you here?
* [I want to understand how things work.]
    plato: Then you will love Eudoxus, and his spheres. But ask also why things are, not only how.
    # cmd: xp mathesis 15
* [I want to live well.]
    plato: The oldest question. We will spend years on it, and you will thank me.
    # cmd: xp logos 15
* [I want to remember what matters.]
    plato: Memory and the Muses. We keep a shrine for them here; you will find it among the cypresses.
    # cmd: xp mousike 15
* [I want to be strong in body and mind.]
    plato: The gymnasium is fifty paces away for good reason. A mind does not do well in a neglected body.
    # cmd: xp gymnastike 15
- plato: Philosophy begins in wonder. Keep yours. And you, from Stagira, with the scrolls: we shall see.
aristotle: We shall. # anim: gesture
# cmd: idea wonder
# cmd: rep plato 1
# cmd: quest complete prologue
# cmd: flag chapter act1
# cmd: quest start act1 farewell
-> END

=== diogenes_road ===
# shot: diogenes
A ragged man with a staff walks the road at full daylight, holding up a lit lamp.
diogenes: Don't mind me. I am looking for a human being.
* [I am one.]
    diogenes: Are you? You are going to the Academy. They will teach you that you are a shadow of one. # anim: gesture
* [Why the lamp?]
    diogenes: Because it is easier to find a lamp in Athens than an honest man. # anim: gesture
- # cmd: codex diogenes
# cmd: flag met_diogenes
-> END
