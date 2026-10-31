// ACT 4: The death of Plato (348/347 BC)
// Sources: Plato's death at 81, at a wedding feast according to Hermippus: Diogenes Laertius 3.2; buried in the Academy:
// Diogenes Laertius 3.41, Pausanias 1.30.3. Speusippus succeeds: Diogenes Laertius 4.1. Aristotle and Xenocrates leave for
// Hermias at Assos: Strabo 13.1.57; Diogenes Laertius 5.9. Aristotle's altar-elegy for Plato ("a man whom the base have
// no right even to praise"): fragment 673 Rose (late attribution, tradition). Lesbos: Theophrastus of Eresos; the lagoon
// of Pyrrha in Aristotle, History of Animals 5.15 547a, 8.20 603a.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== news ===
# shot: wide
# cmd: season spring
# cmd: time 8 next
The news comes at dawn. Plato is dead, in his eighty-first year. They say he died at a wedding feast; others say he died in his sleep, with a book under his pillow.
The school will bury him in the garden where he taught, by the house. Everyone is going.
# cmd: flag plato_dead
# cmd: quest start act4 funeral
-> END

=== funeral ===
# shot: wide
# cmd: time 17.5
The whole school stands around the new mound in the garden. Nobody speaks for a long time. The planes move in the wind, the way they always have.
speusippus: He came back from Sicily twice with nothing, and built this instead. Forty years of questions. He would want us to go on asking them. # anim: gesture
xenocrates: He said once that he thanked the gods he was born a man and not an animal, a Greek and not a barbarian, and in the time of Socrates. We should thank them that we were born in the time of Plato.
aristotle: There are men whom the base have no right even to praise. He showed, by his life and by his arguments, how a good man is also a happy one. # anim: gesture
* [Lay a wreath of olive on the mound.]
    You set the wreath of grey olive leaves on the stele. Athena's tree, from the grove where he walked.
    # cmd: rep plato 2
* [Stand in silence.]
    You say nothing. There is nothing to say that he did not say better.
- # cmd: codex plato_death
# cmd: quest step act4 succession
-> END

=== speusippus_succession ===
# shot: speusippus
speusippus: He left the school to me. His nephew. Some of them think that is the only reason. # anim: gesture
{flag("act3_choice") == "speusippus": speusippus: You stood by me when it was not easy. I won't forget it. Stay, and teach with me.}
{flag("act3_choice") == "aristotle": speusippus: I know where your heart is. Go and say goodbye to him; he is leaving today. But the door here stays open.}
{flag("act3_choice") == "both": speusippus: You wanted the numbers and the herons. I can only give you the numbers. Think about it.}
aristotle: (from the path) I'll be at the Dipylon at noon. Come and see me off, at least.
# cmd: quest step act4 farewell
-> END

=== farewell ===
# shot: aristotle
aristotle: Hermias of Atarneus has offered us a house at Assos, across the sea. Xenocrates is coming too. Athens is no place for a Macedonian now, with Philip taking cities in the north. # anim: gesture
aristotle: And this is no longer Plato's school. I will start my own one day. Come with me. There is a whole sea full of animals no one has ever described.
* [I'll come with you.]
    aristotle: Good! We'll go by Lesbos. Theophrastus says the lagoon at Pyrrha is full of creatures nobody has a name for. # anim: gesture
    # cmd: flag act4_path go
    # cmd: rep aristotle 3
    ** [Sail to Lesbos.]
        # cmd: lesbos enter
    ** [Skip ahead.]
        The years at Assos and Mytilene pass quickly: a marriage, a royal pupil in Macedon, and long notebooks of animals.
        # cmd: flag lesbos_done
* [I'm staying at the Academy.]
    aristotle: I thought you might. Somebody has to keep them honest. Write to me. # anim: gesture
    # cmd: flag act4_path stay
    # cmd: rep speusippus 2
    # cmd: flag lesbos_done
- -> END

=== after ===
# shot: wide
{flag("act4_path") == "go": Twelve years go by. Aristotle teaches the young Alexander at Mieza, writes, and watches. Then, in the spring of 335, a message: "Athens again. Come and help me build something." | Twelve years go by. Speusippus dies, and Xenocrates becomes head of the Academy, slow and grave and incorruptible. Then, in the spring of 335, news runs round the grove: Aristotle is back in Athens, and teaching at the Lyceum.}
# cmd: quest complete act4
# cmd: flag chapter act5
# cmd: toast Act 4 complete.
-> END
