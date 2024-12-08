const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const axios = require('axios');  // 需要先安装: npm install axios

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('charset', 'utf-8');

// 声明全局变量
let words = [];
const DEFAULT_PAGE_SIZE = 20;

// 从文件读取单词列表
function parseWordList(content) {
    const lines = content.split('\n');
    let startIndex = -1;
    
    // 找到单词列表开始的位置
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Word List')) {
            startIndex = i + 1;
            break;
        }
    }
    
    if (startIndex === -1) {
        console.error('未找到单词列表起始位置');
        return [];
    }

    // 从单词列表开始位置处理每一行
    const wordList = lines.slice(startIndex)
        .map(line => {
            // 获取第一个空格或音标符号前的内容作为单词
            const word = line.trim().split(/[\s\/\[]/)[0];
            // 去掉单词后面可能的星号
            return word.replace(/\*$/, '');
        })
        .filter(word => word.length > 0); // 过滤空行

    console.log(`总行数: ${lines.length}`);
    console.log(`单词列表起始行: ${startIndex}`);
    console.log(`成功解析到 ${wordList.length} 个单词`);
    return wordList;
}

try {
    // 读取单词列表
    const wordListContent = fs.readFileSync('word-dictation/wordlist.txt', 'utf8');
    words = parseWordList(wordListContent);
    
    if (words.length === 0) {
        console.error('警告：没有解析到任何单词');
    }
} catch (error) {
    console.error('读取单词表文件失败:', error);
    process.exit(1);
}

// 路由
app.get('/', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        // 强制使用默认值
        const pageSize = 20;  // 直接使用固定值
        const totalPages = Math.ceil(words.length / pageSize);
        
        const validPage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (validPage - 1) * pageSize;
        const pageWords = words.slice(startIndex, startIndex + pageSize);

        res.render('index', {
            currentPage: validPage,
            totalPages,
            totalWords: words.length,
            pageSize: 20,  // 直接使用固定值
            pageWords: pageWords || []
        });
    } catch (error) {
        console.error('路由处理错误:', error);
        res.status(500).send('服务器错误');
    }
});

// 添加有道词典查询路由
app.get('/translate/:word', async (req, res) => {
    try {
        const word = req.params.word;
        // 使用有道词典查询接口
        const response = await axios.get(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://dict.youdao.com'
            }
        });
        
        let translation = '';
        const data = response.data;
        
        // 获取词性和释义
        if (data?.ec?.word?.[0]?.trs) {
            const entries = data.ec.word[0];
            // 获取音标（如果有）
            const phonetic = entries.ukphone ? `英 [${entries.ukphone}]` : '';
            const usphone = entries.usphone ? `美 [${entries.usphone}]` : '';
            const phones = [phonetic, usphone].filter(p => p).join('  ');
            
            // 获取所有释义
            const meanings = entries.trs.map(tr => {
                const pos = tr.pos ? `【${tr.pos}】` : ''; // 词性
                const def = tr.tr[0].l.i[0];              // 中文释义
                return `${pos} ${def}`;
            });
            
            // 组合音标和释义
            translation = phones ? `${phones}\n\n${meanings.join('\n')}` : meanings.join('\n');
        }
        
        // 如果找不到释义，返回提示
        res.json({ translation: translation || '未找到释义' });
    } catch (error) {
        console.error('翻译查询错误:', error);
        res.status(500).json({ error: '查询失败' });
    }
});

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('用户已连接');
    
    socket.on('requestPage', (page, data) => {
        const pageSize = data?.pageSize || DEFAULT_PAGE_SIZE;
        const totalPages = Math.ceil(words.length / pageSize);
        const validPage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (validPage - 1) * pageSize;
        const pageWords = words.slice(startIndex, startIndex + pageSize);
        
        socket.emit('wordList', {
            words: pageWords,
            currentPage: validPage,
            totalPages: totalPages
        });
    });
    
    socket.on('checkAnswer', (data) => {
        const { answer, wordIndex, currentPage } = data;
        const pageSize = parseInt(data.pageSize) || DEFAULT_PAGE_SIZE;
        const actualIndex = (currentPage - 1) * pageSize + wordIndex;
        const isCorrect = answer.toLowerCase().trim() === words[actualIndex].toLowerCase();
        socket.emit('checkResult', { 
            isCorrect, 
            correctWord: words[actualIndex] 
        });
    });

    socket.on('disconnect', () => {
        console.log('用户已断开连接');
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
}); 