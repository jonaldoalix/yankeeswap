// index.js

const express = require('express');
const path = require('path');
const app = express();
const port = 1224;

// Serve static files from the 'public' directory
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  },
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

/*
Ok perfect! Let's modify the game and the rules, shall we? Here's the new game flow:

1. In real life, the offspring of the group will make ornaments with a hidden number on them and then in ascending order will sign up on the site.  I'd like the number in the sequence, the name, and the gift they contributed to the swap documented when they signed up.
2. First round of play: in ascending order by sequence number, players in real life will grab a wrapped present of choice.  While this is happening, I want to be able to associate the present that the player selected with the player.  In this round, players will not be able to unwrap their presents and since I am playing the game as well, I do not want to know what's in the presents either.  To facilitate this, I want to be able to associate the selection using the name of the player who contributed the present to begin with.
3. In the next round, players in ascending sequence order will unwrap the present (and I will use the site to reveal them on screen) and then be faced with a choice: keep it or swap it with any other player that has a present already.  Unlike the conventional way of playing, player 1 will not be able to go again in the end.  I want to be able to re-associate the gift with another player if the player chooses to swap.
4. In the intermission between rounds, in ascending sequence order, players will grab a "perk" card (in real life) which can be any number of things -- like for example: swap presents with another player at any time, undo the last swap, etc.  These perk cards are not going to be documented in the server or site but I want to be able to re-associate the gifts with other players as needed and now, also swap sequence numbers between players as well as that may also be a perk that is selected and eventually used.  Players can keep their perk cards and use them at any point in the rest of the game (in any future round) or immediately use them.
5. In this next round, 10 questions stored on the server will be asked 1 by 1 at my command and based on their answers, players in real life will group themselves by their answer choice.  Within those groups, players will be able to swap presents by sequence order ascending and again, I'd like to be able to document changes to gift associations and/or sequence numbers (if perk cards are used).  Once the 10 questions have been asked and answered, we can move on to the next round.
6.  Here, the round is simple.  In ascending order, players can declare if they want to keep their present or participate in the next round.  If they choose to keep it, unless a perk card is used, their present will remain theirs until the next round is over.  If they choose to participate in the next round, it is as follows.
7.  Musical chairs: Players will play musical chairs and the order in which they are eliminated should be documentable.  Once only one player is standing, in the order in which players were eliminated, players can swap presents with other participating players.  The winner of this round can choose to not swap their present at all.
8. Randomizer round: All players are now back in play.  In real life, players in their sequential ascending order will draw a card that has instructions and they must follow them.  This may result in more need to re-associate presents and sequence numbers.  The need to be able to document that continues.
9. Lastly, once everyone has drawn and executed a card in the randomizer round, all players will participate in a rock paper scissors tournament where the sole winner of the tourney will be given two questions to act on: swap or keep their present and swap or keep another player's gift.  Upon action on both questions, the game moves on to the final quick round.
10. Voluntary swap and pictures:  Players can swap their presents at will if they choose and then pictures with their elections are taken and the final results are put up on the screen.

Given the new structure and rules of the game, can you amend the code to facilitate these needs as well as mine as the host?
*/