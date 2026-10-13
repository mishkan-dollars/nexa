# 🎮 HIGH / LOW — QUICK START

## ЗАПУСК ИГРЫ

1. Откройте `index.html` в браузере
2. Нажмите любую кнопку для разблокировки аудио
3. Игра готова!

## 🎵 МУЗЫКА

### Переключение треков:
- **MENU** → menu.mp3 (loop)
- **PICK** → pick.m4a (один раз)
- **GAME** → game.mp3 (loop)
- **HARDDRIVE** → harddrive.mp3 (постоянно, 12%)

### Проверка:
```
1. Откройте DevTools (F12)
2. Console → проверьте ошибки аудио
3. Network → проверьте загрузку треков
```

## 🎯 ТЕСТИРОВАНИЕ

### Быстрый тест (2 минуты):
1. Открыть игру
2. [ACCEPT] task
3. HIGH_LOW.exe
4. 2 participants
5. [BEGIN EXPERIMENT]
6. Ввести число (например: 50)
7. [LOCK NUMBER]
8. ✅ Проверить: pick остановился, game запустился
9. ✅ Проверить: harddrive продолжает играть

### Тест автовыбора (15 секунд):
1. [BEGIN EXPERIMENT]
2. НЕ вводить число
3. Ждать 15 секунд
4. ✅ AUTO-SELECTION появился
5. ✅ Игра продолжилась

### Тест анимаций:
1. ✅ Boot: fadeIn + slideUp
2. ✅ Pick: timer pulse при <5 сек
3. ✅ Game: history rows slideUp
4. ✅ Result: winner glow

## 🐛 ИСПРАВЛЕННЫЕ БАГИ

1. ✅ pick.m4a loop: false
2. ✅ game.mp3 запускается после pick
3. ✅ harddrive.mp3 не останавливается
4. ✅ Input работает
5. ✅ LOCK NUMBER работает
6. ✅ Автовыбор при пустом input
7. ✅ Таймер не зависает на 0
8. ✅ Защита от двойного LOCK

## ⚙️ НАСТРОЙКИ

Открыть SETTINGS (правый верхний угол):
- Music ON/OFF
- SFX ON/OFF
- Volume 0-100%
- Fullscreen

## 📁 СТРУКТУРА

```
game/
├── index.html
├── styles.css
├── CHANGELOG.md          ← Все изменения
├── AUDIO_SYSTEM.md       ← Аудио документация
├── CHECKLIST.md          ← Чек-лист исправлений
├── assets/
│   ├── menu.mp3
│   ├── pick.m4a          ← loop: false
│   ├── game.mp3
│   ├── harddrive.mp3     ← 12%, постоянно
│   ├── sucsesfully.mp3   ← правильное имя
│   └── ...
└── js/
    ├── audio.js          ← Исправлено
    ├── game.js           ← Исправлено
    └── app.js            ← Исправлено
```

## 🎨 АНИМАЦИИ

- ✅ Flicker (CRT эффект)
- ✅ Pulse (таймер)
- ✅ SlideUp (появление элементов)
- ✅ FadeIn (плавное появление)
- ✅ Glitch (критический таймер)
- ✅ Glow (победитель, CORRECT)

## 🔊 ЗВУКИ

### Музыка:
- menu.mp3, pick.m4a, game.mp3

### SFX:
- boot.mp3, mouse.mp3, notification.mp3
- sucsesfully.mp3, error.mp3, denied.mp3, poweroff.mp3

### Фоновый:
- harddrive.mp3 (постоянный)

## ⚡ ИЗВЕСТНЫЕ ОСОБЕННОСТИ

1. **Первый клик** разблокирует аудио (браузерная защита)
2. **pick.m4a** играет один раз, не зависает
3. **harddrive.mp3** независим от музыки
4. **15 секунд** автовыбор, игра не зависает
5. **Все анимации** работают (если не prefers-reduced-motion)

## 🚀 ВСЁ РАБОТАЕТ!

Игра полностью функциональна:
- ✅ Музыка переключается корректно
- ✅ Harddrive играет постоянно
- ✅ Input работает
- ✅ Автовыбор работает
- ✅ Анимации добавлены
- ✅ LORE сохранён
- ✅ Никаких критических багов

---

**Версия:** Fixed 2026.09.19
**Статус:** ✅ READY TO PLAY
