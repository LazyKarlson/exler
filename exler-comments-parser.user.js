// ==UserScript==
// @name         Exler Comments Tracker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Отмечает новые комментарии на exler.* с момента последнего посещения (с отслеживанием по постам)
// @author       You
// @match        https://exler.*/*/*.htm*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'exler_comments_data';
    const MAX_POST_AGE_DAYS = 30; // Автоочистка данных старше 30 дней

    // Получаем URL текущей страницы (без якоря)
    function getPageKey() {
        return window.location.href.split('#')[0];
    }

    // Парсим дату и время комментария в объект Date
    function parseCommentDate(dateStr, timeStr) {
        // Формат: 22.01.26 14:05
        const [day, month, year] = dateStr.split('.');
        const [hours, minutes] = timeStr.split(':');

        // Преобразуем год (26 -> 2026)
        const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);

        return new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
    }

    // Получаем все данные из хранилища
    function getStorageData() {
        const data = GM_getValue(STORAGE_KEY, null);
        if (!data) {
            return {
                readPosts: {}
            };
        }
        return JSON.parse(data);
    }

    // Сохраняем данные в хранилище
    function saveStorageData(data) {
        GM_setValue(STORAGE_KEY, JSON.stringify(data));
    }

    // Получаем время последнего посещения поста
    function getLastVisitTime(pageKey) {
        const data = getStorageData();
        const timestamp = data.readPosts[pageKey];
        return timestamp ? new Date(timestamp) : null;
    }

    // Сохраняем время посещения поста
    function saveVisitTime(pageKey) {
        let data = getStorageData();

        // Очищаем старые данные
        data = cleanupOldData(data);

        // Сохраняем текущее время для этого поста
        data.readPosts[pageKey] = new Date().toISOString();

        saveStorageData(data);
    }

    // Очистка старых данных
    function cleanupOldData(data) {
        const now = new Date();
        const maxAge = MAX_POST_AGE_DAYS * 24 * 60 * 60 * 1000;

        for (const [url, timestamp] of Object.entries(data.readPosts)) {
            const visitDate = new Date(timestamp);
            if (now - visitDate > maxAge) {
                delete data.readPosts[url];
            }
        }

        return data;
    }

    // Функция для парсинга комментариев
    function parseComments(lastVisitTime) {
        const comments = [];

        // Находим все элементы комментариев
        const commentElements = document.querySelectorAll('.comments-item');

        commentElements.forEach((commentEl, index) => {
            // Ищем дату и время внутри комментария
            const dateElement = commentEl.querySelector('.comment-date .blog-item-date');

            if (dateElement) {
                // Извлекаем дату (текст без span)
                const dateText = Array.from(dateElement.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .join('');

                // Извлекаем время из span
                const timeElement = dateElement.querySelector('span');
                const timeText = timeElement ? timeElement.textContent.trim() : '';

                // Извлекаем автора комментария
                const authorElement = commentEl.querySelector('.comment-author-name');
                const author = authorElement ? authorElement.textContent.trim() : 'Unknown';

                // Извлекаем текст комментария
                const commentTextElement = commentEl.querySelector('.comment-content');
                const commentText = commentTextElement ? commentTextElement.textContent.trim() : '';

                // Парсим дату комментария
                const commentDate = parseCommentDate(dateText, timeText);

                // Определяем, новый ли комментарий
                const isNew = !lastVisitTime || commentDate > lastVisitTime;

                comments.push({
                    index: index + 1,
                    element: commentEl,
                    author: author,
                    date: dateText,
                    time: timeText,
                    datetime: commentDate,
                    isNew: isNew,
                    text: commentText.substring(0, 100) + (commentText.length > 100 ? '...' : '')
                });
            }
        });

        return comments;
    }

    // Функция для выделения новых комментариев
    function highlightNewComments(comments) {
        let newCount = 0;

        comments.forEach(comment => {
            if (comment.isNew) {
                newCount++;

                // Добавляем визуальное выделение
                comment.element.style.position = 'relative';
                comment.element.style.backgroundColor = '#fff3cd';
                comment.element.style.border = '2px solid #ffc107';
                comment.element.style.borderRadius = '5px';
                comment.element.style.padding = '10px';
                comment.element.style.marginBottom = '10px';

                // Добавляем класс для навигации
                comment.element.classList.add('exler-new-comment');
            }
        });

        return newCount;
    }



    // Создаём панель управления
    function createControlPanel(newCount) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 2px solid #4b81e8;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
        `;

        // Заголовок с количеством новых комментариев
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #333;
        `;
        title.innerHTML = newCount > 0
            ? `🆕 Новых комментариев: <span style="color: #ff4444;">${newCount}</span>`
            : '✅ Нет новых комментариев';
        panel.appendChild(title);

        // Кнопка сброса времени посещения
        const resetButton = document.createElement('button');
        resetButton.textContent = '🔄 Сбросить отметки';
        resetButton.style.cssText = `
            width: 100%;
            padding: 8px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            margin-top: 5px;
        `;

        resetButton.addEventListener('click', () => {
            if (confirm('Отметить все комментарии на этой странице как прочитанные?')) {
                const pageKey = getPageKey();
                saveVisitTime(pageKey);
                location.reload();
            }
        });

        resetButton.addEventListener('mouseenter', () => {
            resetButton.style.background = '#5a6268';
        });

        resetButton.addEventListener('mouseleave', () => {
            resetButton.style.background = '#6c757d';
        });

        panel.appendChild(resetButton);

        // Кнопка "Наверх"
        const scrollTopButton = document.createElement('button');
        scrollTopButton.textContent = '⬆️ Наверх';
        scrollTopButton.style.cssText = `
            width: 100%;
            padding: 8px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            margin-top: 5px;
        `;

        scrollTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        scrollTopButton.addEventListener('mouseenter', () => {
            scrollTopButton.style.background = '#218838';
        });

        scrollTopButton.addEventListener('mouseleave', () => {
            scrollTopButton.style.background = '#28a745';
        });

        panel.appendChild(scrollTopButton);

        // Кнопка закрытия панели
        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        closeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: transparent;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #999;
            padding: 0;
            width: 20px;
            height: 20px;
            line-height: 20px;
        `;

        closeButton.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.color = '#333';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.color = '#999';
        });

        panel.appendChild(closeButton);
        document.body.appendChild(panel);
    }



    // Функция для показа уведомления
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            padding: 15px 25px;
            background: #28a745;
            color: white;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            font-size: 14px;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Добавляем CSS анимации
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Главная функция инициализации
    function init() {
        const pageKey = getPageKey();

        // Получаем время последнего посещения (ДО того как сохраним новое)
        const lastVisit = getLastVisitTime(pageKey);



        // Парсим комментарии с учётом времени последнего визита
        const comments = parseComments(lastVisit);

        // Выделяем новые комментарии
        const newCount = highlightNewComments(comments);

        // Создаём панель управления
        createControlPanel(newCount);

        // Включаем навигацию по клавишам, если есть новые комментарии
        if (newCount > 0) {
            setupKeyboardNavigation();
        }

        // ВАЖНО: Сохраняем текущее время как время посещения ПОСЛЕ обработки
        // При следующем визите комментарии новее этого времени будут считаться новыми
        saveVisitTime(pageKey);
    }

    // Навигация по новым комментариям с помощью клавиш j/k
    let navigationSetup = false;
    let currentNavIndex = -1;

    function setupKeyboardNavigation() {
        const newComments = document.querySelectorAll('.exler-new-comment');

        if (newComments.length === 0) return;

        // Если уже настроили навигацию, не добавляем обработчик повторно
        if (navigationSetup) return;
        navigationSetup = true;

        function scrollToComment(index) {
            const comments = document.querySelectorAll('.exler-new-comment');
            if (index < 0 || index >= comments.length) return;

            // Убираем подсветку с предыдущего
            if (currentNavIndex >= 0 && currentNavIndex < comments.length) {
                comments[currentNavIndex].style.boxShadow = '';
            }

            currentNavIndex = index;
            const comment = comments[currentNavIndex];

            // Добавляем подсветку текущего
            comment.style.boxShadow = '0 0 0 4px #007bff';

            // Прокручиваем к комментарию
            comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        document.addEventListener('keydown', (e) => {
            // Игнорируем, если фокус в поле ввода
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const comments = document.querySelectorAll('.exler-new-comment');
            if (comments.length === 0) return;

            // j или о (русская) - следующий комментарий
            if (e.key === 'j' || e.key === 'о') {
                e.preventDefault();
                const nextIndex = currentNavIndex + 1;
                if (nextIndex < comments.length) {
                    scrollToComment(nextIndex);
                }
            }
            // k или л (русская) - предыдущий комментарий
            else if (e.key === 'k' || e.key === 'л') {
                e.preventDefault();
                const prevIndex = currentNavIndex - 1;
                if (prevIndex >= 0) {
                    scrollToComment(prevIndex);
                } else if (currentNavIndex === -1 && comments.length > 0) {
                    // Если ещё не начали навигацию, k/л переходит к последнему
                    scrollToComment(comments.length - 1);
                }
            }
        });
    }

    // Запускаем после загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

