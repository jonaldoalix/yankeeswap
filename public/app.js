// public/app.js

document.addEventListener('DOMContentLoaded', function () {
  const playersData = [];
  const questions = [
    "Has the elf on the shelf ever come to your house?",
    "Have you kissed someone under the mistletoe?",
    "Have you been caroling before?",
    "Have you ever wrote a letter to Santa?",
    "Have you gone to church or plan on it for Christmas or Christmas Eve?",
    "Do you know why Christmas is a holiday?",
    "Is there a tree up at your house?",
    "Do you like eggnog? ¿Coquito?",
    "Have you ever done a yankee swap before?",
    "Did you do secret santa this year?",
  ];
  let roundNumber = 0;
  let gameStarted = false;
  const signUpForm = document.getElementById('sign-up-form');
  const openModalBtn = document.getElementById('open-modal-btn');
  const modal = document.getElementById('modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const submitActionBtn = document.getElementById('submit-action-btn');
  const playerSelect = document.getElementById('playerSelect');
  const actionSelect = document.getElementById('action');
  const swapPlayerSelect = document.getElementById('swapPlayer');
  const reorderedPlayerSelect = document.getElementById('reorderedPlayer');
  const swapPlayerLabel = document.querySelector('label[for="swapPlayer"]');
  const reorderedPlayerLabel = document.querySelector('label[for="reorderedPlayer"]');
  const roundNumberDisplay = document.getElementById('round-number');
  const presentQuestionBtn = document.getElementById('next-question-btn');

  reorderedPlayerLabel.style.display = 'none';
  reorderedPlayerSelect.style.display = 'none';

  let timer;
  let timerMinutes = 3;
  let timerSeconds = 0;
  let timerRunning = false;
  let questionIndex = 0;

  const timerDisplay = document.getElementById('timer');
  const startTimerBtn = document.getElementById('start-timer-btn');
  const pauseTimerBtn = document.getElementById('pause-timer-btn');
  const resetTimerBtn = document.getElementById('reset-timer-btn');

  function startTimer() {
    timerRunning = true;
    timer = setInterval(updateTimer, 1000);
  }

  function pauseTimer() {
    timerRunning = false;
    clearInterval(timer);
  }

  function resetTimer() {
    timerRunning = false;
    clearInterval(timer);
    timerMinutes = 3;
    timerSeconds = 0;
    updateTimerDisplay();
  }

  function updateTimer() {
    if (timerMinutes === 0 && timerSeconds === 0) {
      pauseTimer();
      // Handle timer expiration, e.g., end the turn
    } else {
      if (timerSeconds === 0) {
        timerMinutes -= 1;
        timerSeconds = 59;
      } else {
        timerSeconds -= 1;
      }
      updateTimerDisplay();
    }
  }

  function updateTimerDisplay() {
    const minutesDisplay = timerMinutes < 10 ? `0${timerMinutes}` : `${timerMinutes}`;
    const secondsDisplay = timerSeconds < 10 ? `0${timerSeconds}` : `${timerSeconds}`;
    timerDisplay.textContent = `${minutesDisplay}:${secondsDisplay}`;
  }

  startTimerBtn.addEventListener('click', startTimer);
  pauseTimerBtn.addEventListener('click', pauseTimer);
  resetTimerBtn.addEventListener('click', resetTimer);

  function updatePlayers() {
    const rosterList = document.getElementById('roster-list');
    rosterList.innerHTML = '';
    playersData.forEach(player => {
      const listItem = document.createElement('li');
      var string = "";
      switch(roundNumber) {
        case 0:
          string = `Player #${player.number}: ${player.name} has entered the game.`;
          break;
        case 1:
          string = `Player #${player.number}: ${player.name} | UNOPENED`;
          break;
        default:
          string = string = `Player #${player.number}: ${player.name} | ${player.gift}`;
      }
      listItem.textContent = string;
      rosterList.appendChild(listItem);
    });
  }

  function updateUpdates(message) {
    const updateMessages = document.getElementById("updates");
    const updateDiv = document.createElement('div');
    updateDiv.textContent = message;
    updateMessages.appendChild(updateDiv);
  }

  presentQuestionBtn.addEventListener('click', (event) => {
    event.preventDefault();
    if (questionIndex == -1) { questionIndex = 0 }
    if (questionIndex == questions.length) { 
      alert("All Questions are done! Nice work everyone!");
      questionIndex = -1;
      return; 
    }
    alert(`Question: ${questions[questionIndex]}`);
    questionIndex++;
  })

  signUpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const playerNumberInput = document.getElementById('playerNumber');
    const playerNameInput = document.getElementById('playerName');
    const giftContributionInput = document.getElementById('giftContribution');

    const playerNumber = parseInt(playerNumberInput.value);
    const playerName = playerNameInput.value.trim();
    const giftContribution = giftContributionInput.value.trim();

    if (!isNaN(playerNumber) && playerNumber > 0 && playerName && giftContribution) {
      playersData.push({ number: playerNumber, name: playerName, gift: giftContribution });
      updatePlayers();
      playerNumberInput.value = '';
      playerNameInput.value = '';
      giftContributionInput.value = '';
    }
  });

  const startGameBtn = document.getElementById('start-game-btn');
  startGameBtn.addEventListener('click', () => {
    if (!gameStarted && playersData.length > 0) {
      startGame();
      startGameBtn.textContent = `Start Round ${roundNumber + 1}`;
    }
    else if (playersData.length > 0) {
      if (roundNumber < 10) {
        roundNumber++;
        updateUpdates(`Round ${roundNumber} has now begun!`);
        if (roundNumber >= 9) {
          startGameBtn.textContent = `End Game`;
        }
        else {
          startGameBtn.textContent = `Start Round ${roundNumber + 1}`;
        }
        updatePlayers();
        updateRoundNumber();
      }
      else {
        startGameBtn.disabled = true;
        startGameBtn.textContent = "Game over!";
        updateUpdates("The game is now formally over.  Swap at will and take pictures with your gift!");
        updateRoundNumber();
        endGame();
      }
    }
    updateRoundNumber();
  });

  function endGame() {
    gameStarted = false;
    roundNumber = 0;
  }
  
  function startGame() {
    gameStarted = true;
    roundNumber = 1;
    updateUpdates('The game has started!');
  }

  function updateRoundNumber() {
    switch(roundNumber) {
      case 0:
        roundNumberDisplay.textContent = `Have you grabbed a number yet? Game has not started!`;
        break;
      case 1:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Pick a mystery gift!`;
        break;
      case 2:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Keep or Swap!`;
        break;
      case 3:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Grab a perk card!`;
        break;
      case 4:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Questions!`;
        break;
      case 5:
        roundNumberDisplay.textContent = `Round ${roundNumber}: In or Out?!`;
        break;
      case 6:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Musical Chairs!`;
        break;
      case 7:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Grab a randomizer!`;
        break;
      case 8:
        roundNumberDisplay.textContent = `Round ${roundNumber}: Rock, Paper, Scissors Tourney!`;
        break;
      default:
        roundNumberDisplay.textContent = `Voluntary Swap / Picture Time / Game over!!`;
        break; 
    }
  }

  openModalBtn.addEventListener('click', () => {
    // Dynamically populate player and swapPlayer dropdowns
    populatePlayerDropdown();
    populateSwapPlayerDropdown()
    populateReorderPlayerDropdown();
    modal.style.display = 'block';
  });

  closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  submitActionBtn.addEventListener('click', () => {
    const playerNumber = parseInt(playerSelect.value);

    // Validate input
    if (!isNaN(playerNumber) && playerNumber > 0 && playerNumber <= playersData.length) {
      const action = actionSelect.value;
      switch(action) {
        case 'swap':
          const swapPlayerNumber = parseInt(swapPlayerSelect.value);
          modifyPlayerAction(playerNumber, action, swapPlayerNumber);
          break;
        case 'reorder':
          const reorderedPlayerNumber = parseInt(reorderedPlayerSelect.value);
          modifyPlayerAction(playerNumber, action, reorderedPlayerNumber);
          break;
        case 'keep':
          modifyPlayerAction(playerNumber, action, playerNumber);
      }
      modal.style.display = 'none';
    } else {
      alert('Invalid player number. Please enter a valid number.');
    }
  });

  function populateReorderPlayerDropdown() {
    // Clear existing options
    reorderedPlayerSelect.innerHTML = '';

    // Populate the dropdown with player information
    playersData.forEach(player => {
      const option = document.createElement('option');
      option.value = player.number;
      option.textContent = `${player.name} (${player.number})`;
      reorderedPlayerSelect.appendChild(option);
    });
  }

  function populatePlayerDropdown() {
    // Clear existing options
    playerSelect.innerHTML = '';

    // Populate the dropdown with player information
    playersData.forEach(player => {
      const option = document.createElement('option');
      option.value = player.number;
      option.textContent = `${player.name} (${roundNumber == 1 ? "UNOPENED" : player.gift})`;
      playerSelect.appendChild(option);
    });
  }

  function populateSwapPlayerDropdown() {
    // Clear existing options
    swapPlayerSelect.innerHTML = '';

    // Populate the dropdown with player information
    playersData.forEach(player => {
      const option = document.createElement('option');
      option.value = player.number;
      option.textContent = `${player.name} (${roundNumber == 1 ? "UNOPENED" : player.gift})`;
      swapPlayerSelect.appendChild(option);
    });
  }

  function modifyPlayerAction(playerNumber, action, otherPlayerNumber) {
    const player = playersData.find(player => player.number === playerNumber);
    const otherPlayer = playersData.find(player => player.number === otherPlayerNumber);

    if (player) {  
      switch (action) {
        case 'swap':
          if (otherPlayer) {
            const tempGift = player.gift;
            player.gift = otherPlayer.gift;
            otherPlayer.gift = tempGift;
            if (roundNumber == 1) {
              updateUpdates(`${player.name} swapped with ${otherPlayer.name}.`);
            }
            if (roundNumber == 2) {
              updateUpdates(`${player.name} unwrapped the ${player.gift}`);
            }
            if (roundNumber >= 2) {
              updateUpdates(`${player.name} swapped ${player.gift} with ${otherPlayer.name} for the ${otherPlayer.gift}.`);
            }
          }
          break;
        case 'keep':
          updateUpdates(`${player.name} kept the ${roundNumber == 1 ? "UNOPENED" : player.gift}.`);
          break;
        case 'reorder':
          if (otherPlayer) {
            const tempID = player.number;
            player.number = otherPlayer.number;
            otherPlayer.number = tempID;
            updateUpdates(`${player.name} (Now: ${player.number}) swapped order with ${otherPlayer.name} (Now: ${otherPlayer.number}).`);
          }
          break;
        // Add more cases for other actions if needed
      }

      // Update the playersData array
      updatePlayers();
    }
  }

  actionSelect.addEventListener('change', () => {
    const selectedAction = actionSelect.value;
  
    // Show/hide relevant dropdowns based on the selected action
    if (selectedAction === 'swap') {
      swapPlayerSelect.style.display = 'block';
      swapPlayerLabel.style.display = 'block';
      reorderedPlayerSelect.style.display = 'none';
      reorderedPlayerLabel.style.display = 'none';
    } else if (selectedAction === 'keep') {
      swapPlayerSelect.style.display = 'none';
      swapPlayerLabel.style.display = 'none';
      reorderedPlayerSelect.style.display = 'none';
      reorderedPlayerLabel.style.display = 'none';
    } else if (selectedAction === 'reorder') {
      swapPlayerSelect.style.display = 'none';
      swapPlayerLabel.style.display = 'none';
      reorderedPlayerSelect.style.display = 'block';
      reorderedPlayerLabel.style.display = 'block';
    }
  });
});
