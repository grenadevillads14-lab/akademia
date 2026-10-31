// ACT 3: The student who disagrees (c. 357–348 BC)
// Sources: Aristotle as "the reader" and "the mind of the school": Vita Marciana (late, tradition). Plato on Aristotle
// needing a bridle and Xenocrates a spur: Diogenes Laertius 4.6. The colt that kicks its mother: Diogenes Laertius 5.2.
// Aristotle teaching rhetoric against Isocrates: Cicero, De oratore 3.141; Quintilian 3.1.14. The Third Man: Plato,
// Parmenides 132a–b; Aristotle, Metaphysics A.9 990b17. Speusippus' numbers instead of Forms: Aristotle, Metaphysics Z.2 1028b21.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== years ===
# shot: wide
# cmd: season summer
# cmd: time 10
Years pass at the Academy, the way water passes in Cimon's channels: always moving, always the same. Eudoxus has gone home to Cnidus. New students arrive every spring, younger every year.
And Aristotle is no longer the boy with too many scrolls. He teaches rhetoric in the afternoons, mocking Isocrates' school across the city. He reads more than anyone has ever read. People have started to listen to him, and Plato has noticed.
# cmd: quest start act3 reader
-> END

=== aristotle_reader ===
# shot: aristotle
aristotle: Do you know what Plato calls me? "The reader." He says it as if it were a vice. He also says Xenocrates needs a spur and I need a bridle. # anim: gesture
aristotle: Look at this. {player_name()}, you have known me longer than anyone here. Read it and tell me I am wrong.
# shot: player
Notes in a small, fast hand: "If the Form of Man is itself a man, then a further Form is needed for Man and the men together; and so to infinity. The Forms are separate, so they cannot be the being of things. To call them patterns is to speak in empty words and poetic metaphors."
# shot: aristotle
aristotle: Speusippus has asked to argue it out in the circle tonight, before the whole school. Plato will listen and say nothing, which is worse than anything he could say.
* [I'll defend the Forms.]
    aristotle: Good. Somebody should do it properly. I will be your opponent, then. Do not go easy on me.
    # cmd: flag act3_side plato
* [I'll press your objection against Speusippus.]
    aristotle: You will say it better than I would: they are tired of hearing it from me.
    # cmd: flag act3_side aristotle
- # cmd: quest step act3 debate
-> END

=== debate_intro ===
# cmd: time 19.5
# shot: wide
Lamps in the circle. The whole school is on the benches. Plato sits a little apart, his hands folded on his staff, saying nothing.
{ flag("act3_side") == "plato":
    # cmd: puzzle debate forms_defend
- else:
    # cmd: puzzle debate third_man
}
-> END

=== debate_retry ===
# shot: aristotle
aristotle: The circle is still arguing about it. Go on, finish what you started.
{ flag("act3_side") == "plato":
    # cmd: puzzle debate forms_defend
- else:
    # cmd: puzzle debate third_man
}
-> END

=== debate_done ===
# shot: plato
plato: Parmenides made that objection to me, in a manner of speaking, years ago. I wrote it down myself. Did you think I had not noticed it? # anim: gesture
plato: An objection is not a refutation. It is a direction to look in. Keep looking, all of you.
aristotle: We will. Though perhaps not in the same direction.
# cmd: xp logos 20
# cmd: quest step act3 catalogue
-> END

=== catalogue ===
# shot: aristotle
aristotle: Forms in heaven. I would rather start on earth. Look: nobody has ever written down what the animals actually do. How they breed, what they eat, which have blood and which do not. # anim: gesture
aristotle: Go down to the Cephissus and the grove with me, with your eyes open. Find me at least six living things and tell me what you see. Not what the poets say. What you see.
# cmd: codex aristotle_biology
# cmd: quest step act3 catalogue_go
-> END

=== catalogue_done ===
# shot: aristotle
aristotle: Six, and more to come. Do you see? Each thing has its own nature, its own way of being what it is. The form of the heron is in the heron, not in some heaven of herons. # anim: gesture
aristotle: Plato would say I am looking at shadows. I say the shadows have a great deal to teach.
# cmd: idea form_in_matter
# cmd: quest step act3 rift
-> END

=== rift ===
# cmd: time 18
# shot: speusippus
speusippus: You've been filling his head with frogs and eels, Stagirite. This is a school of philosophy, not a fish market. # anim: gesture
aristotle: Philosophy begins in wonder. Your uncle said it. Is a heron less wonderful than a number? # anim: gesture
speusippus: My uncle built this school. You treat it like an inn where you stop to eat before moving on.
# shot: plato
plato: Enough. Aristotle kicks at me, the way colts kick their mothers once they have been weaned. That is what colts do. # anim: gesture
plato: And you, {player_name()}: you have walked with both of them. Whose school is this?
* [Plato's, and Speusippus will keep it as it is.]
    speusippus: Thank you. Loyalty is not a small thing.
    # cmd: rep speusippus 3
    # cmd: rep aristotle -1
    # cmd: flag act3_choice speusippus
* [It belongs to whoever asks the best questions. Today that is Aristotle.]
    aristotle: I'll remember that. # anim: gesture
    # cmd: rep aristotle 3
    # cmd: rep speusippus -2
    # cmd: flag act3_choice aristotle
* [It needs both of them: the numbers and the herons.]
    plato: Spoken like a student of the Timaeus. Everything held together by proportion.
    # cmd: rep plato 2
    # cmd: rep aristotle 1
    # cmd: rep speusippus 1
    # cmd: flag act3_choice both
- plato: Go. All of you. Some day you will see that I was the bridge you crossed by.
# cmd: quest complete act3
# cmd: flag chapter act4
# cmd: toast Act 3 complete.
-> END
