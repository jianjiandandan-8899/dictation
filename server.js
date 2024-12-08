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

// 修改为有道词典 API
app.get('/translate/:word', async (req, res) => {
    try {
        const word = req.params.word;
        const response = await axios.get('https://fanyi.youdao.com/openapi.do', {
            params: {
                keyfrom: 'node-translator',
                key: '2058911035',
                type: 'data',
                doctype: 'json',
                version: '1.1',
                q: word
            }
        });
        
        let translation = '';
        if (response.data?.basic?.explains) {
            // 获取基本释义
            translation = response.data.basic.explains.join('\n');
        } else if (response.data?.translation) {
            // 如果没有详细释义，使用简单翻译
            translation = response.data.translation.join('\n');
        }
        
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