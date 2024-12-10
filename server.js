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

// 添加词典查询路由
app.get('/translate/:word', async (req, res) => {
    try {
        const word = req.params.word;
        
        // 使用有道词典 API
        const response = await axios.get(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&doctype=json&keyfrom=mac.main&id=4E9D17E24A7087A5CA842577D0B3B9B5&vendor=mac.main.dict&appVer=2.1.1&client=mac&le=eng`, {
            headers: {
                'User-Agent': 'YoudaoDict/2.1.1 (Mac OS X Version 10.15.7 (Build 19H2))',
                'Referer': 'https://dict.youdao.com'
            }
        });

        const parts = [];
        
        // 1. 添加音标
        if (response.data?.ec?.word?.[0]) {
            const entries = response.data.ec.word[0];
            const ukphone = entries.ukphone ? `英 [${entries.ukphone}]` : '';
            const usphone = entries.usphone ? `美 [${entries.usphone}]` : '';
            const phones = [ukphone, usphone].filter(p => p).join('  ');
            if (phones) parts.push(phones);
        }

        // 2. 添加柯林斯英文释义
        if (response.data?.collins?.collins_entries) {
            const englishDefs = [];
            
            response.data.collins.collins_entries.forEach((entry, idx) => {
                if (!entry.value || idx >= 3) return; // 最多显示3个释义
                
                // 处理柯林斯释义
                const meanings = entry.value.split(/\d+\.\s+/)
                    .filter(m => m.trim())
                    .map((meaning, mIdx) => {
                        let def = `${mIdx + 1}. `;
                        
                        // 提取词性和释义
                        const posMatch = meaning.match(/^(\w+\.)\s+(.+?)(?=\s+例：|\s*$)/);
                        if (posMatch) {
                            def += `【${posMatch[1]}】${posMatch[2].trim()}`;
                        } else {
                            def += meaning.trim();
                        }

                        // 提取例句
                        const exampleMatch = meaning.match(/例：(.+?)(?=\s+翻译：|\s*$)/);
                        const translationMatch = meaning.match(/翻译：(.+?)$/);
                        
                        if (exampleMatch) {
                            def += `\n   例: ${exampleMatch[1].trim()}`;
                            if (translationMatch) {
                                def += `\n   译: ${translationMatch[1].trim()}`;
                            }
                        }

                        return def;
                    });
                
                englishDefs.push(...meanings);
            });

            if (englishDefs.length > 0) {
                parts.push('Collins:\n' + englishDefs.join('\n\n'));
            }
        }

        // 3. 添加简明中文释义
        if (response.data?.ec?.word?.[0]?.trs) {
            const entries = response.data.ec.word[0];
            const translations = entries.trs
                .map(tr => {
                    const pos = tr.pos ? `【${tr.pos}】` : '';
                    return `${pos}${tr.tr[0].l.i[0]}`;
                })
                .join('\n');
            parts.push('中文释义:\n' + translations);
        }

        // 4. 添加双语例句
        if (response.data?.blng_sents_part?.sentence) {
            const sentences = response.data.blng_sents_part.sentence
                .slice(0, 2)  // 只取前两个例句
                .map((sent, idx) => {
                    return `例句 ${idx + 1}:\n  ${sent.sentence}\n  ${sent.sentence_translation}`;
                })
                .join('\n\n');
            if (sentences) {
                parts.push('\n例句:\n' + sentences);
            }
        }

        // 添加调试日志
        console.log('API Response:', JSON.stringify(response.data, null, 2));

        const translation = parts.join('\n\n');
        res.json({ translation: translation || '未找到释义' });
    } catch (error) {
        console.error('翻译查询错误:', error);
        res.status(500).json({ error: '查询失败' });
    }
});

// Socket.io 连接处
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