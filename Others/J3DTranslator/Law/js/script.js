let gameData = null;
let currentMode = null;
let currentLevel = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let hearts = 3;
let timer = null;
let timeLeft = 30;
let playerProgress = JSON.parse(localStorage.getItem('penalCodeProgress')) || {};

// Initialisation
document.addEventListener('DOMContentLoaded', async function() {
    await loadGameData();
    document.getElementById('playButton').addEventListener('click', showModeSelection);
});

// Chargement des données
async function loadGameData() {
    try {
        const response = await fetch('data/data.json');
        gameData = await response.json();
    } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
    }
}

// Navigation
function showMainMenu() {
    hideAllScreens();
    document.getElementById('mainMenu').style.display = 'block';
}

function showModeSelection() {
    hideAllScreens();
    document.getElementById('modeSelection').style.display = 'block';
}

function showLevelSelection() {
    hideAllScreens();
    document.getElementById('levelSelection').style.display = 'block';
    generateLevelGrid();
}

function hideAllScreens() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('modeSelection').style.display = 'none';
    document.getElementById('levelSelection').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'none';
}

// Sélection du mode
function selectMode(modeId) {
    currentMode = modeId;
    const mode = gameData.modes.find(m => m.id === modeId);
    document.getElementById('levelModeTitle').textContent = mode.name;
    showLevelSelection();
}

// Génération de la grille des niveaux
function generateLevelGrid() {
    const levelGrid = document.getElementById('levelGrid');
    levelGrid.innerHTML = '';
    
    for (let i = 0; i < 11; i++) {
        const levelCard = document.createElement('div');
        levelCard.className = 'level-card';
        levelCard.onclick = () => startLevel(i);
        
        const levelNumber = document.createElement('div');
        levelNumber.className = 'level-number';
        levelNumber.textContent = `Niveau ${i}`;
        
        const levelTitle = document.createElement('div');
        levelTitle.className = 'level-title';
        levelTitle.textContent = gameData.levelTitles[i];
        
        const stars = document.createElement('div');
        stars.className = 'stars';
        
        const progressKey = `mode_${currentMode}_level_${i}`;
        const levelProgress = playerProgress[progressKey] || 0;
        
        for (let j = 0; j < 3; j++) {
            const star = document.createElement('div');
            star.className = j < levelProgress ? 'star filled' : 'star';
            stars.appendChild(star);
        }
        
        levelCard.appendChild(levelNumber);
        levelCard.appendChild(levelTitle);
        levelCard.appendChild(stars);
        levelGrid.appendChild(levelCard);
    }
}

// Démarrage d'un niveau
function startLevel(levelId) {
    currentLevel = levelId;
    generateQuestions();
    startQuiz();
}

// Génération des questions
function generateQuestions() {
    const articlesForLevel = gameData.articles.filter(article => article.level === currentLevel);
    const questionsCount = Math.min(10, articlesForLevel.length);
    
    // Mélanger et sélectionner les articles
    const shuffledArticles = articlesForLevel.sort(() => Math.random() - 0.5);
    const selectedArticles = shuffledArticles.slice(0, questionsCount);
    
    currentQuestions = selectedArticles.map(article => {
        const otherArticles = gameData.articles.filter(a => a.number !== article.number);
        const shuffledOthers = otherArticles.sort(() => Math.random() - 0.5);
        
        let question = {};
        
        switch (currentMode) {
            case 1: // Numéro -> Description
                question = {
                    question: `Que dit l'${article.number} ?`,
                    correct: article.description,
                    options: [
                        article.description,
                        shuffledOthers[0].description,
                        shuffledOthers[1].description,
                        shuffledOthers[2].description
                    ].sort(() => Math.random() - 0.5)
                };
                break;
                
            case 2: // Description -> Numéro
                question = {
                    question: article.description,
                    correct: article.number,
                    options: [
                        article.number,
                        shuffledOthers[0].number,
                        shuffledOthers[1].number,
                        shuffledOthers[2].number
                    ].sort(() => Math.random() - 0.5)
                };
                break;
                
            case 3: // Situation -> Numéro
                question = {
                    question: article.situation,
                    correct: article.number,
                    options: [
                        article.number,
                        shuffledOthers[0].number,
                        shuffledOthers[1].number,
                        shuffledOthers[2].number
                    ].sort(() => Math.random() - 0.5)
                };
                break;
                
            case 4: // Numéro -> Situation
                question = {
                    question: `Quelle situation correspond à l'${article.number} ?`,
                    correct: article.situation,
                    options: [
                        article.situation,
                        shuffledOthers[0].situation,
                        shuffledOthers[1].situation,
                        shuffledOthers[2].situation
                    ].sort(() => Math.random() - 0.5)
                };
                break;
        }
        
        return question;
    });
}

// Démarrage du quiz
function startQuiz() {
    hideAllScreens();
    document.getElementById('quizContainer').style.display = 'block';
    currentQuestionIndex = 0;
    hearts = 3;
    updateHeartsDisplay();
    showQuestion();
}

// Affichage d'une question
function showQuestion() {
    if (currentQuestionIndex >= currentQuestions.length) {
        endQuiz();
        return;
    }
    
    const question = currentQuestions[currentQuestionIndex];
    
    // Mise à jour du progrès
    document.getElementById('quizProgress').textContent = `${currentQuestionIndex + 1}/${currentQuestions.length}`;
    
    // Affichage de la question
    document.getElementById('questionText').textContent = question.question;
    
    // Génération des options
    const optionsGrid = document.getElementById('optionsGrid');
    optionsGrid.innerHTML = '';
    
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option;
        button.onclick = () => selectAnswer(option, question.correct);
        optionsGrid.appendChild(button);
    });
    
    // Démarrage du timer
    startTimer();
}

// Timer
function startTimer() {
    timeLeft = 30;
    updateTimerDisplay();
    
    timer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            wrongAnswer();
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById('quizTimer').textContent = `${timeLeft}s`;
}

// Sélection de réponse
function selectAnswer(selectedAnswer, correctAnswer) {
    clearInterval(timer);
    
    const buttons = document.querySelectorAll('.option-button');
    buttons.forEach(button => {
        button.disabled = true;
        if (button.textContent === correctAnswer) {
            button.classList.add('correct');
        } else if (button.textContent === selectedAnswer && selectedAnswer !== correctAnswer) {
            button.classList.add('incorrect');
        }
    });
    
    if (selectedAnswer === correctAnswer) {
        setTimeout(() => {
            currentQuestionIndex++;
            showQuestion();
        }, 2000);
    } else {
        wrongAnswer();
    }
}

// Mauvaise réponse
function wrongAnswer() {
    hearts--;
    updateHeartsDisplay();
    
    if (hearts <= 0) {
        setTimeout(() => {
            endQuiz();
        }, 2000);
    } else {
        setTimeout(() => {
            currentQuestionIndex++;
            showQuestion();
        }, 2000);
    }
}

// Mise à jour de l'affichage des cœurs
function updateHeartsDisplay() {
    const heartsContainer = document.getElementById('hearts');
    const heartElements = heartsContainer.querySelectorAll('.heart');
    
    heartElements.forEach((heart, index) => {
        if (index >= hearts) {
            heart.classList.add('lost');
        } else {
            heart.classList.remove('lost');
        }
    });
}

// Fin du quiz
function endQuiz() {
    const stars = hearts;
    const progressKey = `mode_${currentMode}_level_${currentLevel}`;
    
    // Sauvegarder le meilleur score
    if (!playerProgress[progressKey] || playerProgress[progressKey] < stars) {
        playerProgress[progressKey] = stars;
        localStorage.setItem('penalCodeProgress', JSON.stringify(playerProgress));
    }
    
    // Afficher les résultats
    alert(`Quiz terminé ! Vous avez obtenu ${stars} étoile(s) !`);
    showLevelSelection();
}


