const socket = io();

let words = [];
let currentWordIndex = 0;
let currentPage = window.currentPage || 1;
let pageSize = 20;
let totalPages = 0;
let isPlaying = false;

// 添加记录答案的数组
let userAnswers = [];

// 添加翻译缓存
const translationCache = new Map();

const userInput = document.getElementById('userInput');
const feedback = document.getElementById('feedback');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const toggleButton = document.getElementById('toggleWords');
const wordListContainer = document.getElementById('wordListContainer');

// 请求当前页的单词
function requestCurrentPage() {
    pageSize = document.getElementById('pageSize').value;
    socket.emit('requestPage', currentPage, { pageSize: parseInt(pageSize) });
}

// 初始化加载
requestCurrentPage();

// 接收服务器发送的单词列表
socket.on('wordList', (data) => {
    words = data.words;
    currentPage = data.currentPage;
    totalPages = data.totalPages;
    currentWordIndex = 0;
    updateWordList(words, currentPage, totalPages);
    resetUI();
});

function resetUI() {
    userInput.value = '';
    feedback.textContent = '';
    userInput.focus();
}

// 语音合成函数
async function speakWord(word) {
    const utterance = new SpeechSynthesisUtterance(word);
    
    // 获取可用的语音列表
    const voices = speechSynthesis.getVoices();
    
    // 优先选择更自然的语音
    const preferredVoices = [
        'Google US English',      // Chrome 的高质量语音
        'Microsoft Aria Online (Natural)', // Edge 的自然语音
        'Samantha',              // macOS 的高质量语音
        'Alex'                   // macOS 的另一个高质量语音
    ];

    // 尝试找到首选语音
    let selectedVoice = null;
    for (const voiceName of preferredVoices) {
        const voice = voices.find(v => v.name.includes(voiceName));
        if (voice) {
            selectedVoice = voice;
            break;
        }
    }

    // 如果没找到首选语音，使用任何可用的英语语音
    if (!selectedVoice) {
        selectedVoice = voices.find(voice => 
            voice.lang === 'en-US' && !voice.name.includes('Microsoft')
        ) || voices.find(voice => 
            voice.lang.includes('en')
        );
    }

    // 设置语音参数
    utterance.voice = selectedVoice;
    utterance.lang = 'en-US';
    utterance.rate = 0.85;      // 稍微放慢速度
    utterance.pitch = 1.0;      // 正常音调
    utterance.volume = 1.0;     // 最大音量

    // 如果正在播放其他内容，先停止
    speechSynthesis.cancel();
    
    // 开始播放
    speechSynthesis.speak(utterance);

    // 等待播放完成
    return new Promise(resolve => {
        utterance.onend = resolve;
    });
}

// 自动播放功能
async function autoPlay() {
    const autoPlayButton = document.getElementById('autoPlayButton');
    
    if (isPlaying) {
        isPlaying = false;
        autoPlayButton.textContent = '自动播放';
        autoPlayButton.classList.remove('playing');
        return;
    }

    isPlaying = true;
    autoPlayButton.textContent = '停止播放';
    autoPlayButton.classList.add('playing');
    currentWordIndex = 0;

    async function playAllWords() {
        // 清空答案记录
        userAnswers = [];

        while (currentWordIndex < words.length && isPlaying) {
            feedback.textContent = '';
            feedback.className = 'feedback';
            userInput.value = '';

            const totalInterval = parseInt(document.getElementById('playInterval').value) * 1000;
            const times = parseInt(document.getElementById('playTimes').value);
            
            // 计算每次播放之间的间隔时间
            const intervalBetweenPlays = totalInterval / times;
            
            // 播放指定次数
            for (let t = 0; t < times && isPlaying; t++) {
                await speakWord(words[currentWordIndex]);
                // 最后一次播放后不需要等待
                if (t < times - 1) {
                    await new Promise(resolve => setTimeout(resolve, intervalBetweenPlays));
                }
            }

            userInput.focus();
            await new Promise(resolve => {
                function checkAndContinue() {
                    const answer = userInput.value.trim();
                    if (answer) {
                        const isCorrect = answer.toLowerCase() === words[currentWordIndex].toLowerCase();
                        
                        // 记录用户答案
                        userAnswers.push({
                            word: words[currentWordIndex],
                            userAnswer: answer,
                            isCorrect: isCorrect
                        });

                        if (isCorrect) {
                            feedback.textContent = '正确! ✓';
                            feedback.className = 'feedback correct';
                        } else {
                            feedback.textContent = `错误! ✗ 正确答案是: ${words[currentWordIndex]}`;
                            feedback.className = 'feedback incorrect';
                        }

                        userInput.value = '';
                        currentWordIndex++;
                        resolve();
                    }
                }

                userInput.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        checkAndContinue();
                    }
                };
            });

            // 如果是最后一个单词，显示总结
            if (currentWordIndex >= words.length && isPlaying) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                showSummary();
                isPlaying = false;
                autoPlayButton.textContent = '自动播放';
                autoPlayButton.classList.remove('playing');
            }
            // 如果不是最后一个单词，立即进入下一个
            else if (currentWordIndex < words.length && isPlaying) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 只等待1秒就进入下一个单词
            }
        }
    }

    playAllWords();
}

// 事件监听器
document.getElementById('autoPlayButton').addEventListener('click', autoPlay);

// 分页按事件
prevPageBtn.addEventListener('click', () => {
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('autoPlayButton').textContent = '自动播放';
        document.getElementById('autoPlayButton').classList.remove('playing');
    }
    if (currentPage > 1) {
        currentPage--;
        feedback.textContent = '';
        feedback.className = 'feedback';
        requestCurrentPage();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('autoPlayButton').textContent = '自动播放';
        document.getElementById('autoPlayButton').classList.remove('playing');
    }
    if (currentPage < totalPages) {
        currentPage++;
        feedback.textContent = '';
        feedback.className = 'feedback';
        requestCurrentPage();
    }
});

// 页面大小改变处理
document.getElementById('pageSize').addEventListener('change', (e) => {
    pageSize = e.target.value;
    currentPage = 1;
    requestCurrentPage();
});

// 页面跳转功能
document.getElementById('jumpButton').addEventListener('click', () => {
    const jumpInput = document.getElementById('pageJump');
    let targetPage = parseInt(jumpInput.value);
    targetPage = Math.max(1, Math.min(targetPage, totalPages));
    
    if (targetPage !== currentPage) {
        currentPage = targetPage;
        feedback.textContent = '';
        feedback.className = 'feedback';
        requestCurrentPage();
    }
    jumpInput.value = targetPage;
});

// 支持回车键跳转
document.getElementById('pageJump').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('jumpButton').click();
    }
});

// 修改获取翻译的函数
async function getTranslation(word) {
    if (translationCache.has(word)) {
        return translationCache.get(word);
    }

    try {
        const response = await fetch(`/translate/${encodeURIComponent(word)}`);
        const data = await response.json();
        
        // 格式化翻译内容
        let formattedTranslation = '';
        if (data.translation) {
            const meanings = data.translation.split('\n').filter(line => line.trim());
            formattedTranslation = meanings.map(meaning => {
                // 处理词性标记
                meaning = meaning.replace(/^(noun|verb|adjective|adverb):/i, (match) => {
                    return `【${match.slice(0, -1)}】`;  // 使用中文方括号包裹词性
                });
                // 清理多余的空格和标点
                meaning = meaning.replace(/\s+/g, ' ').trim();
                return meaning;
            }).join('\n\n');  // 使用双换行分隔不同释义
        }
        
        translationCache.set(word, formattedTranslation);
        return formattedTranslation;
    } catch (error) {
        console.error('获取翻译失败:', error);
        return '';
    }
}

// 修改更新单词列表的函数
function updateWordList(words, currentPage, totalPages) {
    const wordListUl = document.getElementById('currentWords');
    wordListUl.innerHTML = words.map((word, index) => 
        `<li>
            <span class="word-index">${index + 1}. </span>
            <span class="word-text" onmouseover="speakWord('${word}')" data-word="${word}">
                <span>${word}</span>
                <div class="tooltip-container"></div>
            </span>
            <span class="word-stars">${'*'.repeat(word.length)}</span>
        </li>`
    ).join('');

    // 添加悬停事件监听器
    const wordElements = wordListUl.querySelectorAll('.word-text');
    wordElements.forEach(element => {
        element.addEventListener('mouseenter', async function() {
            const word = this.dataset.word;
            const tooltipContainer = this.querySelector('.tooltip-container');
            if (!tooltipContainer.textContent) {  // 只在第一次悬停时获取翻译
                const translation = await getTranslation(word);
                if (translation) {
                    tooltipContainer.textContent = translation;
                }
            }
        });
    });
    
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    
    const paginationSpan = document.querySelector('.pagination span');
    paginationSpan.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
    
    const jumpInput = document.getElementById('pageJump');
    jumpInput.value = currentPage;
    jumpInput.max = totalPages;
    
    const isHidden = localStorage.getItem('wordsHidden') === 'true';
    if (isHidden) {
        wordListContainer.classList.add('words-hidden');
        toggleButton.classList.add('words-hidden');
    }
}

// 单词显示切换功能
toggleButton.addEventListener('click', () => {
    wordListContainer.classList.toggle('words-hidden');
    toggleButton.classList.toggle('words-hidden');
    localStorage.setItem('wordsHidden', wordListContainer.classList.contains('words-hidden'));
});

// 页面加载时恢复状态
document.addEventListener('DOMContentLoaded', () => {
    const isHidden = localStorage.getItem('wordsHidden') === 'true';
    if (isHidden) {
        wordListContainer.classList.add('words-hidden');
        toggleButton.classList.add('words-hidden');
    }
    userInput.focus();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            const voices = speechSynthesis.getVoices();
            console.log('可用语音列表:', voices.map(v => ({
                name: v.name,
                lang: v.lang
            })));
        };
    }
});

// 添加显示总结的函数
function showSummary() {
    let summaryHTML = '<div class="summary-table">';
    summaryHTML += '<h3>本页听写总结</h3>';
    summaryHTML += '<table>';
    summaryHTML += '<tr><th>序号</th><th>正确单词</th><th>你的答案</th><th>结果</th></tr>';
    
    userAnswers.forEach((answer, index) => {
        const resultClass = answer.isCorrect ? 'correct' : 'incorrect';
        summaryHTML += `
            <tr class="${resultClass}">
                <td>${index + 1}</td>
                <td>${answer.word}</td>
                <td>${answer.userAnswer}</td>
                <td>${answer.isCorrect ? '✓' : '✗'}</td>
            </tr>
        `;
    });
    
    summaryHTML += '</table>';
    
    // 计算正确率
    const correctCount = userAnswers.filter(a => a.isCorrect).length;
    const totalCount = userAnswers.length;
    const accuracy = ((correctCount / totalCount) * 100).toFixed(1);
    
    summaryHTML += `<div class="summary-stats">正确率: ${accuracy}% (${correctCount}/${totalCount})</div>`;
    summaryHTML += '</div>';
    
    feedback.innerHTML = summaryHTML;
}
