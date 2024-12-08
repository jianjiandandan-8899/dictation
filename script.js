const words = [
    'apple', 'banana', 'orange', 'computer', 'keyboard',
    'mouse', 'phone', 'book', 'pencil', 'window'
];

let currentWordIndex = 0;
let score = 0;

const playButton = document.getElementById('playButton');
const checkButton = document.getElementById('checkButton');
const nextButton = document.getElementById('nextButton');
const userInput = document.getElementById('userInput');
const feedback = document.getElementById('feedback');
const scoreElement = document.getElementById('score');
const totalElement = document.getElementById('total');

totalElement.textContent = words.length;

function speakWord(word) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    speechSynthesis.speak(utterance);
}

playButton.addEventListener('click', () => {
    speakWord(words[currentWordIndex]);
});

checkButton.addEventListener('click', () => {
    const userAnswer = userInput.value.toLowerCase().trim();
    const correctWord = words[currentWordIndex];
    
    if (userAnswer === correctWord) {
        feedback.textContent = 'Correct! ✓';
        feedback.className = 'feedback correct';
        score++;
        scoreElement.textContent = score;
    } else {
        feedback.textContent = `Incorrect! ✗ The correct answer is: ${correctWord}`;
        feedback.className = 'feedback incorrect';
    }
    
    checkButton.style.display = 'none';
    nextButton.style.display = 'inline-block';
});

nextButton.addEventListener('click', () => {
    currentWordIndex++;
    
    if (currentWordIndex >= words.length) {
        alert(`Listening completed!\nFinal score: ${score}/${words.length}`);
        currentWordIndex = 0;
        score = 0;
        scoreElement.textContent = score;
    }
    
    userInput.value = '';
    feedback.textContent = '';
    checkButton.style.display = 'inline-block';
    nextButton.style.display = 'none';
}); 