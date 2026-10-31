// ACT 2: The life of the school (autumn 367 – 365 BC)
// Sources: docs/RESEARCH.md. Eudoxus' spheres: Aristotle, Metaphysics Λ.8; Simplicius on De Caelo. Theaetetus and the
// solids: Plato, Theaetetus 142a–b; scholium to Euclid XIII. Timaeus 53c–56c (elements). Promethia: Pausanias 1.30.2.
// Plato's return from Syracuse: Seventh Letter 329b–330b. Delian problem: Plutarch, De genio Socratis 579b–d.
// Diogenes and the plucked chicken, and "tablehood": Diogenes Laertius 6.40, 6.53. Axiothea: Diogenes Laertius
// 3.46, 4.2 (after Dicaearchus). Divided Line: Republic VI 509d–511e. The Cave: Republic VII 514a–518b.
EXTERNAL has_idea(id)
EXTERNAL flag(id)
EXTERNAL rep(who)
EXTERNAL level(d)
EXTERNAL items(id)
EXTERNAL quest_state(id)
EXTERNAL quest_step(id)
EXTERNAL player_name()
EXTERNAL home_city()

=== autumn ===
# shot: wide
# cmd: season autumn
Summer burns out. The planes drop their leaves into Cimon's channels, and the school settles into its own rhythm: lectures at dawn, the palaestra at noon, arguments until the lamps run dry.
aristotle: Eudoxus is going up Colonus tonight with his rings. He says the sky is clearest after the first rain. He asked for "the one who doubled the square". That means you.
# cmd: time 20.5
# cmd: quest start act2 stars
-> END

=== eudoxus_stars ===
# shot: eudoxus
eudoxus: There. Low in the east, the bright one that doesn't twinkle: Zeus's star. Every year it does something shameful for a god. # anim: gesture
eudoxus: It walks east among the fixed stars, a little each night. Then it slows, stops, and walks backwards for four months. Then it stops again and goes on, as if nothing happened.
eudoxus: Plato asked us: by what uniform and ordered motions can we save the appearances? Everything in the heavens should turn in perfect circles. So: circles. Spheres inside spheres, each turning steadily. Help me set them.
# cmd: puzzle spheres
-> END

=== stars_done ===
# shot: eudoxus
eudoxus: Look at it. Nothing moves except steady circles, and still the star stops and turns back. The appearances are saved. # anim: gesture
* [Can you do the same for the red star, Ares?]
    eudoxus: Ah. You would ask that.
    eudoxus: With its true period the spheres never turn it back, unless I tilt them so far it would wander thirty degrees off the zodiac, which it never does. Somebody after me will have to fix Ares.
    # cmd: xp mathesis 15
* [Are the spheres real?]
    eudoxus: Real? They are a way of calculating. Whether there are crystal shells up there, ask Plato. Or your friend from Stagira, who will want to count them.
    # cmd: xp logos 10
- aristotle: Twenty-seven spheres for the whole sky, he says. I make it more. # anim: gesture
eudoxus: You make everything more, boy.
# cmd: time 9 next
# cmd: quest step act2 solids
-> END

=== xenocrates_solids ===
# shot: xenocrates
xenocrates: Sit. You have heard of Theaetetus? He was the best of us at geometry. Two years ago he came back from the fighting at Corinth with a wound and dysentery, and died. # anim: gesture
xenocrates: He proved there are exactly five solids whose faces are all the same regular figure. Plato wants every student to understand why, before he reads the Timaeus. I have the leather shapes. You have the hands.
# cmd: codex theaetetus
# cmd: puzzle solids
-> END

=== solids_done ===
# shot: xenocrates
xenocrates: Five, and no more: not because nobody has found a sixth, but because there cannot be one. That is what a proof is. # anim: gesture
xenocrates: Plato goes further. He says fire is made of the little pyramids, which is why it cuts and burns; earth of the cubes, which is why it stays put. Whether that is true...
* [It is beautiful.]
    xenocrates: That is not an argument. But I admit it is not nothing, either.
    # cmd: rep xenocrates 1
* [It sounds like a story.]
    xenocrates: He calls it "a likely story". He is more honest about it than his admirers.
    # cmd: xp logos 10
- # cmd: quest step act2 torch
# cmd: season winter
-> END

=== promethia ===
# shot: wide
# cmd: time 18.6
Dusk at the altar of Prometheus. The whole school is here, and half the potters' quarter. Runners crowd the step, unlit torches in their hands. A priest kindles the fire.
gymnasiarch: Remember the rule! It's not the fastest who wins. It's the fastest whose torch reaches the city still burning. Light your torches! # anim: gesture
# cmd: athletics race torch
-> END

=== torch_done ===
# shot: wide
{flag("won_torch"): The crowd at the Dipylon roars as you come through the gate, the flame still alive in your fist. The gymnasiarch is laughing. Somebody hangs a ribbon on you. | The race is over. In the gate the winner holds up his torch, its flame still alive, while the crowd roars.}
aristotle: You ran? I watched from the wall. Most of them killed their flame in the first two stadia. The road is downhill: it tempts you. # anim: gesture
# cmd: season spring
# cmd: time 10 next
# cmd: quest step act2 plato_returns
-> END

=== plato_back ===
# shot: plato
plato: You stayed. Good. A year away teaches you what you missed. # anim: gesture
* [How was Syracuse?]
    plato: Dionysius wanted to be called a philosopher, and he did not want to do the work. He exiled Dion within four months and kept me as a sort of honoured prisoner. I have come home to the one place where people want to learn.
    # cmd: codex sicily
* [Did the young king learn anything?]
    plato: He learned that he would rather be praised than taught. That is a lesson too, though not for him.
- plato: But tell me about yourselves. Eudoxus says you can turn the heavens with a handful of rings. Then let me give you something harder, a problem with a god in it.
plato: When the Delians were dying of plague, Apollo's oracle told them to double his altar. It was a cube. Their builders were at a loss and came to me.
# cmd: flag plato_returned
# cmd: puzzle delian
-> END

=== delian_done ===
# shot: plato
plato: I told the Delians the god did not care about an altar. He was shaming the Greeks for neglecting geometry, and telling them to study it and calm their souls. # anim: gesture
plato: Still. I scold Archytas and Eudoxus for solving it with instruments, and here I am handing you a carpenter's square. Geometry should turn the mind upward, to what has no body, not down to tools.
aristotle: And yet it works. # anim: gesture
plato: So does a mule.
# cmd: quest step act2 lesson
-> END

=== plato_lesson ===
# shot: plato
plato: Today, definitions. What is a human being? We divide: an animal; a land animal; one that walks on two feet; and without feathers. A featherless biped. # anim: drawDirt
# shot: diogenes
A shout from the planes. Diogenes strides into the circle, holding something pink and limp by its legs. He throws it at Plato's feet. It is a plucked chicken.
diogenes: Behold! Plato's human being! # anim: gesture
# shot: wide
Laughter all round the benches. Even Speusippus covers his mouth.
plato: ...with broad, flat nails. Write that down, Philip.
diogenes: And while I'm here: I see a table, Plato, and a cup. But I don't see tablehood or cuphood.
plato: Naturally. You have eyes to see a cup. You do not have the mind to see cuphood. # anim: gesture
diogenes: Then I'll keep my eyes. They've never needed a school. # anim: gesture
# cmd: codex diogenes
# cmd: flag chicken_seen
plato: Let me show you what the cuphood is for. A line.
# cmd: puzzle divided_line
-> END

=== line_done ===
# shot: plato
plato: Images; things; what we reason about with diagrams; what we understand by itself. Most people live their whole lives on the lowest segment, and call it the world. # anim: gesture
plato: Come back at sunset. I will tell you a story about that.
# cmd: quest step act2 cave
-> END

=== cave_story ===
# cmd: time 19
# shot: plato
plato: Imagine people living in a cave, deep underground. From childhood they have been chained by the legs and neck, so they can only look ahead, at the back wall. # anim: gesture
plato: Behind them burns a fire. Between the fire and the prisoners there is a low wall, and along it men carry objects: figures of people and animals in wood and stone. The prisoners see only their shadows.
plato: What would they take to be real?
* [The shadows.]
    plato: The shadows. Nothing else.
* [The echoes, too.]
    plato: Yes: when the carriers speak, the voices bounce from the wall, and they would think the shadows were talking. Good.
- plato: Now suppose one of them is freed...
# shot: wide
The sun goes down behind Plato's back. His voice runs on, low and even, and the warm stone of the bench is the last thing you feel.
# cmd: cave enter
-> END

=== cave_wake ===
# shot: aristotle
aristotle: You fell asleep in the middle of the best story he has ever told. I'll tell you the end. # anim: gesture
* [I know the end.]
    aristotle: Do you? Then tell me: does the freed man go back down?
    {flag("cave_returned"): player: He goes back. Even if they laugh at him. Even if they kill him. | player: He stays in the sun. Who would go back? }
    aristotle: Plato says he must go back. The philosopher has to return to the cave and govern, whether he wants to or not. {flag("cave_returned"): You agree with him, then. | You disagree with Plato. Good. So, sometimes, do I.}
* [Tell me.]
    aristotle: He climbs out. The light blinds him. First he can only look at shadows, then reflections, then things, then the stars, and at last the sun itself. And then, Plato says, he must go back down.
- aristotle: Shadows on a wall. And here we are in a grove, arguing about which shadows are real. # anim: gesture
# cmd: idea cave
# cmd: codex cave
# cmd: quest complete act2
# cmd: flag chapter act3
# cmd: toast Act 2 complete: years pass at the Academy.
-> END

=== axiothea_secret ===
# shot: axiothea
axiothea: You've noticed. Don't look at me like that. Yes: I am a woman. Axiothea, from Phlius. I came to Athens because I read Plato's Republic, and he says women can be guardians as well as men. # anim: gesture
axiothea: Lasthenia comes from Mantinea for the same reason. Plato doesn't mind. Some of the others would, so I dress as I do.
* [Your secret is safe.]
    axiothea: Thank you. Then help me with something.
    # cmd: rep axiothea 2
* [Why does it matter what you wear?]
    axiothea: It shouldn't. That's the whole argument of the fifth book.
    # cmd: rep axiothea 1
- axiothea: There's a fresh copy of the Republic in Plato's house, by the garden. The slaves won't give it to me, and I won't ask Speusippus. Would you bring it?
# cmd: codex axiothea
# cmd: quest start axiothea fetch
-> END

=== plato_house_scroll ===
# shot: player
Plato's house: a modest courtyard, a shrine, and shelves of scroll-boxes. A copyist looks up, shrugs, and hands you the ten rolls of the Republic, tied with a cord.
# cmd: item republic_scroll
# cmd: quest step axiothea return
-> END

=== axiothea_return ===
# shot: axiothea
axiothea: All ten! You are a better friend than you know. # anim: read
axiothea: Book five. Listen: "There is no pursuit of the city that belongs to a woman as a woman, or to a man as a man." He wrote that, and then he built a school where I have to hide.
* [The school is better than the city, at least.]
    axiothea: Yes. That is why I'm here.
* [Then the school should change.]
    axiothea: It will. Slowly. Like everything that has to be argued into being.
    # cmd: rep axiothea 1
- # cmd: item republic_scroll -1
# cmd: idea women_guardians
# cmd: quest complete axiothea
# cmd: xp logos 25
-> END

=== diogenes_act2 ===
# shot: diogenes
diogenes: The student of the great man! Tell me, did they teach you yet how to be happy? # anim: gesture
* [Not yet. They're working up to it.]
    diogenes: Twenty years of working up. I learnt it from a mouse: no bed, no fear of the dark, no longing for delicacies. Look how happy it is. # anim: gesture
* [What would you teach instead?]
    diogenes: To live according to nature, and to need nothing. Start with your sandals. # anim: gesture
    # cmd: xp logos 5
- diogenes: Go on, then. Back to your shadows.
# cmd: flag diogenes_act2
-> END

=== plato_delian_retry ===
# shot: plato
plato: The altar again? Good. The god is patient; the Delians less so.
# cmd: puzzle delian
-> END

=== line_retry ===
# shot: plato
plato: The line is still in the dust. Finish it.
# cmd: puzzle divided_line
-> END
